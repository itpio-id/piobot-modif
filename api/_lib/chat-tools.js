const { googleAccessToken, supabaseRequest } = require("./integrations");
const runResearch = require("./research");

const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const definitions = [
  { name: "search_market_prices", description: "Cari listing publik terbaru di Shopee, Tokopedia, dan TikTok Shop. Gunakan saat pengguna meminta riset atau perbandingan harga.", input_schema: { type: "object", properties: { query: { type: "string", description: "Nama produk dan spesifikasi untuk dicari" } }, required: ["query"] } },
  { name: "get_calendar_events", description: "Baca agenda kalender pemilik untuk minggu ini. Hanya pemilik yang boleh menggunakan tool ini.", input_schema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 14 } } } },
  { name: "propose_calendar_event", description: "Susun usulan acara. Tool ini tidak menulis kalender; pengguna harus menekan tombol konfirmasi terpisah.", input_schema: { type: "object", properties: { title: { type: "string" }, start: { type: "string", description: "Tanggal/waktu ISO 8601" }, end: { type: "string", description: "Tanggal/waktu ISO 8601" }, description: { type: "string" }, timeZone: { type: "string" } }, required: ["title", "start", "end"] } },
  { name: "get_clickup_lists", description: "Lihat daftar ClickUp yang tersedia agar pemilik atau reviewer dapat memilih tujuan task draf.", input_schema: { type: "object", properties: {} } },
  { name: "prepare_content_draft", description: "Siapkan konten PioStudio/PioGrowth sebagai draf Drive dan task ClickUp. Tool ini hanya menyiapkan tindakan; tulis setelah tombol konfirmasi ditekan.", input_schema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, taskDescription: { type: "string" }, listId: { type: "string", description: "ID list ClickUp yang dipilih pengguna; jika belum dipilih, tanyakan dulu." } }, required: ["title", "content"] } },
  { name: "prepare_invoice_draft", description: "Siapkan data draf invoice PioSales setelah stok fisik, model/spek, modal+biaya, pelanggan, dan persetujuan pemilik dikonfirmasi. Harga listing marketplace bukan bukti stok atau modal.", input_schema: { type: "object", properties: { category: { type: "string" }, itemName: { type: "string" }, specifications: { type: "string" }, condition: { type: "string" }, quantity: { type: "integer", minimum: 1 }, supplierCost: { type: "number", minimum: 0 }, additionalCosts: { type: "number", minimum: 0 }, customerName: { type: "string" }, customerPhone: { type: "string" }, customerAddress: { type: "string" }, customerEmail: { type: "string" }, stockConfirmed: { type: "boolean" }, customerConfirmed: { type: "boolean" } }, required: ["category", "itemName", "quantity", "supplierCost", "stockConfirmed", "customerConfirmed"] } },
  { name: "propose_markup_update", description: "Siapkan perubahan markup kategori. Tidak menyimpan sampai pemilik menekan tombol konfirmasi.", input_schema: { type: "object", properties: { category: { type: "string" }, markupPercent: { type: "number", minimum: 0, maximum: 500 } }, required: ["category", "markupPercent"] } }
];

function capturedResponse() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
}

async function getEvents(req, res, days) {
  const access = await googleAccessToken(req, res);
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const parts = Object.fromEntries(local.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const offset = (date.getUTCDay() + 6) % 7;
  const fromDate = new Date(date.getTime() - offset * 86400000);
  const from = new Date(fromDate.getTime() - 7 * 60 * 60 * 1000);
  const to = new Date(from.getTime() + 7 * 86400000);
  const url = new URL(CALENDAR);
  url.search = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "100" }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Google Calendar gagal dibaca. Saya tidak akan mengasumsikan jadwal kosong.");
  return (data.items || []).map(event => ({
    id: event.id, title: event.summary || "Tanpa judul",
    start: event.start && (event.start.dateTime || event.start.date),
    end: event.end && (event.end.dateTime || event.end.date),
    allDay: Boolean(event.start && event.start.date), url: event.htmlLink || null
  }));
}

function requireRole(context, roles) {
  if (!context.auth || !roles.includes(context.auth.role)) throw new Error(roles.includes("owner") ? "Fitur kalender dan PioSales hanya bisa digunakan pemilik." : "Masuk sebagai pemilik atau reviewer untuk memakai koneksi tim.");
}

async function runMarketResearch(query, req) {
  const response = capturedResponse();
  await runResearch({ ...req, method: "POST", body: { query, noAi: true } }, response);
  if (response.statusCode >= 400 || !response.body) throw new Error(response.body && response.body.error || "Riset harga belum berhasil.");
  return response.body;
}

async function clickupLists(req) {
  const handler = require("../clickup/tasks");
  const response = capturedResponse();
  await handler({ ...req, method: "GET" }, response);
  if (response.statusCode >= 400) throw new Error(response.body && response.body.error || "Daftar ClickUp tidak bisa dibaca.");
  return response.body;
}

async function runTool(name, input, context) {
  const { req, res, auth, pendingActions, researchResults } = context;
  if (name === "search_market_prices") {
    const query = String(input.query || "").trim().slice(0, 180);
    if (!query) return { error: "Nama produk belum diisi." };
    const result = await runMarketResearch(query, req);
    researchResults.push(result);
    return result;
  }
  if (name === "get_calendar_events") {
    requireRole(context, ["owner"]);
    const events = await getEvents(req, res, input.days || 7);
    return { events, note: "Kalender terbaca. Buffer 20% dipakai saat memeriksa usulan acara." };
  }
  if (name === "propose_calendar_event") {
    requireRole(context, ["owner"]);
    const title = String(input.title || "").trim().slice(0, 180);
    const start = new Date(input.start);
    const end = new Date(input.end);
    if (!title || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return { error: "Judul atau waktu acara belum valid. Minta tanggal, jam mulai, dan selesai yang jelas." };
    const action = { type: "calendar.create", payload: { title, start: start.toISOString(), end: end.toISOString(), description: String(input.description || "").slice(0, 6000), timeZone: String(input.timeZone || "Asia/Jakarta") } };
    pendingActions.push(action);
    return { proposed: action.payload, requiresOwnerConfirmation: true, bufferPercent: 20 };
  }
  if (name === "get_clickup_lists") {
    requireRole(context, ["owner", "staff"]);
    return await clickupLists(req);
  }
  if (name === "prepare_content_draft") {
    requireRole(context, ["owner", "staff"]);
    const title = String(input.title || "").trim().slice(0, 160);
    const content = String(input.content || "").trim().slice(0, 30000);
    if (!title || !content) return { error: "Judul dan isi draf diperlukan." };
    const lists = await clickupLists(req);
    const listId = String(input.listId || "").trim();
    if (!listId || !(lists.lists || []).some(list => String(list.id) === listId)) return { needListSelection: true, lists: lists.lists || [], note: "Minta pengguna memilih list ClickUp sebelum menyiapkan tombol penyimpanan." };
    const action = { type: "content.create", payload: { title, content, taskDescription: String(input.taskDescription || content).slice(0, 8000), listId } };
    pendingActions.push(action);
    return { prepared: true, title, destination: (lists.lists || []).find(list => String(list.id) === listId)?.name, requiresUserConfirmation: true, publishApprovalRequired: true };
  }
  if (name === "prepare_invoice_draft") {
    requireRole(context, ["owner"]);
    const category = String(input.category || "").trim().slice(0, 80);
    const missing = [];
    if (!category) missing.push("kategori produk");
    if (!String(input.itemName || "").trim()) missing.push("nama/model unit");
    if (!String(input.specifications || "").trim()) missing.push("spesifikasi yang sudah diverifikasi");
    if (!String(input.condition || "").trim()) missing.push("kondisi unit");
    if (!Number.isInteger(Number(input.quantity)) || Number(input.quantity) < 1) missing.push("jumlah");
    if (!Number.isFinite(Number(input.supplierCost)) || Number(input.supplierCost) <= 0) missing.push("modal pemasok terverifikasi");
    if (!Number.isFinite(Number(input.additionalCosts)) || Number(input.additionalCosts) < 0) missing.push("biaya terkait (isi 0 jika tidak ada)");
    if (!String(input.customerName || "").trim()) missing.push("nama pelanggan");
    if (!String(input.customerPhone || input.customerEmail || "").trim()) missing.push("nomor telepon atau email pelanggan");
    if (input.stockConfirmed !== true) missing.push("konfirmasi stok fisik");
    if (input.customerConfirmed !== true) missing.push("konfirmasi pilihan pelanggan");
    if (missing.length) return { missing, note: "Harga listing hanya referensi. Tanyakan hanya data yang belum ada." };
    const params = new URLSearchParams({ category: `eq.${category}`, select: "markup_percent", limit: "1" });
    const rows = await supabaseRequest("piobot_markup_categories?" + params.toString());
    if (!rows || !rows.length) return { missing: [`markup pemilik untuk kategori ${category}`], note: "Markup kategori belum disetel. Jangan menebak persentasenya." };
    const markupPercent = Number(rows[0].markup_percent);
    const costBase = Number(input.supplierCost) + Number(input.additionalCosts);
    const suggestedPrice = Math.ceil(costBase * (1 + markupPercent / 100));
    const payload = {
      customerName: String(input.customerName).trim(), customerPhone: String(input.customerPhone || "").trim(),
      customerEmail: String(input.customerEmail || "").trim(), customerAddress: String(input.customerAddress || "").trim(),
      itemName: String(input.itemName).trim(), specifications: String(input.specifications).trim(), condition: String(input.condition).trim(),
      quantity: Number(input.quantity), supplierCost: Number(input.supplierCost), additionalCosts: Number(input.additionalCosts),
      markupPercent, suggestedPrice, formula: `(modal pemasok + biaya terkait) × (1 + ${markupPercent}% markup)`
    };
    const action = { type: "invoice.draft", payload };
    pendingActions.push(action);
    return { prepared: true, payload, note: "Draf perlu ditinjau di PioSales. Harga ini saran, bukan harga final atau invoice terbit." };
  }
  if (name === "propose_markup_update") {
    requireRole(context, ["owner"]);
    const category = String(input.category || "").trim().slice(0, 80);
    const markupPercent = Number(input.markupPercent);
    if (!category || !Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 500) return { error: "Kategori dan markup 0–500% diperlukan." };
    const action = { type: "markup.set", payload: { category, markupPercent } };
    pendingActions.push(action);
    return { proposed: action.payload, requiresOwnerConfirmation: true };
  }
  return { error: "Tool tidak dikenali." };
}

module.exports = { definitions, capturedResponse, runTool };
