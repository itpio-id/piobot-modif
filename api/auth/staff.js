const crypto = require("crypto");
const { saveStaffCredential, setAuth, staffCredential, verifyAuth } = require("../_lib/auth");

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 8;

function limited(req) {
  const forwarded = req.headers["x-forwarded-for"] || "unknown";
  const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim().slice(0, 80);
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.startedAt >= WINDOW_MS) attempts.set(ip, { startedAt: now, count: 1 });
  else entry.count += 1;
  for (const [key, value] of attempts) if (now - value.startedAt >= WINDOW_MS) attempts.delete(key);
  return (attempts.get(ip)?.count || 0) > LIMIT;
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("base64url");
    crypto.pbkdf2(password, salt, 310000, 32, "sha256", (err, derived) => {
      if (err) return reject(err);
      resolve(`pbkdf2$310000$${salt}$${derived.toString("base64url")}`);
    });
  });
}

async function verifyPassword(password, encoded) {
  const [method, roundsText, salt, expectedText] = String(encoded || "").split("$");
  if (method !== "pbkdf2" || !salt || !expectedText) return false;
  const rounds = Math.min(Math.max(Number(roundsText) || 0, 100000), 600000);
  const expected = Buffer.from(expectedText, "base64url");
  return new Promise((resolve, reject) => crypto.pbkdf2(password, salt, rounds, expected.length, "sha256", (err, actual) => {
    if (err) return reject(err);
    resolve(actual.length === expected.length && crypto.timingSafeEqual(actual, expected));
  }));
}

function generateActivationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let code = "";
  for (let index = 0; index < 8; index += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak didukung." });
  if (limited(req)) return res.status(429).json({ error: "Terlalu banyak percobaan masuk. Coba lagi 15 menit." });
  const body = req.body || {};
  const action = String(body.action || "login");
  const current = await verifyAuth(req);
  try {
    if (action === "login") {
      if (current) return res.status(200).json({ ok: true, role: current.role, mustChangePassword: Boolean(current.force_change) });
      const password = String(body.password || "");
      let credential = await staffCredential();
      if (!credential) {
        const initial = String(process.env.PIOBOT_STAFF_INITIAL_PASSWORD || "");
        if (!initial || password !== initial || password.length !== 8) return res.status(401).json({ error: "Kode Admin tidak valid atau akses Admin belum disetel oleh pemilik." });
        const passwordHash = await hashPassword(password);
        await saveStaffCredential(passwordHash, true);
        credential = await staffCredential();
      } else if (!await verifyPassword(password, credential.password_hash)) {
        return res.status(401).json({ error: "Kode atau sandi Admin tidak valid." });
      }
      setAuth(res, { role: "staff", force_change: Boolean(credential.force_change), credential_updated_at: credential.updated_at });
      return res.status(200).json({ ok: true, role: "staff", mustChangePassword: Boolean(credential.force_change) });
    }

    if (action === "change-password") {
      if (!current || current.role !== "staff") return res.status(403).json({ error: "Login Admin terlebih dahulu." });
      const oldPassword = String(body.oldPassword || "");
      const newPassword = String(body.newPassword || "");
      const credential = await staffCredential();
      if (!credential || (!current.force_change && !await verifyPassword(oldPassword, credential.password_hash))) return res.status(401).json({ error: "Sandi saat ini tidak cocok." });
      if (newPassword.length < 12 || newPassword.length > 128) return res.status(400).json({ error: "Kata sandi baru harus 12–128 karakter." });
      await saveStaffCredential(await hashPassword(newPassword), false);
      const updated = await staffCredential();
      setAuth(res, { role: "staff", force_change: false, credential_updated_at: updated && updated.updated_at });
      return res.status(200).json({ ok: true, role: "staff", mustChangePassword: false });
    }

    if (action === "reset") {
      if (!current || current.role !== "owner") return res.status(403).json({ error: "Hanya pemilik yang dapat mereset sandi Admin." });
      const activationCode = generateActivationCode();
      await saveStaffCredential(await hashPassword(activationCode), true);
      return res.status(200).json({ ok: true, activationCode, message: "Kode baru hanya ditampilkan sekali. Berikan langsung kepada Admin." });
    }

    if (action === "logout") {
      const cookie = "pio_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
      res.setHeader("Set-Cookie", cookie);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Aksi autentikasi tidak dikenal." });
  } catch (error) {
    console.error("Staff authentication unavailable", error && error.status || error && error.name || "unknown");
    if (error && [401, 403, 404].includes(error.status)) return res.status(503).json({ error: "Setup akses PioBot belum selesai. Jalankan migrasi Supabase dan isi secret server." });
    return res.status(503).json({ error: error && error.message || "Akses Admin belum dapat diproses." });
  }
};
