const { verifyAuth } = require("../_lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const auth = await verifyAuth(req);
  return res.status(200).json({
    authenticated: Boolean(auth),
    role: auth && auth.role || "public",
    email: auth && auth.role === "owner" ? auth.email : null,
    mustChangePassword: Boolean(auth && auth.role === "staff" && auth.force_change)
  });
};
