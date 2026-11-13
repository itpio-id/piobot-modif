const { googleAccessToken, error } = require("../_lib/integrations");
const { requireRole } = require("../_lib/auth");

const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function requestEvents(access, timeMin, timeMax) {
  const url = new URL(CALENDAR);
  url.search = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" }).toString();
  return fetch(url, { headers: { Authorization: `Bearer ${access}` } });
}

function jakartaMinute(value) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (![
    "GET", "POST"
  ].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  if (!await requireRole(req, res, ["owner"])) return;
  try {
    const access = await googleAccessToken(req, res);
    if (req.method === "GET") {
      const now = new Date();
      let start = now;
      let end = new Date(now.getTime() + 7 * 86400000);
      const params = new URL(req.url, "https://itpioassistv2.vercel.app").searchParams;
      if (params.get("week") === "current") {
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(part => [part.type, part.value]));
        const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
        const daysSinceMonday = (date.getUTCDay() + 6) % 7;
        start = new Date(date.getTime() - daysSinceMonday * 86400000 - 7 * 60 * 60 * 1000);
        end = new Date(start.getTime() + 7 * 86400000);
      }
      const response = await requestEvents(access, start.toISOString(), end.toISOString());
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return error(res, response.status, "Tidak bisa membaca kalender Google. Hubungkan ulang akun jika izinnya berubah.");
      const events = (data.items || []).map(item => ({
        id: item.id,
        title: item.summary || "Tanpa judul",
        start: item.start && (item.start.dateTime || item.start.date),
        end: item.end && (item.end.dateTime || item.end.date),
        link: item.htmlLink || null,
        allDay: Boolean(item.start && item.start.date)
      }));
      return res.status(200).json({ events });
    }

    const body = req.body || {};
    const title = String(body.title || "").trim().slice(0, 180);
    const description = String(body.description || "").trim().slice(0, 6000);
    const start = new Date(body.start);
    const end = new Date(body.end);
    const timeZone = String(body.timeZone || "Asia/Jakarta").slice(0, 80);
    if (!title) return error(res, 400, "Isi nama acara.");
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return error(res, 400, "Pilih tanggal dan waktu mulai serta selesai yang valid.");
    }
    if (end <= start) return error(res, 400, "Waktu selesai harus setelah waktu mulai.");
    if (body.confirmed !== true) return error(res, 428, "Konfirmasi pemilik diperlukan sebelum acara ditambahkan.");
    const duration = end.getTime() - start.getTime();
    const midday = jakartaMinute(start) < 14 * 60 && jakartaMinute(end) > 11 * 60;
    if (/\b(?:service|servis|layanan|pelayanan)\b/i.test(`${title} ${description}`) && midday && duration > 2 * 60 * 60 * 1000) {
      return error(res, 400, "Blok layanan siang dibatasi maksimal 2 jam menurut Blueprint.");
    }
    const bufferMs = Math.ceil(duration * 0.2);
    const checkStart = new Date(start.getTime() - bufferMs);
    const checkEnd = new Date(end.getTime() + bufferMs);
    const overlapResponse = await requestEvents(access, checkStart.toISOString(), checkEnd.toISOString());
    if (!overlapResponse.ok) return error(res, 503, "Google Calendar gagal diperiksa. Acara tidak dibuat; coba lagi setelah koneksi pulih.");
    const overlapData = await overlapResponse.json().catch(() => ({}));
    const conflicts = (overlapData.items || []).filter(item => {
      const eventStart = new Date(item.start && (item.start.dateTime || item.start.date)).getTime();
      const eventEnd = new Date(item.end && (item.end.dateTime || item.end.date)).getTime();
      return eventStart < checkEnd.getTime() && eventEnd > checkStart.getTime();
    });
    if (conflicts.length && body.overrideConflict !== true) {
      return res.status(409).json({ error: "Waktu acara atau buffer 20% bertabrakan dengan agenda lain.", conflicts: conflicts.slice(0, 4).map(item => item.summary || "Acara lain") });
    }
    const response = await fetch(CALENDAR, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: title, description, start: { dateTime: start.toISOString(), timeZone }, end: { dateTime: end.toISOString(), timeZone } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return error(res, response.status, "Google Calendar gagal menyimpan acara. Periksa izin kalender.");
    return res.status(201).json({ event: { id: data.id, title: data.summary, start: data.start && data.start.dateTime, link: data.htmlLink } });
  } catch (e) {
    return error(res, 401, e.message || "Hubungkan akun Google terlebih dahulu.");
  }
};
