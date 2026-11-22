# PioBot lokal: web + database + n8n + Hermes + 9Router

Semua berjalan di laptop dalam satu network Docker privat `piobot-net`. Port di host hanya `127.0.0.1`
(tidak terbuka ke LAN/internet; sesuai advisory GHSA-8gmq-j984-vp4r untuk 9Router).

```
browser ──127.0.0.1:8765──▶ piobot-web    (web PioBot + /acc, dev-server.cjs)
           127.0.0.1:5678──▶ n8n           (editor n8n)
           127.0.0.1:20128─▶ 9router       (dashboard 9Router)
           127.0.0.1:8642──▶ hermes-agent  (API /v1)   ·  127.0.0.1:9119 dashboard Hermes
           127.0.0.1:54329─▶ piobot-db     (Postgres, untuk psql/DBeaver)

piobot-web ──service_role JWT──▶ piobot-rest:3000 (PostgREST) ──▶ piobot-db
piobot-web /api/chat ──▶ 9router /v1/messages (gemini/gemini-3.5-flash-lite; di Vercel tetap KIE)
Hermes cron (tanpa LLM)
  ├─ tiap menit   ──▶ n8n webhook piobot-router      ──▶ Router Tiket
  ├─ tiap menit   ──▶ piobot-web /api/cron/reminders  (pengingat kalender)
  └─ tgl 28 09.00 ──▶ n8n webhook piostudio-pspost   ──▶ tiket PSPost bulan depan
n8n Router Tiket
  ├─ rpc/piobot_agent_claim  (header x-piobot-agent-secret)
  ├─ psdraft/psmedia/pspost ──▶ Hermes /v1 (skill piostudio-*) ──▶ 9Router
  ├─ help                    ──▶ 9Router gemini/gemini-3.5-flash-lite
  └─ rpc/piobot_agent_report ──▶ awaiting_acc / done / failed
```

Status tiket: `new → processing → awaiting_acc → (approved → finalizing → done | revision → processing | rejected)`.
Tiket macet > 15 menit diambil ulang; setelah 3 kali gagal jadi `failed`.

## Menjalankan

```powershell
docker compose -f docker/docker-compose.yml up -d
```

Buka http://localhost:8765 (workspace) dan http://localhost:8765/acc (ACC Gate).

Rahasia (semua gitignored):

| File | Isi |
|---|---|
| `docker/.env` | password 9Router/Hermes, `NINEROUTER_API_KEY` (chat web lokal), `PIOBOT_AGENT_SECRET`, password & JWT database lokal, `PIOBOT_N8N_WEBHOOK_SECRET`, `PIOBOT_CRON_SECRET` |
| `docker/.env.web` | kunci aplikasi web: `INTEGRATION_SECRET`, VAPID, KIE/Gemini/Apify/ClickUp, sandi Admin lokal, `GOOGLE_CLIENT_ID/SECRET` |

Contoh nama variabel: `docker/env.example`.

### Login

- **Admin/PioCheck**: tombol Admin di workspace. Sandi saat ini ada di `docker/.env.web` (`PIOBOT_STAFF_LOCAL_PASSWORD`).
- **Owner (Google)**: isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` di `docker/.env.web`, daftarkan redirect URI
  `http://localhost:8765/api/auth/callback/google` di Google Cloud Console, lalu
  `docker compose -f docker/docker-compose.yml up -d --force-recreate piobot-web`.

## Database lokal (`piobot-db` + `piobot-rest`)

Postgres 16 + PostgREST menggantikan Supabase cloud dengan API yang sama, jadi kode `api/` tetap memakai
`supabaseRequest` (`SUPABASE_REST_URL=http://piobot-rest:3000`). Saat volume `piobot-db-data` masih kosong, migrasi
dijalankan otomatis berurutan:

1. `postgres/00-supabase-compat.sh` – peran `anon`/`authenticated`/`service_role`/`authenticator`, skema `extensions` & stub `auth`
2. `postgres/01-piosales-base.sql` – tabel dasar invoice PioSales
3. `piosales-app/supabase/piosales_auth.sql`
4. `supabase/piobot_unified_workspace.sql`
5. `supabase/pioassist_phase1.sql` – tiket, ACC, RPC agen
6. `postgres/90-agent-secret.sh` – daftarkan hash `PIOBOT_AGENT_SECRET`

Migrasi baru untuk database yang sudah ada: jalankan manual, mis.
`docker exec -i piobot-db psql -U postgres -d piobot < supabase/<file>.sql`.

Data lama di Supabase cloud (invoice, token Google, langganan push) tidak ikut pindah.

## Hermes

- Model default lewat 9Router (`gemini/gemini-3.5-flash-lite`), fallback `gemini-3.8-flash` lalu Nous.
- Persona: `hermes-soul/SOUL.md` (dari `SOULPiobot.md`) → `/opt/data/SOUL.md`; cadangan bawaan `SOUL.md.bak-before-piobot`.
- Skill PioStudio: `hermes-skills/piobot/*` → `/opt/data/skills/piobot/`.
- Cron (mode `--no-agent`, tanpa token LLM): `hermes-scripts/*.py` → `/opt/data/scripts/`, secret dibaca dari `/opt/data/.env`.

```powershell
docker exec -u hermes hermes-agent hermes cron list
```

```powershell
docker exec -u hermes hermes-agent hermes cron runs
```

Daftar ulang cron bila volume Hermes baru:

```powershell
docker exec -u hermes hermes-agent hermes cron create --name "PioBot · Router Tiket (tiap menit)" --script piobot_router_tick.py --no-agent --deliver local --catch-up off --timezone Asia/Jakarta "* * * * *"
```

```powershell
docker exec -u hermes hermes-agent hermes cron create --name "PioBot · Pengingat Kalender (tiap menit)" --script piobot_reminders.py --no-agent --deliver local --catch-up off --timezone Asia/Jakarta "* * * * *"
```

```powershell
docker exec -u hermes hermes-agent hermes cron create --name "PioStudio · PSPost (tgl 28 09.00 WIB)" --script piobot_pspost_monthly.py --no-agent --deliver local --catch-up on --timezone Asia/Jakarta "0 9 28 * *"
```

## n8n

Workflow dibuat dari `n8n/build-workflows.cjs` (`node docker/n8n/build-workflows.cjs` → `n8n/workflows/*.json`),
lalu `n8n import:workflow` dan `n8n publish:workflow --id=...`. Credential header-auth yang dirujuk:
`pbAgentSecret001` (RPC DB), `pbHermesApiKey01`, `pb9RouterApiKey1`, `pbWebhookSecret1` (pemicu dari cron Hermes).
Catatan: 9Router membalas SSE bila `stream` tidak diisi; workflow selalu mengirim `"stream": false`.

## Hasil uji 2026-11-22 (semua lokal)

| Uji | Hasil |
|---|---|
| Webhook n8n tanpa secret / dengan secret | 403 / 200 |
| Tiket PSDraft dari web lokal → cron Hermes → n8n → Hermes | `awaiting_acc` ±1 menit |
| Revisi dari web → Hermes memperbaiki sesuai catatan | `awaiting_acc` lagi |
| ACC dari web → n8n finalisasi | `done`, riwayat lengkap di `piobot_ticket_events` |
| Cron Hermes (router + pengingat) | jalan tiap menit, 0 insiden |

## Backup

Harian 03:00 WIB: volume `piobot-db-data`, `n8n-data`, `hermes_isolated_data`, `9router-data`.
Backup manual sebelum upgrade versi atau buka fase baru.
