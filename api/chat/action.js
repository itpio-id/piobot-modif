const { requireRole } = require("../_lib/auth");
const { supabaseRequest } = require("../_lib/integrations");

function capture() {
  return { statusCode: 200, body: null, setHeader() { return this; }, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; }, end(data) { this.body = data; return this; } };
}

async function invoke(handler, req) {
  const response = capture();
  await handler(req, response);
  return response;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak didukung." });
  const body = req.body || {};
  const type = String(body.type || "");
  if (body.confirmed !== true) return res.status(428).json({ error: "Tekan tombol konfirmasi terlebih dahulu." });

  const ownerOnly = ["calendar.create", "invoice.draft", "markup.set"].includes(type);
  const auth = await requireRole(req, res, ownerOnly ? ["owner"] : ["owner", "staff"]);
  if (!auth) return;
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  if (type === "calendar.create") {
    const calendar = require("../google/calendar");
    const result = await invoke(calendar, { ...req, method: "POST", body: { ...payload, confirmed: true, overrideConflict: body.overrideConflict === true } });
    return res.status(result.statusCode).json(result.body || { error: "Google Calendar gagal memproses acara." });
  }

  if (type === "content.create") {
    const title = String(payload.title || "").trim().slice(0, 160);
    const content = String(payload.content || "").trim();
    const listId = String(payload.listId || "").trim();
    if (!title || !content || content.length > 30000 || !/^[A-Za-z0-9_-]{1,80}$/.test(listId)) return res.status(400).json({ error: "Judul, isi draf, atau list ClickUp tidak valid." });
    const drive = await invoke(require("../google/drive"), { ...req, method: "POST", body: { action: "create-content-draft", title, content } });
    if (drive.statusCode >= 400 || !drive.body || !drive.body.file) return res.status(drive.statusCode).json(drive.body || { error: "Draf Drive gagal dibuat." });
    const file = drive.body.file;
    const description = [String(payload.taskDescription || content).slice(0, 7600), `Draf Google Drive: ${file.url}`].filter(Boolean).join("\n\n");
    const clickup = await invoke(require("../clickup/tasks"), { ...req, method: "POST", body: { listId, name: title, description } });
    if (clickup.statusCode >= 400 || !clickup.body || !clickup.body.task) {
      return res.status(502).json({ partial: true, file, error: "Draf tersimpan di Drive, tetapi task ClickUp gagal dibuat. Jangan ulangi sebelum memeriksa Drive." });
    }
    return res.status(201).json({ file, task: clickup.body.task, publishApprovalRequired: true });
  }

  if (type === "markup.set") {
    const category = String(payload.category || "").trim().slice(0, 80);
    const markupPercent = Number(payload.markupPercent);
    if (!category || !Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 500) return res.status(400).json({ error: "Kategori dan markup 0–500% diperlukan." });
    await supabaseRequest("piobot_markup_categories?on_conflict=category", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ category, markup_percent: markupPercent, updated_at: new Date().toISOString() })
    });
    return res.status(200).json({ ok: true, category, markupPercent });
  }

  if (type === "invoice.draft") {
    return res.status(200).json({ ok: true, payload, message: "Siap ditinjau di PioSales. Invoice belum disimpan atau diterbitkan." });
  }

  return res.status(400).json({ error: "Jenis tindakan tidak dikenal." });
};
