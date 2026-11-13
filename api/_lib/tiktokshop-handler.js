const API_URL = "https://api.nexscope.ai/api/skill-api/v1/skills/tiktok-product-search/run";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 1000;
const REQUEST_LIMIT = 1;
const requestTimes = new Map();
const resultCache = new Map();

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

function configured() {
  return Boolean(process.env.NEXSCOPE_API_KEY && String(process.env.NEXSCOPE_TIKTOK_ENABLED || "").toLowerCase() === "true");
}

function clientId(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || "local").split(",")[0].trim().slice(0, 80);
}

function rateLimited(req) {
  const now = Date.now();
  for (const [key, timestamp] of requestTimes) if (now - timestamp >= REQUEST_WINDOW_MS) requestTimes.delete(key);
  const id = clientId(req);
  const previous = requestTimes.get(id) || 0;
  if (now - previous < REQUEST_WINDOW_MS) return true;
  requestTimes.set(id, now);
  return false;
}

function formatPrice(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const code = String(currency || "IDR").toUpperCase();
  const formatted = Math.round(amount).toLocaleString("id-ID");
  return code === "IDR" || code === "RP" ? `Rp ${formatted}` : `${code} ${amount.toLocaleString("id-ID")}`;
}

function hasNumber(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

function dateLabel(product) {
  const raw = product.availableDate || product.firstCrawlDt || "";
  if (!raw) return "";
  const value = String(raw);
  if (/^\d{8}$/.test(value)) return `${value.slice(6, 8)}-${value.slice(4, 6)}-${value.slice(0, 4)}`;
  return value;
}

function normalizeProducts(payload) {
  const result = payload && payload.data && typeof payload.data === "object" ? payload.data : payload;
  const products = Array.isArray(result && result.products) ? result.products : Array.isArray(result && result.data) ? result.data : [];
  return products.slice(0, 10).map(product => {
    const currency = product.currency || "IDR";
    let price = formatPrice(product.price, currency) || formatPrice(product.spuAvgPrice, currency);
    const min = formatPrice(product.minPrice, currency);
    const max = formatPrice(product.maxPrice, currency);
    if (!price && min && max) price = min === max ? min : `${min} – ${max}`;
    const details = [
      product.categoryName ? `Kategori ${product.categoryName}` : "",
      hasNumber(product.totalSaleCnt) ? `Terjual ${Number(product.totalSaleCnt).toLocaleString("id-ID")}` : "",
      hasNumber(product.totalSale30dCnt) ? `30 hari ${Number(product.totalSale30dCnt).toLocaleString("id-ID")}` : "",
      hasNumber(product.productRating) && Number(product.productRating) > 0 ? `Rating ${product.productRating}` : "",
      hasNumber(product.reviewCount) && Number(product.reviewCount) > 0 ? `${Number(product.reviewCount).toLocaleString("id-ID")} ulasan` : "",
      hasNumber(product.productCommissionRate) && Number(product.productCommissionRate) > 0 ? `Komisi ${(Number(product.productCommissionRate) * 100).toLocaleString("id-ID")}%` : ""
    ].filter(Boolean);
    const specs = Array.isArray(product.salePropsInfo)
      ? product.salePropsInfo.map(item => typeof item === "string" ? item : item && typeof item === "object" ? Object.values(item).filter(Boolean).join(": ") : "").filter(Boolean).slice(0, 5)
      : [];
    return {
      productId: String(product.productId || product.id || ""),
      title: String(product.productName || product.title || "Produk TikTok Shop").slice(0, 240),
      url: String(product.productUrl || product.productPageUrl || product.tiktokUrl || product.url || ""),
      price,
      currency: String(currency),
      snippet: details.join(" · "),
      specs,
      availableDate: dateLabel(product),
      imageUrl: String(product.imageUrl || product.coverUrl || "")
    };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!isLocalRequest(req)) return res.status(403).json({ error: "Data TikTok Shop berbayar hanya tersedia dari PioBot lokal di PC ini." });

  if (req.method === "GET") {
    return res.status(200).json({ configured: configured(), localOnly: true, readOnly: true, region: "ID", creditsPerCall: 10 });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metode tidak didukung." });
  }
  if (!configured()) return res.status(503).json({ error: "API TikTok Nexscope belum diaktifkan. Atur NEXSCOPE_API_KEY dan NEXSCOPE_TIKTOK_ENABLED=true di .env.local." });

  const query = String(req.body && req.body.query || "").trim().slice(0, 120);
  if (!query) return res.status(400).json({ error: "Masukkan nama produk untuk dicari di TikTok Shop." });

  const cacheKey = query.toLocaleLowerCase("id-ID");
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return res.status(200).json({ ...cached.data, cached: true });
  if (rateLimited(req)) return res.status(429).json({ error: "Untuk menghemat kredit Nexscope, tunggu 1 menit sebelum riset TikTok Shop berikutnya." });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NEXSCOPE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: query, pageSize: 10, region: "ID", pageNumber: 1 }),
      signal: controller.signal
    });
    const raw = await upstream.text();
    let payload;
    try { payload = JSON.parse(raw); } catch { payload = null; }
    if (!upstream.ok) {
      const message = upstream.status === 401 ? "API key Nexscope tidak valid." : upstream.status === 403 ? "Akun Nexscope belum memiliki akses ke API TikTok Product Search." : upstream.status === 429 ? "Batas atau kredit API Nexscope tercapai." : "Nexscope belum dapat menyelesaikan pencarian TikTok Shop.";
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: message });
    }
    const businessCode = payload && (payload.code !== undefined ? payload.code : payload.errcode);
    if (!payload || (businessCode !== undefined && ![0, 200, "0", "200"].includes(businessCode))) {
      return res.status(502).json({ error: String(payload && (payload.msg || payload.message || payload.errmsg) || "Respons API TikTok tidak valid.").slice(0, 240) });
    }
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    const response = {
      query,
      products: normalizeProducts(payload),
      total: Number(data.total) || 0,
      creditsUsed: Number(data.costToken) || null,
      researchedAt: new Date().toISOString(),
      source: "Nexscope TikTok Shop"
    };
    resultCache.set(cacheKey, { savedAt: Date.now(), data: response });
    if (resultCache.size > 100) {
      const oldestKey = resultCache.keys().next().value;
      resultCache.delete(oldestKey);
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error("Nexscope TikTok product search failed", error && error.name || "unknown error");
    return res.status(502).json({ error: error && error.name === "AbortError" ? "Pencarian TikTok Shop Nexscope terlalu lama. Coba lagi nanti." : "Tidak dapat menghubungi Nexscope." });
  } finally {
    clearTimeout(timer);
  }
};
