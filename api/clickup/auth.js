const { config, error, startState } = require("../_lib/integrations");

module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const cfg = config("clickup");
  if (cfg.missing.length) return error(res, 503, `Lengkapi environment Vercel: ${cfg.missing.join(", ")}.`);
  const state = startState(res, "clickup");
  const url = new URL("https://app.clickup.com/api");
  url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: "https://itpio-assist.vercel.app/api/clickup/callback", state }).toString();
  res.statusCode = 302;
  res.setHeader("Location", url.toString());
  return res.end();
};
