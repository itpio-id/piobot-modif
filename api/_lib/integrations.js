const crypto = require("crypto");

const APP_URL = String(process.env.APP_URL || "https://itpioassistv2.vercel.app").replace(/\/+$/, "");
const COOKIE_AGE = 60 * 60 * 24 * 45;

function cookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((out, part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    return out;
  }, {});
}

function addCookie(res, name, value, options = {}) {
  const maxAge = options.maxAge === undefined ? COOKIE_AGE : options.maxAge;
  const path = options.path || "/";
  const cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
  const current = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", current ? [].concat(current, cookie) : cookie);
}

function clearCookie(res, name, path = "/") {
  addCookie(res, name, "", { maxAge: 0, path });
}

function config(provider) {
  const integrationSecret = process.env.INTEGRATION_SECRET;
  if (provider === "google") {
    const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim() || APP_URL + "/api/auth/callback/google";
    const missing = [!process.env.GOOGLE_CLIENT_ID && "GOOGLE_CLIENT_ID", !process.env.GOOGLE_CLIENT_SECRET && "GOOGLE_CLIENT_SECRET", !integrationSecret && "INTEGRATION_SECRET"].filter(Boolean);
    return { missing, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, integrationSecret, redirectUri };
  }
  const apiToken = String(process.env.CLICKUP_API_TOKEN || "").trim();
  if (apiToken) return { missing: [], apiToken, personalToken: true, integrationSecret };
  const redirectUri = String(process.env.CLICKUP_REDIRECT_URI || "").trim() || APP_URL + "/api/clickup/callback";
  const missing = [!process.env.CLICKUP_CLIENT_ID && "CLICKUP_CLIENT_ID", !process.env.CLICKUP_CLIENT_SECRET && "CLICKUP_CLIENT_SECRET", !integrationSecret && "INTEGRATION_SECRET"].filter(Boolean);
  return { missing, clientId: process.env.CLICKUP_CLIENT_ID, clientSecret: process.env.CLICKUP_CLIENT_SECRET, integrationSecret, redirectUri, personalToken: false };
}

function callbackPath(provider) {
  try {
    return new URL(config(provider).redirectUri).pathname;
  } catch {
    return "/api/" + provider + "/callback";
  }
}
function seal(value) {
  const secret = process.env.INTEGRATION_SECRET;
  if (!secret) throw new Error("INTEGRATION_SECRET belum dikonfigurasi di Vercel.");
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function unseal(value) {
  if (!value || !process.env.INTEGRATION_SECRET) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const key = crypto.createHash("sha256").update(process.env.INTEGRATION_SECRET).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const text = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSession(req, provider) {
  const jar = cookies(req);
  return unseal(jar[provider === "google" ? "pio_google" : "pio_clickup"]);
}

function setSession(res, provider, value) {
  addCookie(res, provider === "google" ? "pio_google" : "pio_clickup", seal(value));
}

function startState(res, provider) {
  const name = provider === "google" ? "pio_google_state" : "pio_clickup_state";
  const state = crypto.randomBytes(24).toString("hex");
  addCookie(res, name, state, { maxAge: 600, path: callbackPath(provider) });
  return state;
}

function checkState(req, res, provider, givenState) {
  const name = provider === "google" ? "pio_google_state" : "pio_clickup_state";
  const expected = cookies(req)[name] || "";
  clearCookie(res, name, callbackPath(provider));
  return Boolean(expected && givenState && expected.length === givenState.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(givenState)));
}

function redirect(res, path) {
  res.statusCode = 302;
  res.setHeader("Location", `${APP_URL}${path}`);
  res.end();
}

function query(req) {
  return new URL(req.url, APP_URL).searchParams;
}

function error(res, status, message) {
  return res.status(status).json({ error: message });
}

async function googleAccessToken(req, res) {
  const session = getSession(req, "google");
  if (!session) throw new Error("Hubungkan akun Google terlebih dahulu.");
  if (session.access_token && session.expires_at > Date.now() + 60_000) return session.access_token;
  if (!session.refresh_token) throw new Error("Sesi Google berakhir. Hubungkan ulang akun Google.");
  const cfg = config("google");
  if (cfg.missing.length) throw new Error("Konfigurasi Google belum lengkap di Vercel.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: session.refresh_token, grant_type: "refresh_token" })
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) throw new Error("Sesi Google tidak dapat diperbarui. Hubungkan ulang akun Google.");
  const updated = { ...session, access_token: token.access_token, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000, refresh_token: token.refresh_token || session.refresh_token };
  setSession(res, "google", updated);
  return updated.access_token;
}

module.exports = { APP_URL, addCookie, clearCookie, config, cookies, error, getSession, googleAccessToken, query, redirect, setSession, startState, checkState, unseal };
