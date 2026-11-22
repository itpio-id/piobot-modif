"""Helper cron PioBot untuk Hermes (mode --no-agent, tanpa LLM).

Secret dibaca dari /opt/data/.env Hermes:
  PIOBOT_N8N_WEBHOOK_SECRET  header x-piobot-webhook-secret untuk webhook n8n
  PIOBOT_CRON_SECRET         Bearer untuk /api/cron/reminders di piobot-web
Stdout kosong = sukses senyap; teks hanya dicetak bila ada masalah atau kabar penting.
"""
import json
import urllib.error
import urllib.request

ENV_FILE = "/opt/data/.env"


def secret(name):
    with open(ENV_FILE, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(f"[piobot-cron] {name} belum ada di {ENV_FILE}")


def call(method, url, headers, timeout=30):
    req = urllib.request.Request(url, method=method, headers=headers, data=b"{}" if method == "POST" else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, body
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "replace")[:300]
    except Exception as err:  # jaringan / container mati
        return 0, f"{type(err).__name__}: {err}"


def trigger_n8n(path):
    status, body = call(
        "POST",
        f"http://n8n:5678/webhook/{path}",
        {"x-piobot-webhook-secret": secret("PIOBOT_N8N_WEBHOOK_SECRET"), "Content-Type": "application/json"},
    )
    if status != 200:
        print(f"[piobot-cron] webhook n8n '{path}' gagal: HTTP {status} {body[:200]}")


def parse_json(body):
    try:
        return json.loads(body)
    except ValueError:
        return {}
