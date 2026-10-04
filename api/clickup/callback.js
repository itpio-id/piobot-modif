const { checkState, config, query, redirect, setSession, error } = require("../_lib/integrations");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const params = query(req);
  if (!checkState(req, res, "clickup", params.get("state"))) return error(res, 400, "Verifikasi OAuth ClickUp gagal. Coba hubungkan ulang.");
  const code = params.get("code");
  const cfg = config("clickup");
  if (!code || cfg.missing.length) return redirect(res, "/?integration=clickup&status=setup");
  try {
    const response = await fetch("https://api.clickup.com/api/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      console.error("ClickUp OAuth code exchange failed", response.status);
      return redirect(res, "/?integration=clickup&status=error");
    }
    let username = null;
    const teams = await fetch("https://api.clickup.com/api/v2/team", { headers: { Authorization: `Bearer ${data.access_token}` } });
    if (teams.ok) {
      const body = await teams.json().catch(() => ({}));
      username = body.user && body.user.username || null;
    }
    setSession(res, "clickup", { access_token: data.access_token, username });
    return redirect(res, "/?integration=clickup&status=connected");
  } catch {
    return redirect(res, "/?integration=clickup&status=error");
  }
};
