const { config, getSession, getStoredGoogleSession } = require("./_lib/integrations");
const { verifyAuth } = require("./_lib/auth");
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
  const auth = await verifyAuth(req);
  if (!auth) return res.status(200).json({
    role: "public",
    google: { configured: false, connected: false },
    clickup: { configured: false, connected: false }
  });
  const google = getSession(req, "google");
  const storedGoogle = await getStoredGoogleSession().catch(() => null);
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
    role: auth.role,
    google: { configured: auth.role === "owner" && config("google").missing.length === 0, connected: Boolean(google || storedGoogle), email: auth.role === "owner" && (google || storedGoogle) && (google || storedGoogle).email || null },
    clickup: { configured: auth.role === "owner" && clickupConfig.missing.length === 0, connected: clickupConnected, user: auth.role === "owner" ? clickupUser : null, disconnectable: auth.role === "owner" && clickupDisconnectable }
  });
};
