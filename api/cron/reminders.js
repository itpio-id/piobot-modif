const webpush = require("web-push");
const { googleAccessToken, supabaseConfig, supabaseRequest } = require("../_lib/integrations");

const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TZ = "Asia/Jakarta";

function allowed(req) {
  const secret = String(process.env.CRON_SECRET || "");
  const given = String(req.headers.authorization || "");
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return Boolean(secret && a.length === b.length && require("crypto").timingSafeEqual(a, b));
}

function jakartaParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function localDateToUtc(year, month, day, hour = 0) {
  // Asia/Jakarta is UTC+7 and has no daylight-saving transition.
  return new Date(Date.UTC(year, month - 1, day, hour - 7));
}

async function getCalendar(access, start, end) {
  const url = new URL(CALENDAR);
  url.search = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "100" }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Google Calendar gagal dibaca.");
  return data.items || [];
}

async function reserveNotice(key, kind, eventId) {
  try {
    await supabaseRequest("piobot_notification_log", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ dedupe_key: key, kind, event_id: eventId || null })
    });
    return true;
  } catch (error) {
    if (error && (error.status === 409 || error.status === 23505)) return false;
    throw error;
  }
}

async function removeNotice(key) {
  await supabaseRequest("piobot_notification_log?dedupe_key=eq." + encodeURIComponent(key), { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

async function sendToOwner(subscriptionRows, key, kind, eventId, payload) {
  const reserved = await reserveNotice(key, kind, eventId);
  if (!reserved) return false;
  let sent = false;
  for (const row of subscriptionRows) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent = true;
    } catch (error) {
      const status = Number(error && error.statusCode || 0);
      if ([404, 410].includes(status)) {
        await supabaseRequest("piobot_push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
      }
    }
  }
  if (!sent) await removeNotice(key);
  return sent;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method tidak didukung." });
  if (!allowed(req)) return res.status(401).json({ error: "Cron tidak terautentikasi." });
  const vapidPublic = String(process.env.VAPID_PUBLIC_KEY || "");
  const vapidPrivate = String(process.env.VAPID_PRIVATE_KEY || "");
  const database = supabaseConfig();
  if (!database.url || !database.key || !vapidPublic || !vapidPrivate) return res.status(200).json({ ok: true, configured: false, sent: 0 });
  try {
    webpush.setVapidDetails(String(process.env.VAPID_SUBJECT || "mailto:itpio@itpio.id"), vapidPublic, vapidPrivate);
    const rows = await supabaseRequest("piobot_push_subscriptions?select=endpoint,subscription");
    if (!rows || !rows.length) return res.status(200).json({ ok: true, sent: 0, reason: "Belum ada perangkat pemilik yang berlangganan." });
    const now = new Date();
    const access = await googleAccessToken({ headers: {} }, null);
    const horizon = await getCalendar(access, new Date(now.getTime() - 2 * 60_000), new Date(now.getTime() + 2 * 60 * 60_000));
    let sent = 0;

    for (const event of horizon) {
      const startText = event.start && event.start.dateTime;
      if (!startText) continue;
      const start = new Date(startText);
      const minutes = (start.getTime() - now.getTime()) / 60_000;
      if (minutes < 55 || minutes > 65) continue;
      const key = `event:${event.id}:${start.toISOString()}`;
      const title = event.summary || "Acara kalender";
      if (await sendToOwner(rows, key, "event-reminder", event.id, {
        title: "Pengingat acara satu jam lagi",
        body: `${title} · ${start.toLocaleString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })} WIB`,
        url: "/"
      })) sent += 1;
    }

    const local = jakartaParts(now);
    if (local.weekday === "Sun" && local.hour === "19" && local.minute === "00") {
      const year = Number(local.year), month = Number(local.month), day = Number(local.day);
      const nextMonday = new Date(Date.UTC(year, month - 1, day + 1));
      const weekEnd = new Date(nextMonday.getTime() + 7 * 86400000);
      const weekEvents = await getCalendar(access, localDateToUtc(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate()), localDateToUtc(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth() + 1, weekEnd.getUTCDate()));
      const agenda = weekEvents.slice(0, 8).map(event => {
        const value = event.start && (event.start.dateTime || event.start.date);
        const date = value ? new Date(value) : null;
        return date ? `${date.toLocaleDateString("id-ID", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })} ${date.toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })} · ${event.summary || "Tanpa judul"}` : event.summary || "Tanpa judul";
      });
      const key = `weekly:${local.year}-${local.month}-${local.day}`;
      if (await sendToOwner(rows, key, "weekly-summary", null, {
        title: "Agenda tim minggu ini",
        body: agenda.length ? agenda.join("\n").slice(0, 1500) : "Belum ada acara terjadwal untuk Senin–Minggu mendatang.",
        url: "/"
      })) sent += 1;
    }
    return res.status(200).json({ ok: true, sent });
  } catch (error) {
    console.error("Reminder cron failed", error && error.status || error && error.name || "unknown");
    return res.status(503).json({ error: "Pengingat belum dapat diproses. Periksa koneksi Google dan setup server." });
  }
};
