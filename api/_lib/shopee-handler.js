const { searchProducts: searchApifyProducts } = require("./apify-shopee-mcp");
const { searchProducts: searchBrightDataProducts } = require("./brightdata-mcp");

const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 1000;
const BRIGHTDATA_REQUEST_LIMIT = 6;
const resultCache = new Map();
const inFlight = new Map();
const requestTimes = new Map();

function apifyConfigured() {
  return Boolean(String(process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || "").trim());
}

function brightDataConfigured() {
  return Boolean(String(process.env.BRIGHTDATA_API_TOKEN || "").trim());
}

function clientId(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || "local").split(",")[0].trim().slice(0, 80);
}

function rateLimited(req, limit) {
  const now = Date.now();
  for (const [key, timestamps] of requestTimes) {
    const active = timestamps.filter(timestamp => now - timestamp < REQUEST_WINDOW_MS);
    if (active.length) requestTimes.set(key, active);
    else requestTimes.delete(key);
  }
  const key = clientId(req);
  const active = requestTimes.get(key) || [];
  if (active.length >= limit) return true;
  active.push(now);
  requestTimes.set(key, active);
  return false;
}

function cacheKey(provider, query) {
  return `${provider}:${query.toLocaleLowerCase("id-ID")}`;
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
  const key = cacheKey("apify", query);
  const hit = cached(key);
  if (hit) return { ...hit, cached: true };
  if (inFlight.has(key)) return inFlight.get(key);

  const search = searchApifyProducts(query).then(result => {
    const data = {
      query,
      products: Array.isArray(result.products) ? result.products.filter(item => item && item.price) : [],
      researchedAt: new Date().toISOString(),
      source: "Shopee Apify MCP",
      provider: "Apify MCP"
    };
    resultCache.set(key, { savedAt: Date.now(), data });
    if (resultCache.size > 150) resultCache.delete(resultCache.keys().next().value);
    return data;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, search);
  return search;
}

async function searchBrightData(query, req) {
  const key = cacheKey("brightdata", query);
  const hit = cached(key);
  if (hit) return { ...hit, cached: true };
  if (inFlight.has(key)) return inFlight.get(key);
  if (rateLimited(req, BRIGHTDATA_REQUEST_LIMIT)) {
    const error = new Error("Batas permintaan Bright Data tercapai. Tunggu sebentar sebelum mencari lagi.");
    error.status = 429;
    throw error;
  }

  const search = searchBrightDataProducts(query).then(result => {
    const data = {
      query,
      products: Array.isArray(result.products) ? result.products.filter(item => item && item.price) : [],
      researchedAt: new Date().toISOString(),
      source: "Bright Data MCP Shopee",
      provider: "Bright Data MCP"
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
    if (apifyConfigured()) return res.status(200).json({ configured: true, readOnly: true, remote: true, localOnly: false, provider: "Apify MCP", requiresShopeeLogin: false });
    if (brightDataConfigured()) return res.status(200).json({ configured: true, readOnly: true, remote: true, localOnly: false, provider: "Bright Data MCP", requiresShopeeLogin: false });
    return res.status(200).json({ configured: false, readOnly: true, remote: false, localOnly: false, provider: "Apify MCP", setupRequired: true, setupVariable: "APIFY_API_TOKEN", requiresShopeeLogin: false });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metode tidak didukung." });
  }

  const query = String(req.body && req.body.query || "").trim().slice(0, 120);
  if (!query) return res.status(400).json({ error: "Masukkan nama produk untuk dicari di Shopee." });

  if (apifyConfigured()) {
    try {
      return res.status(200).json(await searchApify(query));
    } catch (error) {
      const status = Number(error && error.status) === 429 ? 429 : 502;
      console.error("Apify Shopee MCP request failed", status, error && error.name || "unknown error");
      return res.status(status).json({ error: String(error && error.message || "Shopee Apify belum merespons. Coba lagi.").slice(0, 240) });
    }
  }

  if (brightDataConfigured()) {
    try {
      return res.status(200).json(await searchBrightData(query, req));
    } catch (error) {
      const status = Number(error && error.status) === 429 ? 429 : 502;
      console.error("Bright Data Shopee MCP request failed", status, error && error.name || "unknown error");
      return res.status(status).json({ error: String(error && error.message || "Shopee Bright Data belum merespons. Coba lagi.").slice(0, 220) });
    }
  }

  return res.status(503).json({ error: "Shopee Apify belum dikonfigurasi. Tambahkan APIFY_API_TOKEN di environment lokal atau Vercel." });
};
