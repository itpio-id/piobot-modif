const { clearCookie } = require("../_lib/integrations");
const { requireRole } = require("../_lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak didukung." });
  if (!await requireRole(req, res, ["owner"])) return;
  clearCookie(res, "pio_clickup");
  return res.status(200).json({ ok: true });
};
