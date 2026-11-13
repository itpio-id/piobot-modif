const MCP_URL = "https://mcp.brightdata.com/mcp";

function parseResponseBody(raw, contentType) {
  if (!raw) return null;
  if (contentType.includes("text/event-stream") || /^\s*(event|data):/m.test(raw)) {
    const messages = [];
    for (const block of raw.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      try { messages.push(JSON.parse(data)); } catch {}
    }
    return messages.reverse().find(message => message && (message.id !== undefined || message.result || message.error)) || null;
  }
  try { return JSON.parse(raw); } catch { return null; }
}

async function request(endpoint, payload, sessionId, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403
        ? "Token Bright Data tidak valid atau belum memiliki akses MCP."
        : response.status === 429
          ? "Batas permintaan Bright Data tercapai. Coba lagi nanti."
          : "Bright Data MCP belum dapat menyelesaikan permintaan.");
      error.status = response.status;
      throw error;
    }
    const body = parseResponseBody(raw, response.headers.get("content-type") || "");
    if (payload.id !== undefined && (!body || body.id !== undefined && body.id !== payload.id)) {
      throw new Error("Respons Bright Data MCP tidak valid.");
    }
    return { body, sessionId: response.headers.get("mcp-session-id") || sessionId };
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("Pencarian Shopee Bright Data terlalu lama. Coba lagi.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function collectText(result) {
  return (result && Array.isArray(result.content) ? result.content : [])
    .filter(item => item && item.type === "text")
    .map(item => item.text || "")
    .join("\n");
}

function parseJsonText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.search(/[\[{]/);
  if (start < 0) return null;
  for (let end = trimmed.length; end > start; end--) {
    const last = trimmed[end - 1];
    if (last !== "]" && last !== "}") continue;
    try { return JSON.parse(trimmed.slice(start, end)); } catch {}
  }
  return null;
}

function searchArgs(tool, query) {
  const schema = tool && tool.inputSchema || {};
  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const args = {};
  const queryKey = ["query", "search_query", "q"].find(key => properties[key]);
  if (!queryKey) throw new Error("Tool pencarian Bright Data tidak menyediakan kolom query.");
  args[queryKey] = `site:shopee.co.id ${query} harga Rp`;
  if (properties.engine) args.engine = "google";
  if (properties.geo_location) args.geo_location = "id";
  else if (properties.country_code) args.country_code = "ID";
  else if (properties.country) args.country = "id";
  for (const key of ["num_results", "limit", "count", "max_results"]) {
    if (properties[key]) { args[key] = Math.min(10, Number(properties[key].maximum) || 10); break; }
  }
  const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(args, key));
  if (missing.length) throw new Error("Konfigurasi tool pencarian Bright Data belum didukung.");
  return args;
}

function resultObjects(value, output = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => resultObjects(item, output, seen));
    return output;
  }
  const url = value.url || value.link || value.href;
  const title = value.title || value.name || value.product_name || value.productName;
  if (url && title) output.push(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "content" && Array.isArray(child)) {
      for (const block of child) {
        if (block && block.type === "text") {
          const parsed = parseJsonText(block.text);
          if (parsed) resultObjects(parsed, output, seen);
        }
      }
    } else if (child && typeof child === "object") resultObjects(child, output, seen);
  }
  return output;
}

function priceFrom(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/(?:Rp\.?\s*|IDR\s*)(\d[\d.,]*)/i);
  if (match) return `Rp ${match[1].replace(/\s+/g, "")}`;
  if (/^\d[\d.,]*$/.test(text)) return `Rp ${text}`;
  return "";
}

function normalizeSearchResults(result, query) {
  const text = collectText(result);
  const roots = [result && result.structuredContent, parseJsonText(text), result];
  const candidates = [];
  const seenObjects = new Set();
  roots.forEach(root => resultObjects(root, candidates, seenObjects));
  const products = [];
  const seenUrls = new Set();
  for (const item of candidates) {
    let url;
    try { url = new URL(String(item.url || item.link || item.href)); } catch { continue; }
    if (url.protocol !== "https:" || !(url.hostname === "shopee.co.id" || url.hostname.endsWith(".shopee.co.id"))) continue;
    const title = String(item.title || item.name || item.product_name || item.productName || "").trim();
    if (!title) continue;
    const snippet = String(item.description || item.snippet || item.text || item.summary || "").trim();
    const price = priceFrom(item.price || item.final_price || item.finalPrice || item.price_value || item.priceValue)
      || priceFrom(`${title} ${snippet}`);
    if (!price) continue;
    url.hash = "";
    if (seenUrls.has(url.href)) continue;
    seenUrls.add(url.href);
    products.push({
      title: title.slice(0, 240),
      price,
      url: url.href,
      rating: String(item.rating || item.stars || ""),
      sold: String(item.sold || item.sales || item.sold_count || ""),
      location: String(item.location || item.seller_location || ""),
      snippet: snippet.slice(0, 360),
      query
    });
    if (products.length >= 10) break;
  }
  return products;
}

async function searchProducts(query) {
  const token = String(process.env.BRIGHTDATA_API_TOKEN || "").trim();
  if (!token) throw new Error("Bright Data belum dikonfigurasi. Tambahkan BRIGHTDATA_API_TOKEN di environment server.");

  const endpoint = new URL(MCP_URL);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("tools", "search_engine");
  let sessionId = "";
  let requestId = 1;
  const initialized = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "piobot-shopee-search", version: "1.0.0" }
    }
  }, sessionId, 20000);
  sessionId = initialized.sessionId;
  if (!initialized.body || initialized.body.error) throw new Error("Handshake Bright Data MCP gagal.");

  const notification = await request(endpoint, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  }, sessionId, 10000);
  sessionId = notification.sessionId;

  const listed = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "tools/list",
    params: {}
  }, sessionId, 20000);
  sessionId = listed.sessionId;
  if (!listed.body || listed.body.error) throw new Error("Tidak dapat membaca tools Bright Data MCP.");
  const searchTool = (listed.body.result && listed.body.result.tools || []).find(tool => tool.name === "search_engine");
  if (!searchTool) throw new Error("Tool search_engine tidak tersedia di Bright Data MCP.");

  const called = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "tools/call",
    params: { name: searchTool.name, arguments: searchArgs(searchTool, query) }
  }, sessionId, 55000);
  if (!called.body || called.body.error) throw new Error("Pencarian Shopee melalui Bright Data gagal.");
  const result = called.body.result || {};
  if (result.isError) throw new Error("Bright Data tidak dapat mengambil listing Shopee saat ini.");
  return { products: normalizeSearchResults(result, query), text: collectText(result) };
}

module.exports = { searchProducts };
