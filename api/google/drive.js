const { googleAccessToken, error } = require("../_lib/integrations");

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_CHAT_FILE_BYTES = 2 * 1024 * 1024;

function safeFileName(value) {
  return String(value || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 180);
}

async function uploadFile(access, name, mimeType, bytes) {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name, mimeType })], { type: "application/json" }));
  form.append("file", new Blob([bytes], { type: mimeType }), name);
  const response = await fetch(`${DRIVE}?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
    body: form
  });
  const file = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Google Drive gagal menyimpan file. Periksa izin Drive lalu hubungkan ulang akun.");
  return file;
}

async function readFileForChat(access, id) {
  if (!id || String(id).length > 200) throw Object.assign(new Error("Pilih file Drive yang valid."), { status: 400 });
  const metaResponse = await fetch(`${DRIVE}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,capabilities(canDownload)`, { headers: { Authorization: `Bearer ${access}` } });
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) throw Object.assign(new Error("Tidak dapat membaca informasi file Drive. Hubungkan ulang Google jika izin berubah."), { status: metaResponse.status });
  if (meta.capabilities && meta.capabilities.canDownload === false) throw Object.assign(new Error("File ini tidak mengizinkan unduhan untuk analisis."), { status: 403 });

  let mimeType = meta.mimeType || "application/octet-stream";
  let exportType = "";
  if (mimeType === "application/vnd.google-apps.document") { mimeType = "text/plain"; exportType = mimeType; }
  else if (mimeType === "application/vnd.google-apps.spreadsheet") { mimeType = "text/csv"; exportType = mimeType; }
  else if (mimeType === "application/vnd.google-apps.presentation") { mimeType = "application/pdf"; exportType = mimeType; }
  const textFile = mimeType.startsWith("text/") || ["application/json", "application/xml"].includes(mimeType);
  const imageFile = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType);
  if (mimeType !== "application/pdf" && !textFile && !imageFile) {
    throw Object.assign(new Error("Format belum didukung untuk analisis. Gunakan TXT, CSV, Google Docs, PDF, atau JPG/PNG/WebP."), { status: 415 });
  }
  if (Number(meta.size || 0) > MAX_CHAT_FILE_BYTES) throw Object.assign(new Error("File Drive terlalu besar untuk dianalisis. Batasnya 2 MB."), { status: 413 });

  const url = exportType
    ? `${DRIVE}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportType)}`
    : `${DRIVE}/${encodeURIComponent(id)}?alt=media`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!response.ok) throw Object.assign(new Error("Google Drive gagal mengunduh isi file."), { status: response.status });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_CHAT_FILE_BYTES) throw Object.assign(new Error("File Drive terlalu besar untuk dianalisis. Batasnya 2 MB."), { status: 413 });
  const attachment = { name: meta.name || "File Drive", mimeType };
  if (textFile) {
    const text = bytes.toString("utf8");
    attachment.text = text.slice(0, 30000);
    attachment.truncated = text.length > 30000;
  }
  else attachment.base64 = bytes.toString("base64");
  return attachment;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  try {
    const access = await googleAccessToken(req, res);
    if (req.method === "GET") {
      const term = String(new URL(req.url, "https://itpioassistv2.vercel.app").searchParams.get("q") || "").trim().slice(0, 120);
      const escaped = term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const url = new URL(DRIVE);
      url.search = new URLSearchParams({
        q: `trashed = false${escaped ? ` and name contains '${escaped}'` : ""}`,
        pageSize: escaped ? "20" : "3",
        orderBy: "modifiedTime desc",
        spaces: "drive",
        fields: "files(id,name,mimeType,modifiedTime,webViewLink)"
      }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = response.status === 403
          ? "Izinkan akses metadata Google Drive. Hubungkan ulang akun Google untuk menyetujui pencarian nama file."
          : "Tidak bisa membaca file Drive. Hubungkan ulang akun jika izinnya berubah.";
        return error(res, response.status, message);
      }
      return res.status(200).json({ files: data.files || [] });
    }

    const body = req.body || {};
    if (body.action === "read-for-chat") {
      const attachment = await readFileForChat(access, String(body.fileId || ""));
      return res.status(200).json({ attachment });
    }
    if (body.action === "upload") {
      const name = safeFileName(body.name);
      const mimeType = String(body.mimeType || "application/octet-stream").slice(0, 150);
      const base64 = String(body.base64 || "");
      if (!name || !base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return error(res, 400, "Pilih file yang valid untuk diunggah.");
      const bytes = Buffer.from(base64, "base64");
      if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return error(res, 413, "Ukuran file maksimal 3 MB.");
      if (bytes.toString("base64") !== base64) return error(res, 400, "Data file tidak valid. Pilih ulang file lalu coba lagi.");
      const file = await uploadFile(access, name, mimeType, bytes);
      return res.status(201).json({ file });
    }

    const title = safeFileName(body.title).slice(0, 160);
    const content = String(body.content || "").trim().slice(0, 20000);
    if (!title || !content) return error(res, 400, "Judul dan isi catatan harus diisi.");
    const file = await uploadFile(access, `${title}.txt`, "text/plain", Buffer.from(content, "utf8"));
    return res.status(201).json({ file });
  } catch (e) {
    return error(res, e.status || 401, e.message || "Hubungkan akun Google terlebih dahulu.");
  }
};
