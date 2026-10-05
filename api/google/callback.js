const { checkState, config, query, redirect, setSession, error } = require("../_lib/integrations");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  const params = query(req);
  if (params.get("error")) return redirect(res, "/?integration=google&status=cancelled");
  if (!checkState(req, res, "google", params.get("state"))) return error(res, 400, "Verifikasi OAuth Google gagal. Coba hubungkan ulang.");
  const code = params.get("code");
  const cfg = config("google");
  if (!code || cfg.missing.length) return redirect(res, "/?integration=google&status=setup");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" })
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) {
      console.error("Google OAuth code exchange failed", response.status);
      return redirect(res, "/?integration=google&status=error");
    }
    let email = null;
    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (profile.ok) email = (await profile.json().catch(() => ({}))).email || null;
    setSession(res, "google", { access_token: token.access_token, refresh_token: token.refresh_token || null, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000, email });
    return redirect(res, "/?integration=google&status=connected");
  } catch {
    return redirect(res, "/?integration=google&status=error");
  }
};
