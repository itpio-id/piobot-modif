const { clearCookie, deleteStoredGoogleSession } = require("../_lib/integrations");
const { requireRole } = require("../_lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak didukung." });
  if (!await requireRole(req, res, ["owner"])) return;
  await deleteStoredGoogleSession().catch(() => {});
  clearCookie(res, "pio_google");
  return res.status(200).json({ ok: true });
};
