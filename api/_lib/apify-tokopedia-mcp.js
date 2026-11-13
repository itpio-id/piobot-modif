const MCP_URL = "https://mcp.apify.com/?tools=call-actor";
const ACTOR_ID = "neverempty/tokopedia-search-price-monitor";

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

function responseError(status) {
  const error = new Error(status === 401 || status === 403
    ? "Token Apify tidak valid atau akun belum memiliki akses untuk menjalankan Actor."
    : status === 429
      ? "Batas permintaan Apify tercapai. Coba lagi nanti."
      : "Apify MCP belum dapat menyelesaikan permintaan Tokopedia.");
  error.status = status;
  return error;
}

async function request(endpoint, payload, token, sessionId, timeoutMs, deadline, protocolVersion = "2024-11-05") {
  const remainingMs = Math.min(timeoutMs, deadline - Date.now());
  if (remainingMs <= 0) throw new Error("Waktu pencarian Tokopedia melalui Apify habis.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
      headers["MCP-Protocol-Version"] = protocolVersion;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw responseError(response.status);
    const body = parseResponseBody(raw, response.headers.get("content-type") || "");
    if (payload.id !== undefined && (!body || body.id !== undefined && body.id !== payload.id)) {
      throw new Error("Respons Apify MCP tidak valid.");
    }
    return { body, sessionId: response.headers.get("mcp-session-id") || sessionId };
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("Pencarian Tokopedia melalui Apify terlalu lama.");
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

function formatPrice(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  }
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/(?:Rp\.?\s*|IDR\s*)(\d[\d.,]*)/i);
  if (match) return `Rp ${match[1].replace(/\s+/g, "")}`;
  if (/^\d[\d.,]*$/.test(text)) return `Rp ${text}`;
  return "";
}

function extractResult(result) {
  if (result && result.structuredContent) return result.structuredContent;
  return parseJsonText(collectText(result)) || {};
}

function normalizeProducts(items) {
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || item.status && item.status !== "ok") return false;
    try {
      const host = new URL(String(item.url || "")).hostname.toLowerCase();
      return (host === "tokopedia.com" || host.endsWith(".tokopedia.com")) && Boolean(item.title && formatPrice(item.formattedPrice || item.price));
    } catch { return false; }
  }).map(item => {
    const originalPrice = formatPrice(item.originalPrice);
    const discountPercent = Number(item.discountPercent);
    const details = [
      item.shopName ? `Toko ${String(item.shopName).slice(0, 100)}` : "",
      item.shopCity ? String(item.shopCity).slice(0, 80) : "",
      item.rating ? `Rating ${item.rating}` : "",
      item.soldText ? `Terjual ${String(item.soldText).slice(0, 80)}` : "",
      Number.isFinite(discountPercent) && discountPercent > 0 ? `Diskon ${discountPercent}%` : "",
      originalPrice ? `Harga awal ${originalPrice}` : ""
    ].filter(Boolean);
    return {
      title: String(item.title).slice(0, 240),
      price: formatPrice(item.formattedPrice || item.price),
      originalPrice,
      discountPercent: Number.isFinite(discountPercent) && discountPercent > 0 ? discountPercent : null,
      productId: String(item.itemId || ""),
      url: String(item.url),
      rating: String(item.rating || ""),
      shop: String(item.shopName || ""),
      sold: String(item.soldText || ""),
      snippet: details.join(" · "),
      imageUrl: String(item.imageUrl || "")
    };
  });
}

async function runActor(actor, input, { waitSecs = 40 } = {}) {
  const token = String(process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || "").trim();
  if (!token) throw new Error("Apify belum dikonfigurasi. Tambahkan APIFY_API_TOKEN ke environment server.");

  const endpoint = new URL(MCP_URL);
  const deadline = Date.now() + 55_000;
  let sessionId = "";
  let requestId = 1;

  const initialized = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "piobot-marketplace-search", version: "1.0.0" }
    }
  }, token, sessionId, 10000, deadline);
  sessionId = initialized.sessionId;
  if (!initialized.body || initialized.body.error) throw new Error("Handshake Apify MCP gagal.");
  const protocolVersion = initialized.body.result && initialized.body.result.protocolVersion || "2024-11-05";

  await request(endpoint, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  }, token, sessionId, 5000, deadline, protocolVersion);

  const listed = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "tools/list",
    params: {}
  }, token, sessionId, 10000, deadline, protocolVersion);
  if (!listed.body || listed.body.error) throw new Error("Tidak dapat membaca tools Apify MCP.");
  const tools = listed.body.result && listed.body.result.tools || [];
  if (!tools.some(tool => tool.name === "call-actor")) throw new Error("Tool call-actor tidak tersedia di Apify MCP.");
  if (!tools.some(tool => tool.name === "get-dataset-items")) throw new Error("Tool get-dataset-items tidak tersedia di Apify MCP.");

  const called = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "tools/call",
    params: {
      name: "call-actor",
      arguments: { actor, input, waitSecs }
    }
  }, token, sessionId, 45000, deadline, protocolVersion);
  if (!called.body || called.body.error) throw new Error("Pencarian Actor Apify gagal dijalankan.");
  const runResult = called.body.result || {};
  if (runResult.isError) throw new Error(collectText(runResult).slice(0, 240) || "Actor Apify gagal dijalankan.");
  const run = extractResult(runResult);
  if (run.status !== "SUCCEEDED") throw new Error(`Actor Apify belum selesai (status ${String(run.status || "tidak diketahui")}).`);
  const datasetId = run.storages && run.storages.datasets && run.storages.datasets.default && run.storages.datasets.default.id;
  if (!datasetId) throw new Error("Actor Apify selesai tetapi dataset hasilnya tidak ditemukan.");

  const dataset = await request(endpoint, {
    jsonrpc: "2.0",
    id: requestId++,
    method: "tools/call",
    params: { name: "get-dataset-items", arguments: { datasetId, limit: 1000, clean: true } }
  }, token, sessionId, 15000, deadline, protocolVersion);
  if (!dataset.body || dataset.body.error) throw new Error("Tidak dapat membaca hasil pencarian dari Apify.");
  const datasetResult = dataset.body.result || {};
  if (datasetResult.isError) throw new Error("Dataset hasil pencarian Apify tidak dapat dibaca.");
  const output = extractResult(datasetResult);
  return { items: Array.isArray(output.items) ? output.items : [], run, text: collectText(datasetResult) };
}

async function searchProducts(query) {
  const result = await runActor(ACTOR_ID, {
    searchQueries: [query],
    sort: "relevance",
    includeSponsored: true,
    onlyMatchingTitles: false
  });
  return { products: normalizeProducts(result.items), text: result.text };
}

module.exports = { runActor, searchProducts };
