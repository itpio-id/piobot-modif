module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  if (!publicKey) return res.status(503).json({ error: "Notifikasi browser belum disetel." });
  return res.status(200).json({ publicKey });
};
