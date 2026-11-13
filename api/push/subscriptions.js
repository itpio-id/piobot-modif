const { requireRole } = require("../_lib/auth");
const { supabaseRequest } = require("../_lib/integrations");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  if (!await requireRole(req, res, ["owner"])) return;
  try {
    const params = new URL(req.url, "https://itpioassistv2.vercel.app").searchParams;
    const subscription = req.body && req.body.subscription;
    const endpoint = String(req.method === "GET" ? params.get("endpoint") || "" : req.body && (req.body.endpoint || subscription && subscription.endpoint) || "").trim();
    if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2000) return res.status(400).json({ error: "Data notifikasi browser tidak valid." });
    if (req.method === "GET") {
      const rows = await supabaseRequest("piobot_push_subscriptions?endpoint=eq." + encodeURIComponent(endpoint) + "&select=endpoint&limit=1");
      return res.status(200).json({ stored: Boolean(rows && rows.length) });
    }
    if (req.method === "DELETE") {
      await supabaseRequest("piobot_push_subscriptions?endpoint=eq." + encodeURIComponent(endpoint), { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return res.status(200).json({ ok: true });
    }
    if (!subscription || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) return res.status(400).json({ error: "Browser tidak memberikan kunci push yang valid." });
    await supabaseRequest("piobot_push_subscriptions?on_conflict=endpoint", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ endpoint, subscription, user_agent: String(req.headers["user-agent"] || "").slice(0, 500), updated_at: new Date().toISOString() })
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Push subscription storage unavailable", error && error.status || error && error.name || "unknown");
    return res.status(503).json({ error: error && error.message || "Notifikasi browser belum dapat disimpan." });
  }
};
