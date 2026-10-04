const { googleAccessToken, error } = require("../_lib/integrations");

const DRIVE = "https://www.googleapis.com/drive/v3/files";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  try {
    const access = await googleAccessToken(req, res);
    if (req.method === "GET") {
      const url = new URL(DRIVE);
      url.search = new URLSearchParams({
        q: "trashed = false",
        pageSize: "12",
        orderBy: "modifiedTime desc",
        fields: "files(id,name,mimeType,modifiedTime,webViewLink)"
      }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return error(res, response.status, "Tidak bisa membaca file Drive. Hubungkan ulang akun jika izinnya berubah.");
      return res.status(200).json({ files: data.files || [] });
    }

    const title = String((req.body || {}).title || "").trim().slice(0, 160);
    const content = String((req.body || {}).content || "").trim().slice(0, 20000);
    if (!title || !content) return error(res, 400, "Judul dan isi catatan harus diisi.");
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: title, mimeType: "text/plain" })], { type: "application/json" }));
    form.append("file", new Blob([content], { type: "text/plain;charset=utf-8" }), `${title.replace(/[\\/:*?"<>|]/g, "-")}.txt`);
    const response = await fetch(`${DRIVE}?uploadType=multipart&fields=id,name,webViewLink`, { method: "POST", headers: { Authorization: `Bearer ${access}` }, body: form });
    const file = await response.json().catch(() => ({}));
    if (!response.ok) return error(res, response.status, "Google Drive gagal menyimpan catatan. Periksa izin Drive.");
    return res.status(201).json({ file });
  } catch (e) {
    return error(res, 401, e.message || "Hubungkan akun Google terlebih dahulu.");
  }
};
