"""Tiap menit: jalankan pengingat kalender PioBot (push 1 jam sebelum acara, ringkasan Minggu 19.00)."""
import sys
sys.path.insert(0, "/opt/data/scripts")
from piobot_common import call, parse_json, secret

status, body = call(
    "GET",
    "http://piobot-web:8765/api/cron/reminders",
    {"Authorization": "Bearer " + secret("PIOBOT_CRON_SECRET")},
    timeout=55,
)
data = parse_json(body)
if status != 200:
    print(f"[piobot-cron] pengingat gagal: HTTP {status} {body[:200]}")
elif data.get("sent"):
    print(f"[piobot-cron] {data['sent']} pengingat terkirim ke perangkat Owner.")
