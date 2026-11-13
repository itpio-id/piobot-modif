const { installed, searchProducts } = require("./tokopedia-mcp");

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

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const local = isLocalRequest(req);
    const configured = installed();
    return res.status(200).json({
      configured,
      localOnly: local,
      readOnly: true,
      remote: configured && !local,
      provider: local ? "Tokopedia MCP lokal" : "Tokopedia MCP GitHub",
      setupRequired: !configured
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metode tidak didukung." });
  }

  const query = String(req.body && req.body.query || "").trim().slice(0, 120);
  if (!query) return res.status(400).json({ error: "Masukkan nama produk untuk dicari di Tokopedia." });

  if (!installed()) return res.status(503).json({ error: "Tokopedia MCP belum tersedia di server ini." });
  try {
    const result = await searchProducts(query);
    const provider = isLocalRequest(req) ? "Tokopedia MCP lokal" : "Tokopedia MCP GitHub";
    return res.status(200).json({
      query,
      products: result.products,
      researchedAt: new Date().toISOString(),
      source: provider,
      provider
    });
  } catch (error) {
    console.error("Tokopedia MCP request failed", error && error.name || "unknown error");
    return res.status(502).json({ error: "Tokopedia belum merespons. Coba lagi sebentar." });
  }
};
