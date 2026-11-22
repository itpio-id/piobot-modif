// Generator workflow n8n PioAssist Fase 1. Jalankan: node docker/n8n/build-workflows.cjs
// Menulis docker/n8n/workflows/*.json (tanpa rahasia; credential dirujuk lewat id).
// Semua lokal: database = PostgREST piobot-rest di piobot-net, jadwal = cron Hermes yang memanggil webhook n8n.
const fs = require("fs");
const path = require("path");

const SUPABASE = "http://piobot-rest:3000/rpc/";
const CRED = {
  webhook: { httpHeaderAuth: { id: "pbWebhookSecret1", name: "PioBot Webhook Secret (cron Hermes)" } },
  agent: { httpHeaderAuth: { id: "pbAgentSecret001", name: "PioBot Agent Secret (Supabase RPC)" } },
  hermes: { httpHeaderAuth: { id: "pbHermesApiKey01", name: "Hermes API (hermes-agent:8642)" } },
  router: { httpHeaderAuth: { id: "pb9RouterApiKey1", name: "9Router API (9router:20128)" } }
};

function http(name, position, { url, cred, jsonBody, headers = [], timeout = 30000 }) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name, position,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    parameters: {
      method: "POST",
      url,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: headers.length > 0,
      headerParameters: { parameters: headers },
      sendBody: true,
      specifyBody: "json",
      jsonBody,
      options: { timeout, response: { response: { neverError: true } } }
    },
    credentials: CRED[cred]
  };
}

const supaHeaders = [{ name: "Content-Type", value: "application/json" }];

function code(name, position, jsCode, mode = "runOnceForAllItems") {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name, position,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    parameters: mode === "runOnceForAllItems" ? { jsCode } : { mode, jsCode }
  };
}

function ifEquals(name, position, left, right) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name, position,
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [{ id: "c1", leftValue: left, rightValue: right, operator: { type: "string", operation: "equals" } }],
        combinator: "and"
      },
      options: {}
    }
  };
}

// Pemicu dari cron Hermes: POST http://n8n:5678/webhook/<path> dengan header x-piobot-webhook-secret.
function webhook(name, position, pathName, webhookId) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name, position, webhookId,
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    parameters: { httpMethod: "POST", path: pathName, authentication: "headerAuth", responseMode: "onReceived", options: {} },
    credentials: CRED.webhook
  };
}

const link = (...targets) => ({ main: targets.map(t => (t ? [].concat(t).map(node => ({ node, type: "main", index: 0 })) : [])) });

// ---------------------------------------------------------------- Router tiket
const PROMPT_JS = String.raw`
const SKILL = { psdraft: 'piostudio-psdraft', psmedia: 'piostudio-psmedia', pspost: 'piostudio-pspost' };
const HELP_SYSTEM = 'Kamu PioBot, CS ITPIO. Jawab pertanyaan tiket secara singkat, ramah, dan akurat dalam bahasa Indonesia. Sebut dirimu "aku" (bukan "saya"), sapa penanya "kamu" (bukan "Anda"), jangan pakai tanda pisah panjang (— atau –), dan jangan pernah menyebut Surabaya atau Sidoarjo. Jangan menjanjikan harga, stok, atau jadwal pasti; tandai hal yang perlu dikonfirmasi Owner. Jangan sebut nama model AI.';
return $input.all().map(item => {
  const t = item.json;
  const req = t.request || {};
  const lines = [
    'Tiket ' + t.kind + ' #' + String(t.id).slice(0, 8),
    'Judul: ' + t.title,
    req.brief ? 'Brief: ' + req.brief : '',
    req.channel ? 'Kanal: ' + req.channel : '',
    req.audience ? 'Audiens: ' + req.audience : '',
    req.deadline ? 'Tenggat: ' + req.deadline : '',
    req.month ? 'Bulan target: ' + req.month : ''
  ].filter(Boolean);
  const prev = t.result && t.result.content;
  if (t.revision_note) {
    lines.push('', 'Catatan revisi dari Owner/PioCheck: ' + t.revision_note);
    if (prev) lines.push('', 'Draf sebelumnya:', String(prev).slice(0, 6000));
  }
  const useHermes = Boolean(SKILL[t.kind]);
  const system = useHermes
    ? 'Kamu dipanggil oleh n8n PioAssist (ACC Gate itpio.id). Muat dan ikuti skill ' + SKILL[t.kind] + ' lalu kerjakan tiket di bawah. Jawab hanya dengan hasil draf dalam Markdown.'
    : HELP_SYSTEM;
  const body = useHermes
    ? { model: 'hermes-agent', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n') }] }
    : { model: 'gemini/gemini-3.5-flash-lite', stream: false, max_tokens: 900, messages: [{ role: 'system', content: system }, { role: 'user', content: lines.join('\n') }] };
  return { json: { ticket_id: t.id, kind: t.kind, engine: useHermes ? 'hermes' : '9router', body } };
});`;

const REPORT_JS = String.raw`
const t = $('Bangun prompt').item.json;
const r = $json || {};
const choice = r.choices && r.choices[0];
const content = choice && choice.message && choice.message.content;
if (typeof content === 'string' && content.trim()) {
  return { json: {
    p_ticket_id: t.ticket_id,
    p_status: 'awaiting_acc',
    p_result: { content: content.trim(), engine: t.engine, model: r.model || null, generated_at: new Date().toISOString() },
    p_note: 'Draf dibuat oleh ' + t.engine + '; menunggu ACC.'
  } };
}
const err = (r.error && (r.error.message || r.error)) || r.message || 'tidak ada jawaban';
return { json: {
  p_ticket_id: t.ticket_id,
  p_status: 'failed',
  p_result: { error: String(typeof err === 'string' ? err : JSON.stringify(err)).slice(0, 500), engine: t.engine },
  p_note: 'Agen ' + t.engine + ' gagal: ' + String(typeof err === 'string' ? err : JSON.stringify(err)).slice(0, 300)
} };`;

const FINAL_JS = String.raw`
const NEXT = {
  psdraft: 'Draf disetujui. Lanjutkan produksi: buat tiket PSMedia bila butuh aset, atau masukkan ke ClickUp dari Workspace.',
  psmedia: 'Spesifikasi aset disetujui. Siap dikirim ke API media (carousel / video 10 dtk / audio).',
  pspost: 'Rencana posting disetujui. Jadwalkan konten sesuai tabel; tiap konten tetap lewat ACC sebelum tayang.',
  help: 'Jawaban disetujui dan siap dikirim ke penanya.'
};
return $input.all().map(item => ({ json: {
  p_ticket_id: item.json.id,
  p_status: 'done',
  p_result: { finalized_at: new Date().toISOString(), next_step: NEXT[item.json.kind] || 'Selesai.' },
  p_note: 'Difinalisasi n8n setelah ACC.'
} }));`;

const router = {
  id: "pbRouterTiket001",
  name: "PioBot · Router Tiket (Fase 1)",
  active: true,
  settings: { executionOrder: "v1", timezone: "Asia/Jakarta", saveDataSuccessExecution: "all", saveDataErrorExecution: "all" },
  nodes: [
    webhook("Cron Hermes · tiap menit", [0, 300], "piobot-router", "5f0c9a52-6b1e-4d8e-9a77-3c2f1b0d4e01"),
    http("Ambil tiket (DB lokal)", [220, 300], {
      url: SUPABASE + "piobot_agent_claim", cred: "agent", headers: supaHeaders,
      jsonBody: '={{ JSON.stringify({ p_limit: 3 }) }}'
    }),
    code("Hanya tiket valid", [440, 300], "return $input.all().filter(i => i.json && typeof i.json.id === 'string' && i.json.status);"),
    ifEquals("Sudah di-ACC?", [660, 300], "={{ $json.status }}", "finalizing"),
    code("Susun finalisasi", [880, 160], FINAL_JS),
    code("Bangun prompt", [880, 440], PROMPT_JS),
    ifEquals("Pakai Hermes?", [1100, 440], "={{ $json.engine }}", "hermes"),
    http("Hermes · PioStudio", [1320, 360], {
      url: "http://hermes-agent:8642/v1/chat/completions", cred: "hermes", timeout: 300000,
      headers: [{ name: "Content-Type", value: "application/json" }],
      jsonBody: "={{ JSON.stringify($json.body) }}"
    }),
    http("9Router · PioBot CS", [1320, 540], {
      url: "http://9router:20128/v1/chat/completions", cred: "router", timeout: 120000,
      headers: [{ name: "Content-Type", value: "application/json" }],
      jsonBody: "={{ JSON.stringify($json.body) }}"
    }),
    code("Susun laporan", [1540, 440], REPORT_JS, "runOnceForEachItem"),
    http("Laporkan ke DB lokal", [1780, 300], {
      url: SUPABASE + "piobot_agent_report", cred: "agent", headers: supaHeaders,
      jsonBody: "={{ JSON.stringify($json) }}"
    })
  ],
  connections: {
    "Cron Hermes · tiap menit": link("Ambil tiket (DB lokal)"),
    "Ambil tiket (DB lokal)": link("Hanya tiket valid"),
    "Hanya tiket valid": link("Sudah di-ACC?"),
    "Sudah di-ACC?": link("Susun finalisasi", "Bangun prompt"),
    "Susun finalisasi": link("Laporkan ke DB lokal"),
    "Bangun prompt": link("Pakai Hermes?"),
    "Pakai Hermes?": link("Hermes · PioStudio", "9Router · PioBot CS"),
    "Hermes · PioStudio": link("Susun laporan"),
    "9Router · PioBot CS": link("Susun laporan"),
    "Susun laporan": link("Laporkan ke DB lokal")
  },
  pinData: {}
};

// ---------------------------------------------------------------- PSPost cron tgl 28
const PSPOST_JS = String.raw`
const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const month = next.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
return [{ json: {
  p_kind: 'pspost',
  p_title: 'Rencana posting ' + month,
  p_request: {
    month,
    channel: 'TikTok + YouTube Shorts',
    brief: 'Susun rencana posting PioStudio untuk ' + month + ': cek algoritma terbaru, maksimal 3 konten per minggu, sertakan kebutuhan produksi.'
  }
} }];`;

const pspost = {
  id: "pbPSPostCron0001",
  name: "PioStudio · PSPost Cron Tgl 28",
  active: true,
  settings: { executionOrder: "v1", timezone: "Asia/Jakarta", saveDataSuccessExecution: "all", saveDataErrorExecution: "all" },
  nodes: [
    webhook("Cron Hermes · tgl 28 09.00", [0, 300], "piostudio-pspost", "8a3d2e61-0c4f-4b9a-b1d5-7e6f2a9c3b02"),
    code("Siapkan tiket bulan depan", [240, 300], PSPOST_JS),
    http("Buat tiket PSPost (DB lokal)", [480, 300], {
      url: SUPABASE + "piobot_agent_create", cred: "agent", headers: supaHeaders,
      jsonBody: "={{ JSON.stringify($json) }}"
    })
  ],
  connections: {
    "Cron Hermes · tgl 28 09.00": link("Siapkan tiket bulan depan"),
    "Siapkan tiket bulan depan": link("Buat tiket PSPost (DB lokal)")
  },
  pinData: {}
};

const out = path.join(__dirname, "workflows");
fs.mkdirSync(out, { recursive: true });
for (const wf of [router, pspost]) {
  const file = path.join(out, wf.id + ".json");
  fs.writeFileSync(file, JSON.stringify(wf, null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), file));
}
