const crypto = require("crypto");
const { googleAccessToken, error } = require("../_lib/integrations");
const { requireRole } = require("../_lib/auth");

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const PIOSALES_FOLDER = "piosalesinv";
const MAX_INVOICE_PDF_BYTES = 2 * 1024 * 1024;
const MAX_CHAT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;

function safeFileName(value) {
  return String(value || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 180);
}

function escapeDriveValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error && data.error.message || fallback), { status: response.status });
  }
  return data;
}

async function findInvoiceFolder(access) {
  const url = new URL(DRIVE);
  url.search = new URLSearchParams({
    q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveValue(PIOSALES_FOLDER)}'`,
    pageSize: "50",
    spaces: "drive",
    supportsAllDrives: "true",
    fields: "files(id,name,appProperties,capabilities(canAddChildren))"
  }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const data = await driveJson(response, "Tidak dapat mencari folder invoice di Google Drive.");
  const folders = data.files || [];
  return folders.find((folder) => folder.appProperties && folder.appProperties.piobotPurpose === "piosales-invoices") || folders[0] || null;
}

async function createInvoiceFolder(access) {
  const response = await fetch(`${DRIVE}?supportsAllDrives=true&fields=id,name,appProperties`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: PIOSALES_FOLDER,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { piobotPurpose: "piosales-invoices" }
    })
  });
  return driveJson(response, "Tidak dapat membuat folder piosalesinv di Google Drive.");
}

async function findInvoiceFile(access, folderId, invoiceKey) {
  const url = new URL(DRIVE);
  url.search = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false and appProperties has { key = 'piobotPurpose' and value = 'piosales-invoice' } and appProperties has { key = 'piobotInvoiceKey' and value = '${invoiceKey}' }`,
    pageSize: "10",
    spaces: "drive",
    supportsAllDrives: "true",
    fields: "files(id,name,webViewLink)"
  }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const data = await driveJson(response, "Tidak dapat mencari salinan invoice di Google Drive.");
  return (data.files || [])[0] || null;
}

async function uploadInvoicePdf(access, folderId, fileName, invoiceKey, bytes, existingFile) {
  if (existingFile) {
    const url = new URL(`${DRIVE_UPLOAD}/${encodeURIComponent(existingFile.id)}`);
    url.search = new URLSearchParams({ uploadType: "media", supportsAllDrives: "true", fields: "id,name,webViewLink" }).toString();
    const response = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/pdf" },
      body: bytes
    });
    return { file: await driveJson(response, "Tidak dapat memperbarui PDF invoice di Google Drive."), updated: true };
  }

  const boundary = `piobot_${crypto.randomBytes(12).toString("hex")}`;
  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    parents: [folderId],
    appProperties: { piobotPurpose: "piosales-invoice", piobotInvoiceKey: invoiceKey }
  };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const url = new URL(DRIVE_UPLOAD);
  url.search = new URLSearchParams({ uploadType: "multipart", supportsAllDrives: "true", fields: "id,name,webViewLink" }).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  return { file: await driveJson(response, "Tidak dapat mengunggah PDF invoice ke Google Drive."), updated: false };
}

async function saveInvoiceToDrive(access, body) {
  let encoded = String(body.pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
  if (!encoded || encoded.length > Math.ceil(MAX_INVOICE_PDF_BYTES * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw Object.assign(new Error("PDF invoice kosong, tidak valid, atau melebihi batas 2 MB."), { status: 400 });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 5 || bytes.length > MAX_INVOICE_PDF_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw Object.assign(new Error("File yang dikirim bukan PDF invoice yang valid atau melebihi batas 2 MB."), { status: 400 });
  }

  const invoiceNo = String(body.invoiceNo || "Invoice").slice(0, 180);
  const invoiceKey = crypto.createHash("sha256").update(invoiceNo).digest("hex").slice(0, 32);
  let fileName = safeFileName(body.fileName || `INV-${invoiceNo.replace(/\//g, "-")}.pdf`);
  if (!fileName.toLowerCase().endsWith(".pdf")) fileName += ".pdf";
  let folder = await findInvoiceFolder(access);
  if (!folder) folder = await createInvoiceFolder(access);

  let existing = await findInvoiceFile(access, folder.id, invoiceKey);
  try {
    const saved = await uploadInvoicePdf(access, folder.id, fileName, invoiceKey, bytes, existing);
    return { ...saved, folderName: PIOSALES_FOLDER };
  } catch (err) {
    const appOwned = folder.appProperties && folder.appProperties.piobotPurpose === "piosales-invoices";
    if (!appOwned && [403, 404].includes(err.status)) {
      folder = await createInvoiceFolder(access);
      existing = null;
      const saved = await uploadInvoicePdf(access, folder.id, fileName, invoiceKey, bytes, existing);
      return { ...saved, folderName: PIOSALES_FOLDER };
    }
    throw err;
  }
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

async function downloadFile(access, id, res, staffOnly = false) {
  if (!id || id.length > 200) return error(res, 400, "Pilih file Drive yang valid.");
  const metaResponse = await fetch(`${DRIVE}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,webContentLink,appProperties,capabilities(canDownload)`, { headers: { Authorization: `Bearer ${access}` } });
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) return error(res, metaResponse.status, "Tidak dapat membaca file Drive. Hubungkan ulang Google jika aksesnya berubah.");
  if (staffOnly && !(meta.appProperties && meta.appProperties.piobotPurpose === "piobot-content-draft")) return error(res, 403, "Reviewer hanya dapat membuka draf PioGrowth/PioStudio yang dibuat PioBot.");
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

async function readFileForChat(access, id, staffOnly = false) {
  if (!id || String(id).length > 200) throw Object.assign(new Error("Pilih file Drive yang valid."), { status: 400 });
  const metaResponse = await fetch(`${DRIVE}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,appProperties,capabilities(canDownload)`, { headers: { Authorization: `Bearer ${access}` } });
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) throw Object.assign(new Error("Tidak dapat membaca informasi file Drive. Hubungkan ulang Google jika izin berubah."), { status: metaResponse.status });
  if (staffOnly && !(meta.appProperties && meta.appProperties.piobotPurpose === "piobot-content-draft")) throw Object.assign(new Error("Reviewer hanya dapat menganalisis draf PioGrowth/PioStudio yang dibuat PioBot."), { status: 403 });
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

async function createTextDraft(access, body) {
  const title = safeFileName(body.title || "Draf PioBot").replace(/\.(?:txt|md)$/i, "").slice(0, 160);
  const content = String(body.content || "").trim();
  if (!content || content.length > 30000) throw Object.assign(new Error("Isi draf kosong atau melebihi 30.000 karakter."), { status: 400 });
  const boundary = `piobot_${crypto.randomBytes(12).toString("hex")}`;
  const metadata = { name: title, mimeType: "application/vnd.google-apps.document", appProperties: { piobotPurpose: "piobot-content-draft" } };
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`),
    Buffer.from(content, "utf8"),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const url = new URL(DRIVE_UPLOAD);
  url.search = new URLSearchParams({ uploadType: "multipart", supportsAllDrives: "true", fields: "id,name,mimeType,webViewLink" }).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart
  });
  return driveJson(response, "Google Drive gagal menyimpan draf.");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  const auth = await requireRole(req, res, ["owner", "staff"]);
  if (!auth) return;
  try {
    const access = await googleAccessToken(req, res);
    if (req.method === "GET") {
      const params = new URL(req.url, "https://itpioassistv2.vercel.app").searchParams;
      const downloadId = String(params.get("download") || "").trim();
      if (downloadId) return await downloadFile(access, downloadId, res, auth.role === "staff");
      const term = String(params.get("q") || "").trim().slice(0, 120);
      const escaped = term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const url = new URL(DRIVE);
      url.search = new URLSearchParams({
        q: `trashed = false${auth.role === "staff" ? " and appProperties has { key = 'piobotPurpose' and value = 'piobot-content-draft' }" : ""}${escaped ? ` and name contains '${escaped}'` : ""}`,
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
    if (body.action === "save-piosales-invoice") {
      if (auth.role !== "owner") return error(res, 403, "Invoice PioSales hanya bisa disimpan oleh pemilik.");
      const saved = await saveInvoiceToDrive(access, body);
      return res.status(200).json({ ok: true, ...saved });
    }
    if (body.action === "read-for-chat") {
      const attachment = await readFileForChat(access, String(body.fileId || ""), auth.role === "staff");
      return res.status(200).json({ attachment });
    }
    if (body.action === "create-content-draft") {
      const file = await createTextDraft(access, body);
      return res.status(201).json({ file: { id: file.id, name: file.name, url: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit` } });
    }
    return error(res, 400, "Aksi Drive tidak dikenal.");
  } catch (e) {
    if (e.status === 403 && req.method === "POST" && req.body && req.body.action === "save-piosales-invoice") {
      return error(res, 403, "Izin Google Drive untuk membuat file belum aktif. Putuskan lalu hubungkan ulang Google dan setujui izin Drive untuk menyimpan invoice.");
    }
    return error(res, e.status || 401, e.message || "Hubungkan akun Google terlebih dahulu.");
  }
};
