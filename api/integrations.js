const { config, getSession } = require("./_lib/integrations");

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const google = getSession(req, "google");
  const clickup = getSession(req, "clickup");
  return res.status(200).json({
    google: { configured: config("google").missing.length === 0, connected: Boolean(google), email: google && google.email || null },
    clickup: { configured: config("clickup").missing.length === 0, connected: Boolean(clickup), user: clickup && clickup.username || null }
  });
};
