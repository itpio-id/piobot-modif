const { googleAccessToken, error } = require("../_lib/integrations");

const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function requestEvents(access, timeMin, timeMax) {
  const url = new URL(CALENDAR);
  url.search = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" }).toString();
  return fetch(url, { headers: { Authorization: `Bearer ${access}` } });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (![
    "GET", "POST"
  ].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  try {
    const access = await googleAccessToken(req, res);
    if (req.method === "GET") {
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 86400000);
      const response = await requestEvents(access, now.toISOString(), end.toISOString());
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
    if (!title || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      return error(res, 400, "Isi judul, waktu mulai, dan waktu selesai yang valid.");
    }
    const overlapResponse = await requestEvents(access, start.toISOString(), end.toISOString());
    if (overlapResponse.ok) {
      const overlapData = await overlapResponse.json().catch(() => ({}));
      const conflicts = (overlapData.items || []).filter(item => {
        const eventStart = new Date(item.start && (item.start.dateTime || item.start.date)).getTime();
        const eventEnd = new Date(item.end && (item.end.dateTime || item.end.date)).getTime();
        return eventStart < end.getTime() && eventEnd > start.getTime();
      });
      if (conflicts.length) return res.status(409).json({ error: "Jadwal bertabrakan dengan acara yang sudah ada.", conflicts: conflicts.slice(0, 4).map(item => item.summary || "Acara lain") });
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
