// Tiket PioAssist Fase 1 + ACC Gate untuk Owner dan PioCheck (Admin).
// Agen (n8n + Hermes) memproses tiket lewat RPC piobot_agent_* di Supabase; endpoint ini
// hanya untuk manusia: membuat tiket, melihat hasil draf, dan memberi ACC / revisi / tolak.
const { requireRole } = require("./_lib/auth");
const { supabaseRequest } = require("./_lib/integrations");

const KINDS = {
  psdraft: "PSDraft · brief & ide konten",
  psmedia: "PSMedia · aset visual / video 10 dtk / audio",
  pspost: "PSPost · rencana posting bulanan",
  help: "PioBot · pertanyaan / bantuan"
};
const ACTIONS = { approve: "approved", revise: "revision", reject: "rejected" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["new", "processing", "awaiting_acc", "revision", "approved", "finalizing", "done", "rejected", "failed"]);

function actorOf(session) {
  return session.role === "owner" ? "owner" : "piocheck";
}

function clean(value, max) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max);
}

function ticketView(row, events) {
  return {
    id: row.id,
    agent: row.agent,
    kind: row.kind,
    kindLabel: KINDS[row.kind] || row.kind,
    title: row.title,
    request: row.request || {},
    status: row.status,
    result: row.result || null,
    revisionNote: row.revision_note || "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: (events || []).map(e => ({ actor: e.actor, action: e.action, note: e.note || "", at: e.created_at }))
  };
}

async function logEvent(ticketId, actor, action, note) {
  await supabaseRequest("piobot_ticket_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ticket_id: ticketId, actor, action, note: note || null })
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  const session = await requireRole(req, res, ["owner", "staff"]);
  if (!session) return;
  const actor = actorOf(session);

  try {
    if (req.method === "GET") {
      const params = new URL(req.url, "https://itpio.id").searchParams;
      const status = clean(params.get("status"), 20);
      const filter = STATUSES.has(status) ? "&status=eq." + status : "";
      const rows = await supabaseRequest("piobot_tickets?select=*&order=updated_at.desc&limit=100" + filter) || [];
      const ids = rows.map(r => r.id).filter(id => UUID.test(id));
      const events = ids.length
        ? await supabaseRequest("piobot_ticket_events?select=ticket_id,actor,action,note,created_at&order=created_at.asc&ticket_id=in.(" + ids.join(",") + ")") || []
        : [];
      const byTicket = new Map();
      for (const e of events) byTicket.set(e.ticket_id, [...(byTicket.get(e.ticket_id) || []), e]);
      return res.status(200).json({ kinds: KINDS, items: rows.map(r => ticketView(r, byTicket.get(r.id))) });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    if (body.action === "create") {
      const kind = clean(body.kind, 20);
      const title = clean(body.title, 200);
      const brief = clean(body.brief, 4000);
      if (!KINDS[kind]) return res.status(400).json({ error: "Jenis tiket tidak dikenal." });
      if (!title) return res.status(400).json({ error: "Judul tiket wajib diisi." });
      const request = {
        brief,
        channel: clean(body.channel, 60) || "TikTok + YouTube Shorts",
        audience: clean(body.audience, 200),
        deadline: clean(body.deadline, 40)
      };
      const rows = await supabaseRequest("piobot_tickets", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ agent: kind === "help" ? "piobot" : "piostudio", kind, title, request, created_by: actor })
      });
      const row = rows && rows[0];
      if (row) await logEvent(row.id, actor, "create");
      return res.status(201).json({ item: row && ticketView(row, []) });
    }

    if (ACTIONS[body.action]) {
      const id = clean(body.id, 36);
      if (!UUID.test(id)) return res.status(400).json({ error: "ID tiket tidak valid." });
      const note = clean(body.note, 2000);
      if (body.action === "revise" && !note) return res.status(400).json({ error: "Tulis catatan revisi agar agen tahu apa yang diubah." });
      const patch = { status: ACTIONS[body.action], updated_at: new Date().toISOString() };
      if (body.action === "revise") patch.revision_note = note;
      // Hanya tiket yang sedang menunggu ACC yang boleh diputuskan (cek di query = atomik).
      const rows = await supabaseRequest("piobot_tickets?id=eq." + id + "&status=eq.awaiting_acc", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch)
      });
      if (!rows || !rows.length) return res.status(409).json({ error: "Tiket ini tidak sedang menunggu ACC." });
      await logEvent(id, actor, "acc:" + body.action, note);
      return res.status(200).json({ item: ticketView(rows[0], []) });
    }

    return res.status(400).json({ error: "Aksi tidak dikenal." });
  } catch (error) {
    console.error("Tickets backend unavailable", error && error.status || error && error.name || "unknown");
    if (error && error.status === 404) return res.status(503).json({ error: "Migrasi supabase/pioassist_phase1.sql belum dijalankan." });
    return res.status(503).json({ error: "Tiket belum tersambung ke database server." });
  }
};
