const { config, error, startState } = require("../_lib/integrations");

module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const cfg = config("google");
  if (cfg.missing.length) return error(res, 503, `Lengkapi environment Vercel: ${cfg.missing.join(", ")}.`);
  const state = startState(res, "google");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  }).toString();
  res.statusCode = 302;
  res.setHeader("Location", url.toString());
  return res.end();
};
