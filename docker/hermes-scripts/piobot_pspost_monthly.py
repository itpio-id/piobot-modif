"""Tgl 28 pukul 09.00 WIB: picu n8n 'PioStudio · PSPost' untuk membuka tiket rencana posting bulan depan."""
import sys
sys.path.insert(0, "/opt/data/scripts")
from piobot_common import trigger_n8n

trigger_n8n("piostudio-pspost")
