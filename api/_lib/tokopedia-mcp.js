const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const localEntryPoint = path.resolve(__dirname, "..", "..", ".tokopedia-runtime", "node_modules", "@bintangtimurlangit", "tokopedia-mcp", "build", "index.js");
const deployedEntryPoint = [
  path.resolve(process.cwd(), "node_modules", "@bintangtimurlangit", "tokopedia-mcp", "build", "index.js"),
  path.resolve(__dirname, "..", "..", "node_modules", "@bintangtimurlangit", "tokopedia-mcp", "build", "index.js")
].find(candidate => fs.existsSync(candidate)) || "";
const entryPoint = process.env.VERCEL === "1" ? deployedEntryPoint : fs.existsSync(localEntryPoint) ? localEntryPoint : deployedEntryPoint;
const pending = new Map();
let child = null;
let initialized = false;
let initializing = null;
let nextId = 1;
let stdoutBuffer = "";

function installed() {
  return fs.existsSync(entryPoint);
}

function failPending(error) {
  for (const [id, item] of pending) {
    clearTimeout(item.timer);
    item.reject(error);
    pending.delete(id);
  }
}

function startServer() {
  if (child && child.exitCode === null && !child.killed) return Promise.resolve();
  if (!installed()) throw new Error("Runtime Tokopedia MCP lokal belum terpasang.");

  stdoutBuffer = "";
  initialized = false;
  child = spawn(process.execPath, [entryPoint], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: { ...process.env, DEBUG: "false", CACHE_TTL_MS: "30000", CACHE_MAX_ENTRIES: "200" },
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    stdoutBuffer += chunk;
    let newline;
    while ((newline = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        const request = pending.get(String(message.id));
        if (!request) continue;
        clearTimeout(request.timer);
        pending.delete(String(message.id));
        request.resolve(message);
      } catch {
        // Ignore non-protocol output; MCP messages are newline-delimited JSON.
      }
    }
  });

  child.on("error", error => {
    failPending(error);
    child = null;
    initialized = false;
  });
  child.on("exit", code => {
    failPending(new Error(code === 0 ? "Tokopedia MCP berhenti." : "Tokopedia MCP terputus."));
    child = null;
    initialized = false;
  });

  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

function rpc(method, params = {}, timeoutMs = 15000) {
  if (!child || child.exitCode !== null || child.killed) return Promise.reject(new Error("Proses Tokopedia MCP belum berjalan."));
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Tokopedia terlalu lama merespons. Coba lagi."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: Number(id), method, params }) + "\n", error => {
      if (!error) return;
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    });
  });
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initializing) {
    initializing = (async () => {
      await startServer();
      const response = await rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "piobot-local", version: "1.0.0" }
      }, 30000);
      if (response.error) throw new Error(response.error.message || "Handshake Tokopedia MCP gagal.");
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
      initialized = true;
    })().catch(error => {
      if (child && child.exitCode === null) child.kill();
      child = null;
      initialized = false;
      throw error;
    }).finally(() => { initializing = null; });
  }
  await initializing;
}

function parseProducts(result) {
  const text = (result.content || []).filter(item => item && item.type === "text").map(item => item.text || "").join("\n");
  const blocks = text.split(/\n(?=\d+\. \*\*)/);
  const products = [];
  for (const block of blocks) {
    const title = (block.match(/^\d+\.\s+\*\*(.*?)\*\*/m) || [])[1];
    const price = (block.match(/💰\s*([^\r\n]+)/u) || [])[1];
    const url = (block.match(/🔗\s*(https?:\/\/[^\s]+)/u) || [])[1];
    if (!title || !price || !url) continue;
    const rating = (block.match(/⭐\s*([^|\r\n]+)/u) || [])[1]?.trim() || "";
    const shop = (block.match(/🏪\s*([^|\r\n]+)/u) || [])[1]?.trim() || "";
    const productId = (block.match(/🆔\s*([^\s|]+)/u) || [])[1] || "";
    products.push({ title: title.trim(), price: price.trim(), rating, shop, productId, url: url.trim() });
  }
  return { products, text };
}

async function searchProducts(query) {
  await ensureInitialized();
  const listed = await rpc("tools/list", {}, 15000);
  if (listed.error) throw new Error(listed.error.message || "Tidak dapat membaca tools Tokopedia MCP.");
  const tool = (listed.result && listed.result.tools || []).find(item => item.name === "search_products");
  if (!tool) throw new Error("Tool search_products tidak tersedia dari Tokopedia MCP.");

  const properties = tool.inputSchema && tool.inputSchema.properties || {};
  const args = { query };
  if (Object.prototype.hasOwnProperty.call(properties, "page")) args.page = 1;
  if (Object.prototype.hasOwnProperty.call(properties, "rows")) args.rows = 5;
  if (Object.prototype.hasOwnProperty.call(properties, "orderBy")) args.orderBy = 23;

  const response = await rpc("tools/call", { name: "search_products", arguments: args }, 45000);
  if (response.error) throw new Error(response.error.message || "Pencarian Tokopedia gagal.");
  const result = response.result || {};
  if (result.isError) throw new Error("Tokopedia belum merespons pencarian ini. Coba lagi.");
  return parseProducts(result);
}

module.exports = { installed, searchProducts };
