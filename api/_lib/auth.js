const { cookies, seal, supabaseRequest, unseal } = require("./integrations");

const OWNER_EMAIL = String(process.env.OWNER_EMAIL || "itpio@itpio.id").trim().toLowerCase();

function authSession(req) {
  const jar = cookies(req);
  const session = unseal(jar.pio_auth);
  if (!session || !session.role || Number(session.expires_at || 0) <= Date.now()) return null;
  if (session.role === "owner" && String(session.email || "").toLowerCase() === OWNER_EMAIL) return session;
  if (session.role === "staff") return session;
  return null;
}

function getAuth(req) {
  return authSession(req);
}

async function verifyAuth(req) {
  const session = authSession(req);
  if (!session) return null;
  if (session.role !== "staff") return session;
  try {
    const current = await staffCredential();
    if (!current || !session.credential_updated_at || current.updated_at !== session.credential_updated_at) return null;
    return session;
  } catch {
    return null;
  }
}

function setAuth(res, value) {
  const session = { ...value, expires_at: Date.now() + 12 * 60 * 60 * 1000 };
  const cookie = `pio_auth=${encodeURIComponent(seal(session))}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`;
  const current = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", current ? [].concat(current, cookie) : cookie);
}

async function requireRole(req, res, roles) {
  const session = await verifyAuth(req);
  if (!session) {
    res.status(401).json({ error: "Masuk ke PioBot terlebih dahulu." });
    return null;
  }
  if (session.role === "staff" && session.force_change && roles.includes("staff")) {
    res.status(403).json({ error: "Ubah kata sandi staf sebelum memakai fitur internal." });
    return null;
  }
  if (!roles.includes(session.role)) {
    res.status(403).json({ error: "Akses ini hanya tersedia untuk pemilik." });
    return null;
  }
  return session;
}

async function staffCredential() {
  const rows = await supabaseRequest("piobot_staff_credentials?staff_id=eq.primary&select=password_hash,force_change,updated_at&limit=1");
  return rows && rows[0] || null;
}

async function saveStaffCredential(passwordHash, forceChange = false) {
  return supabaseRequest("piobot_staff_credentials?on_conflict=staff_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ staff_id: "primary", password_hash: passwordHash, force_change: forceChange, updated_at: new Date().toISOString() })
  });
}

module.exports = { OWNER_EMAIL, authSession, getAuth, verifyAuth, requireRole, saveStaffCredential, setAuth, staffCredential };
