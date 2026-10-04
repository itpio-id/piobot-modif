const API_URL = "https://api.kie.ai/claude/v1/messages";
const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 3000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const requestCounts = new Map();

const SYSTEM_PROMPT = [
  "Identitasmu adalah PioBot, Karyawan Digital ITPIO di Surabaya–Sidoarjo. Selalu berbicara sebagai PioBot. Jangan memperkenalkan diri sebagai Claude, Claude Code, Anthropic, GPT, atau model AI lain. Jika ditanya siapa dirimu, jelaskan singkat bahwa kamu PioBot dan sebutkan kemampuan yang relevan.",
  "Bantu pengguna secara praktis untuk chat layanan, menyusun jadwal dan reminder, membuat atau merevisi materi kelas AI, nota dan penawaran, riset harga serta spesifikasi laptop/HP/tablet, konten foto/video, website, aplikasi Windows, dan ide SaaS.",
  "Gunakan bahasa Indonesia yang natural, hangat, profesional, dan tidak kaku; ikuti bahasa pengguna bila mereka memilih bahasa lain. Hindari jawaban generik dan berulang. Gunakan konteks percakapan, beri hasil yang langsung bisa dipakai, dan sesuaikan panjang jawaban dengan permintaan.",
  "Jika informasi penting kurang, tanyakan hanya detail yang dibutuhkan. Untuk tugas seperti jadwal, materi, nota, caption, atau spesifikasi, susun draft yang rapi dan tandai asumsi penting.",
  "Jangan pernah mengaku telah melakukan tindakan eksternal melalui chat. Acara kalender, penyimpanan file Drive, dan task ClickUp dilakukan lewat fitur workspace setelah akun tersambung dan pengguna menekan tombol konfirmasi.",
  "Untuk harga pasar atau informasi perangkat terkini, jangan mengarang harga, spesifikasi, atau sumber. Chat tidak memiliki pencarian web langsung; fitur Riset Harga membuka Google, Tokopedia, dan Shopee di browser. Jika pengguna memberi tautan atau data, bantu bandingkan dan ringkas dengan jelas. Prioritaskan pasar Indonesia, rupiah, kondisi barang, tanggal, dan spesifikasi yang relevan."
].join(" ");

function isRateLimited(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || "unknown")
    .split(",")[0].trim().slice(0, 80);
  const now = Date.now();
  let record = requestCounts.get(clientIp);
  if (!record || now - record.startedAt >= RATE_WINDOW_MS) {
    record = { startedAt: now, count: 0 };
    requestCounts.set(clientIp, record);
  }
  if (requestCounts.size > 2000) {
    for (const [ip, entry] of requestCounts) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) requestCounts.delete(ip);
    }
  }
  record.count += 1;
  return record.count > RATE_LIMIT;
}

function extractText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n").trim();
  }
  if (!value || typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content"]) {
    const text = extractText(value[key]);
    if (text) return text;
  }
  return "";
}

function getAssistantReply(data) {
  const payload = data && data.data && typeof data.data === "object" ? data.data : data;
  const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
  const message = choice && choice.message;
  return extractText(message && (message.content ?? message.text)) ||
    extractText(choice && choice.text) ||
    extractText(payload && payload.output_text) ||
    extractText(payload && payload.output) ||
    extractText(payload && payload.content);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({ configured: Boolean(process.env.KIE_API_KEY) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method tidak didukung." });
  }
  if (isRateLimited(req)) {
    return res.status(429).json({ error: "Batas demo tercapai. Tunggu satu menit lalu coba lagi." });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "API key belum dikonfigurasi di environment Vercel." });
  }

  const rawMessages = req.body && req.body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: "Format percakapan tidak valid. Muat ulang halaman dan coba lagi." });
  }

  const messages = [];
  for (const item of rawMessages) {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      return res.status(400).json({ error: "Format pesan tidak valid." });
    }
    const content = item.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ error: "Pesan kosong atau terlalu panjang (maksimal 3.000 karakter)." });
    }
    messages.push({ role: item.role, content });
  }
  if (messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Pesan terakhir harus berasal dari pengguna." });
  }

  const payload = {
    model: MODEL,
    system: SYSTEM_PROMPT,
    messages,
    max_tokens: 4096,
    stream: false
  };

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const rawBody = await upstream.text();
    let data = {};
    try { data = JSON.parse(rawBody); } catch {}
    if (!upstream.ok) {
      const status = upstream.status;
      console.error("KIE API request failed with status", status);
      if (status === 401 || status === 403) {
        return res.status(502).json({ error: "KIE menolak API key atau akses Claude Opus 5.5. Periksa akses model dan secret KIE_API_KEY di Vercel." });
      }
      if (status === 429) {
        return res.status(503).json({ error: "Kuota atau batas permintaan KIE sedang tercapai. Coba lagi nanti." });
      }
      return res.status(502).json({ error: "Layanan KIE sedang bermasalah. Coba lagi sebentar." });
    }

    const providerCode = Number(data && data.code);
    if (data && data.code !== undefined && providerCode !== 200 && providerCode !== 0) {
      console.error("KIE returned provider code", providerCode);
      if (providerCode === 401 || providerCode === 403) {
        return res.status(502).json({ error: "API key KIE tersimpan, tetapi belum diizinkan memakai Claude Opus 5.5. Aktifkan akses model ini di KIE atau pilih model yang tersedia untuk akunmu." });
      }
      if (providerCode === 429) {
        return res.status(503).json({ error: "Kuota atau batas permintaan KIE sedang tercapai. Coba lagi nanti." });
      }
      return res.status(502).json({ error: "KIE menolak permintaan (kode " + providerCode + "). Periksa akses model dan saldo akun KIE." });
    }

    const payloadData = data && data.data && typeof data.data === "object" ? data.data : data;
    const choice = payloadData && Array.isArray(payloadData.choices) ? payloadData.choices[0] : null;
    const message = choice && choice.message;
    const reply = getAssistantReply(data);
    if (!reply) {
      console.warn("KIE returned no assistant text", {
        topLevelKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 20) : [],
        payloadKeys: payloadData && typeof payloadData === "object" ? Object.keys(payloadData).slice(0, 20) : [],
        messageKeys: message && typeof message === "object" ? Object.keys(message).slice(0, 20) : [],
        contentType: message && typeof message.content,
        contentIsArray: Boolean(message && Array.isArray(message.content)),
        contentBlockTypes: message && Array.isArray(message.content) ? message.content.map(part => part && part.type).slice(0, 10) : [],
        finishReason: choice && choice.finish_reason,
        responseStatus: payloadData && payloadData.status,
        contentType: upstream.headers.get("content-type"),
        bodyLength: rawBody.length,
        usage: payloadData && payloadData.usage ? {
          completionTokens: payloadData.usage.completion_tokens,
          outputTokens: payloadData.usage.output_tokens
        } : undefined
      });
      return res.status(502).json({ error: "KIE mengirim respons tanpa teks. Periksa format dan akses model Claude Opus 5.5 di akun KIE." });
    }

    const sources = (Array.isArray(message && message.annotations) ? message.annotations : [])
      .map(annotation => annotation.url_citation || annotation)
      .filter(source => source && typeof source.url === "string" && /^https?:\/\//i.test(source.url))
      .map(source => ({ title: typeof source.title === "string" ? source.title : "Sumber web", url: source.url }))
      .slice(0, 4);

    return res.status(200).json({ reply: reply.trim(), sources });
  } catch (error) {
    console.error("KIE API connection failed", error && error.name ? error.name : "unknown error");
    return res.status(502).json({ error: "Tidak dapat menghubungi KIE. Periksa koneksi lalu coba lagi." });
  }
};
