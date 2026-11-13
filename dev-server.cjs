const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8765;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function sendJson(res, statusCode, body) {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req, res) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      sendJson(res, 413, { error: "Request terlalu besar." });
      return undefined;
    }
    chunks.push(chunk);
  }
  if (!total) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if ((req.headers["content-type"] || "").includes("application/json")) {
    try { return JSON.parse(raw); }
    catch { sendJson(res, 400, { error: "Format JSON tidak valid." }); return undefined; }
  }
  return raw;
}

function apiFileFor(pathname) {
  let route = pathname.replace(/^\/api\/?/, "");
  if (route === "auth/callback/google") route = "google/callback";
  if (!route || route.split("/").some(part => !part || part.startsWith("_") || part === "." || part === "..")) return null;
  const file = path.resolve(ROOT, "api", route + ".js");
  if (!file.startsWith(path.resolve(ROOT, "api") + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return file;
}

function serveStatic(pathname, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { sendJson(res, 400, { error: "Path tidak valid." }); return; }
  if (decoded.split(/[\\/]/).some(part => part.startsWith(".") && part !== "." && part !== "..")) {
    sendJson(res, 404, { error: "Tidak ditemukan." });
    return;
  }
  const route = decoded.replace(/\/+$/, "") || "/";
  const relative = route === "/" || route === "/blueprint" ? "index.html" : route.replace(/^[/\\]+/, "");
  let file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep)) { sendJson(res, 404, { error: "Tidak ditemukan." }); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || file.split(path.sep).some(part => part.startsWith("."))) {
    sendJson(res, 404, { error: "Tidak ditemukan." });
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(file).pipe(res);
}

loadLocalEnv();

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://127.0.0.1:${PORT}`); }
  catch { sendJson(res, 400, { error: "URL tidak valid." }); return; }

  if (url.pathname.startsWith("/api/")) {
    const file = apiFileFor(url.pathname);
    if (!file) { sendJson(res, 404, { error: "API route tidak ditemukan." }); return; }
    req.query = Object.fromEntries(url.searchParams.entries());
    req.body = await readBody(req, res);
    if (res.writableEnded) return;
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { sendJson(res, res.statusCode || 200, body); return res; };
    res.send = body => {
      if (!res.headersSent) res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(body);
      return res;
    };
    try {
      const handler = require(file);
      await handler(req, res);
      if (!res.writableEnded) res.end();
    } catch (error) {
      console.error("Local API route failed:", url.pathname, error && error.name || "Error");
      sendJson(res, 500, { error: "Terjadi kesalahan pada API lokal." });
    }
    return;
  }

  serveStatic(url.pathname, res);
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") console.error(`Port ${PORT} sedang dipakai.`);
  else console.error("Server lokal gagal:", error.message);
  process.exitCode = 1;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PioBot lokal berjalan di http://127.0.0.1:${PORT}/`);
  console.log("Server hanya menerima koneksi dari PC ini.");
});
