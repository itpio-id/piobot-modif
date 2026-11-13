const { config, getSession } = require("./_lib/integrations");
const marketplaceHandlers = {
  shopee: require("./_lib/shopee-handler"),
  tokopedia: require("./_lib/tokopedia-handler"),
  tiktokshop: require("./_lib/tiktokshop-handler")
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const platform = String(req.query && req.query.platform || new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.get("platform") || "").toLowerCase();
  if (platform) {
    const marketplaceHandler = marketplaceHandlers[platform];
    if (!marketplaceHandler) return res.status(400).json({ error: "Platform riset tidak dikenal." });
    return marketplaceHandler(req, res);
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const google = getSession(req, "google");
  const clickupSession = getSession(req, "clickup");
  const clickupConfig = config("clickup");
  let clickupConnected = Boolean(clickupSession);
  let clickupUser = clickupSession && clickupSession.username || null;
  let clickupDisconnectable = true;
  if (clickupConfig.apiToken) {
    clickupConnected = false;
    clickupUser = null;
    clickupDisconnectable = false;
    try {
      const response = await fetch("https://api.clickup.com/api/v2/team", { headers: { Authorization: clickupConfig.apiToken } });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        clickupConnected = true;
        clickupUser = data.user && (data.user.username || data.user.email) || null;
      }
    } catch {}
  }
  return res.status(200).json({
    google: { configured: config("google").missing.length === 0, connected: Boolean(google), email: google && google.email || null },
    clickup: { configured: clickupConfig.missing.length === 0, connected: clickupConnected, user: clickupUser, disconnectable: clickupDisconnectable }
  });
};
