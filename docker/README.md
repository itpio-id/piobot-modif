# Stack lokal PioBot: n8n + Hermes + 9Router (arsitektur Hybrid)

Semua service ada di `docker-compose.yml`, satu network Docker privat `piobot-net`.
Port di host hanya `127.0.0.1` (tidak terbuka ke LAN/internet), sesuai advisory
GHSA-8gmq-j984-vp4r untuk 9Router.

```
laptop ──127.0.0.1:20128──▶ 9router        (dashboard 9Router)
laptop ──127.0.0.1:5678───▶ n8n            (editor n8n)
laptop ──127.0.0.1:8642───▶ hermes-agent   (API /v1, butuh API_SERVER_KEY)
laptop ──127.0.0.1:9119───▶ hermes-agent   (dashboard Hermes, basic auth admin)

hermes-agent ──▶ http://9router:20128/v1      (Bearer NINEROUTER_API_KEY)  model default
hermes-agent ──▶ http://n8n:5678              (webhook n8n)
n8n          ──▶ http://hermes-agent:8642/v1  (Bearer API_SERVER_KEY, model "hermes-agent")
n8n          ──▶ http://9router:20128/v1      (Bearer NINEROUTER_API_KEY)
```

## Status koneksi (diverifikasi 2026-11-22)

| Arah | Hasil |
|---|---|
| Hermes → 9Router `/v1/models` | 200, 14 model |
| n8n → 9Router `/v1/chat/completions` (`gemini/gemini-3.5-flash-lite`) | 200, ~5 dtk |
| n8n → Hermes `/v1/chat/completions` (Hermes memakai 9Router) | 200, ~24 dtk |
| Hermes → n8n `/healthz` | 200 |

## Menjalankan

```powershell
docker compose -f docker/docker-compose.yml up -d
```

Rahasia di `docker/.env` (gitignored, lihat `docker/env.example`):
`NINEROUTER_PASSWORD`, `HERMES_DASHBOARD_BASIC_AUTH_PASSWORD`.
Data Hermes di volume external `hermes_isolated_data` (tidak ikut terhapus `compose down`).

## Config Hermes (`/opt/data/config.yaml` di volume)

```yaml
model:
  default: "gemini/gemini-3.5-flash-lite"
  provider: "9router"
  base_url: http://9router:20128/v1

providers:
  9router:
    base_url: "http://9router:20128/v1"
    api_mode: chat_completions
    key_env: "NINEROUTER_API_KEY"   # disimpan di /opt/data/.env
    request_timeout_seconds: 600

fallback_providers:                 # dicoba bila rate-limit/overload/koneksi gagal
  - provider: "9router"
    model: "gemini/gemini-3.8-flash"
  - provider: "nous"
    model: "upstage/solar-mini4:free"

platforms:
  api_server:
    extra:
      host: 0.0.0.0   # agar n8n bisa memanggil hermes-agent:8642; di host tetap 127.0.0.1
```

Backup di volume: `config.yaml.bak-before-9router-default`, `.env.bak-before-9router-key`.
Kembali ke Nous: `powershell -File docker/connect-hermes-9router.ps1 -RevertToNous`.
Ganti key 9Router: `powershell -File docker/connect-hermes-9router.ps1 -NewKey`.

## Credential di n8n (sekali saja, lewat UI n8n)

Salin key ke clipboard tanpa menampilkannya, lalu tempel di n8n:

```powershell
docker exec -u hermes hermes-agent sh -c "grep '^API_SERVER_KEY=' /opt/data/.env | cut -d= -f2-" | Set-Clipboard
```

1. **Hermes** — Credentials → New → *OpenAI*:
   Base URL `http://hermes-agent:8642/v1`, API key = clipboard. Model: `hermes-agent`.

```powershell
docker exec -u hermes hermes-agent sh -c "grep '^NINEROUTER_API_KEY=' /opt/data/.env | cut -d= -f2-" | Set-Clipboard
```

2. **9Router** — Credentials → New → *OpenAI*:
   Base URL `http://9router:20128/v1`, API key = clipboard. Model mis. `gemini/gemini-3.5-flash-lite`.

Catatan: 9Router membalas SSE bila `stream` tidak diisi; di node HTTP Request set `"stream": false`.

## Peran tiap service (Fase 1: PioBot + PioStudio)

- **n8n** — SOP & router: webhook chat/ACC dari itpio.id, Wait ACC, cron tgl 28 (PSPost), simpan tiket/ACC ke Supabase.
- **Hermes** — skill & kebiasaan Owner: PSDraft (riset ide & brief), auto-skill, dipanggil n8n via `/v1`.
- **9Router** — gateway LLM privat dengan fallback, hanya di `piobot-net`.

## Backup (rencana VPS)

Harian 03:00 WIB: volume `n8n-data`, `hermes_isolated_data`, `9router-data` ke cloud storage;
snapshot VPS mingguan; backup manual sebelum upgrade atau buka fase baru.
