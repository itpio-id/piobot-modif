const { clearCookie } = require("../_lib/integrations");

module.exports = function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak didukung." });
  clearCookie(res, "pio_google");
  return res.status(200).json({ ok: true });
};
