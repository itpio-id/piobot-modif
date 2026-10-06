const { googleAccessToken, error } = require("../_lib/integrations");

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const MAX_CHAT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;

function safeFileName(value) {
  return String(value || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 180);
}

async function readLimited(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_DOWNLOAD_BYTES) throw Object.assign(new Error("File lebih dari 4 MB. Gunakan tautan Drive untuk mengunduh file berukuran penuh."), { status: 413 });
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw Object.assign(new Error("File lebih dari 4 MB. Gunakan tautan Drive untuk mengunduh file berukuran penuh."), { status: 413 });
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error("File lebih dari 4 MB. Gunakan tautan Drive untuk mengunduh file berukuran penuh."), { status: 413 });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function downloadFile(access, id, res) {
  if (!id || id.length > 200) return error(res, 400, "Pilih file Drive yang valid.");
  const metaResponse = await fetch(`${DRIVE}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,webContentLink,capabilities(canDownload)`, { headers: { Authorization: `Bearer ${access}` } });
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) return error(res, metaResponse.status, "Tidak dapat membaca file Drive. Hubungkan ulang Google jika aksesnya berubah.");
  if (meta.capabilities && meta.capabilities.canDownload === false) return error(res, 403, "Google tidak mengizinkan unduhan untuk file ini.");

  let mimeType = meta.mimeType || "application/octet-stream";
  let name = safeFileName(meta.name || "drive-file");
  let url = `${DRIVE}/${encodeURIComponent(id)}?alt=media`;
  const exports = {
    "application/vnd.google-apps.document": ["application/pdf", ".pdf"],
    "application/vnd.google-apps.spreadsheet": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
    "application/vnd.google-apps.presentation": ["application/pdf", ".pdf"],
    "application/vnd.google-apps.drawing": ["image/png", ".png"]
  };
  if (exports[mimeType]) {
    const [exportType, extension] = exports[mimeType];
    mimeType = exportType;
    name = name.replace(/\.[^.]+$/, "") + extension;
    url = `${DRIVE}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportType)}`;
  }

  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!response.ok) return error(res, response.status, "Google Drive gagal menyiapkan unduhan.");
  const bytes = await readLimited(response);
  const fallbackName = name.replace(/[^\x20-\x7E]/g, "_").replace(/[\\"]+/g, "_");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(bytes);
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
      const params = new URL(req.url, "https://itpioassistv2.vercel.app").searchParams;
      const downloadId = String(params.get("download") || "").trim();
      if (downloadId) return await downloadFile(access, downloadId, res);
      const term = String(params.get("q") || "").trim().slice(0, 120);
      const escaped = term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const url = new URL(DRIVE);
      url.search = new URLSearchParams({
        q: `trashed = false${escaped ? ` and name contains '${escaped}'` : ""}`,
        pageSize: escaped ? "20" : "3",
        orderBy: "modifiedTime desc",
        spaces: "drive",
        fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink)"
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
    return error(res, 400, "Aksi Drive tidak dikenal.");
  } catch (e) {
    return error(res, e.status || 401, e.message || "Hubungkan akun Google terlebih dahulu.");
  }
};
