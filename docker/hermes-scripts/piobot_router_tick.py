"""Tiap menit: picu n8n 'PioBot · Router Tiket' agar mengambil tiket baru/revisi/ACC."""
import sys
sys.path.insert(0, "/opt/data/scripts")
from piobot_common import trigger_n8n

trigger_n8n("piobot-router")
