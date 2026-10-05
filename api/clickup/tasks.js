const { error, getSession } = require("../_lib/integrations");

const BASE = "https://api.clickup.com/api/v2";

async function clickup(authorization, path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: { Authorization: authorization, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.err || data.message || "ClickUp menolak permintaan.");
  return data;
}

async function getLists(authorization) {
  const teamsData = await clickup(authorization, "/team");
  const teams = teamsData.teams || [];
  const lists = [];
  await Promise.all(teams.map(async team => {
    const spacesData = await clickup(authorization, "/team/" + encodeURIComponent(team.id) + "/space?archived=false");
    await Promise.all((spacesData.spaces || []).map(async space => {
      const direct = await clickup(authorization, "/space/" + encodeURIComponent(space.id) + "/list?archived=false").catch(() => ({ lists: [] }));
      (direct.lists || []).forEach(list => lists.push({ id: list.id, name: list.name, space: space.name, team: team.name }));
      const foldersData = await clickup(authorization, "/space/" + encodeURIComponent(space.id) + "/folder?archived=false").catch(() => ({ folders: [] }));
      await Promise.all((foldersData.folders || []).map(async folder => {
        const nested = await clickup(authorization, "/folder/" + encodeURIComponent(folder.id) + "/list?archived=false").catch(() => ({ lists: [] }));
        (nested.lists || []).forEach(list => lists.push({ id: list.id, name: list.name, space: space.name, folder: folder.name, team: team.name }));
      }));
    }));
  }));
  return lists;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method tidak didukung." });
  const session = getSession(req, "clickup");
  const personalToken = String(process.env.CLICKUP_API_TOKEN || "").trim();
  const authorization = personalToken || (session && session.access_token ? "Bearer " + session.access_token : "");
  if (!authorization) return error(res, 401, "Hubungkan akun ClickUp terlebih dahulu.");
  try {
    if (req.method === "GET") return res.status(200).json({ lists: await getLists(authorization) });
    const body = req.body || {};
    const listId = String(body.listId || "").trim();
    const name = String(body.name || "").trim().slice(0, 200);
    const description = String(body.description || "").trim().slice(0, 8000);
    if (!listId || !/^[A-Za-z0-9_-]{1,80}$/.test(listId) || !name) return error(res, 400, "Pilih list dan isi nama task.");
    const task = await clickup(authorization, "/list/" + encodeURIComponent(listId) + "/task", {
      method: "POST", body: JSON.stringify({ name, description })
    });
    return res.status(201).json({ task: { id: task.id, name: task.name, url: task.url } });
  } catch (e) {
    console.error("ClickUp operation failed", e && e.name ? e.name : "unknown error");
    return error(res, 502, "ClickUp gagal memproses permintaan. Periksa akses workspace dan koneksi akun.");
  }
};
