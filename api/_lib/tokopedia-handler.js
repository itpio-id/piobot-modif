const { installed, searchProducts: searchLocalProducts } = require("./tokopedia-mcp");
const { searchProducts: searchApifyProducts } = require("./apify-tokopedia-mcp");

const CACHE_TTL_MS = 10 * 60 * 1000;
const resultCache = new Map();
const inFlight = new Map();

function isLocalHost(value) {
  if (!value) return false;
  const header = String(value).trim().toLowerCase();
  const host = header.startsWith("[") ? header.slice(1, header.indexOf("]")) : header.split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isLocalRequest(req) {
  if (!isLocalHost(req.headers.host) || (req.headers["x-forwarded-host"] && !isLocalHost(req.headers["x-forwarded-host"]))) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return isLocalHost(new URL(origin).hostname); }
  catch { return false; }
}

function apifyConfigured() {
  return Boolean(String(process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || "").trim());
}

function cacheKey(query) {
  return query.toLocaleLowerCase("id-ID");
}

function cached(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt >= CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return entry.data;
}

async function searchApify(query) {
  const key = cacheKey(query);
  const hit = cached(key);
  if (hit) return { ...hit, cached: true };
  if (inFlight.has(key)) return inFlight.get(key);

  const search = searchApifyProducts(query).then(result => {
    const data = {
      query,
      products: Array.isArray(result.products) ? result.products : [],
      researchedAt: new Date().toISOString(),
      source: "Tokopedia Apify MCP",
      provider: "Apify MCP"
    };
    resultCache.set(key, { savedAt: Date.now(), data });
    if (resultCache.size > 150) resultCache.delete(resultCache.keys().next().value);
    return data;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, search);
  return search;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    if (apifyConfigured()) return res.status(200).json({ configured: true, localOnly: false, readOnly: true, remote: true, provider: "Apify MCP" });
    const local = isLocalRequest(req);
    const localConfigured = local && installed();
    return res.status(200).json({
      configured: localConfigured,
      localOnly: local,
      readOnly: true,
      remote: false,
      provider: localConfigured ? "Tokopedia MCP lokal" : "Apify MCP",
      setupRequired: !localConfigured,
      setupVariable: "APIFY_API_TOKEN"
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metode tidak didukung." });
  }

  const query = String(req.body && req.body.query || "").trim().slice(0, 120);
  if (!query) return res.status(400).json({ error: "Masukkan nama produk untuk dicari di Tokopedia." });

  if (apifyConfigured()) {
    try {
      return res.status(200).json(await searchApify(query));
    } catch (error) {
      const status = Number(error && error.status) === 429 ? 429 : 502;
      console.error("Apify Tokopedia MCP request failed", status, error && error.name || "unknown error");
      return res.status(status).json({ error: String(error && error.message || "Apify Tokopedia belum merespons. Coba lagi.").slice(0, 240) });
    }
  }

  if (!isLocalRequest(req)) {
    return res.status(503).json({ error: "Apify Tokopedia belum dikonfigurasi. Tambahkan APIFY_API_TOKEN di environment Vercel." });
  }
  if (!installed()) return res.status(503).json({ error: "Runtime Tokopedia MCP lokal belum tersedia. Tambahkan APIFY_API_TOKEN untuk memakai koneksi cloud." });

  try {
    const result = await searchLocalProducts(query);
    return res.status(200).json({
      query,
      products: result.products,
      researchedAt: new Date().toISOString(),
      source: "Tokopedia MCP lokal",
      provider: "Tokopedia MCP lokal"
    });
  } catch (error) {
    console.error("Local Tokopedia MCP request failed", error && error.name || "unknown error");
    return res.status(502).json({ error: "Tokopedia belum merespons. Coba lagi sebentar." });
  }
};
