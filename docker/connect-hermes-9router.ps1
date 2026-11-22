<#
.SYNOPSIS
  Sambungkan Hermes Agent (container hermes-agent) ke 9Router (container 9router).

.DESCRIPTION
  1. Pastikan hermes-agent ada di network docker piobot-net.
  2. Simpan API key 9Router ke /opt/data/.env Hermes sebagai NINEROUTER_API_KEY
     (diminta secara tersembunyi; tidak muncul di layar maupun di argumen perintah).
  3. Uji http://9router:20128/v1/models dari dalam container Hermes.
  4. (Opsional, -Model) Jadikan 9Router provider default Hermes lalu restart Hermes.

  Provider "9router" sudah didefinisikan di /opt/data/config.yaml Hermes:
    providers:
      9router:
        base_url: http://9router:20128/v1
        key_env: NINEROUTER_API_KEY

.EXAMPLE
  powershell -File docker/connect-hermes-9router.ps1
  powershell -File docker/connect-hermes-9router.ps1 -Model "cc/claude-sonnet-4-5"
#>
param(
  [string]$Model,
  [switch]$NewKey,
  [switch]$RevertToNous
)

$ErrorActionPreference = 'Stop'
$Hermes = 'hermes-agent'
$Router = '9router'
$Network = 'piobot-net'
$Py = '/opt/hermes/.venv/bin/python'

function Assert-Running([string]$name) {
  $state = docker inspect -f '{{.State.Running}}' $name 2>$null
  if ($state -ne 'true') { throw "Container '$name' tidak jalan. Jalankan dulu: docker compose -f docker/docker-compose.yml up -d" }
}

Assert-Running $Router
Assert-Running $Hermes

if ($RevertToNous) {
  docker exec -u hermes $Hermes hermes config set model.provider nous
  docker exec -u hermes $Hermes hermes config set model.base_url 'https://inference-api.nousresearch.com/v1'
  docker exec -u hermes $Hermes hermes config set model.default 'upstage/solar-mini4:free'
  docker restart $Hermes | Out-Null
  Write-Host '[ok] Hermes kembali memakai Nous (upstage/solar-mini4:free).'
  return
}

# 1. Network
$nets = docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' $Hermes
if (-not ($nets -split ' ' -contains $Network)) {
  Write-Host "Menyambungkan $Hermes ke network $Network ..."
  docker network connect $Network $Hermes
} else {
  Write-Host "[ok] $Hermes sudah di network $Network"
}

# 2. API key
$hasKeyCode = 'import re;print(any(l.startswith(''NINEROUTER_API_KEY='') and len(l)>19 for l in open(''/opt/data/.env'').read().splitlines()))'
$hasKey = (docker exec -u hermes $Hermes $Py -c $hasKeyCode).Trim()
if ($hasKey -ne 'True' -or $NewKey) {
  Write-Host ''
  Write-Host 'Buat API key di dashboard 9Router: http://localhost:20128  ->  menu API Keys  ->  Create'
  $secure = Read-Host 'Tempel API key 9Router' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if ([string]::IsNullOrWhiteSpace($plain)) { throw 'API key kosong.' }
  $writeCode = 'import sys;k=sys.stdin.readline().strip();p=''/opt/data/.env'';ls=[l for l in open(p).read().splitlines() if not l.startswith(''NINEROUTER_API_KEY='')];ls.append(''NINEROUTER_API_KEY=''+k);open(p,''w'').write(chr(10).join(ls)+chr(10));print(''saved'')'
  $plain | docker exec -i -u hermes $Hermes $Py -c $writeCode | Out-Null
  $plain = $null
  Write-Host '[ok] NINEROUTER_API_KEY disimpan di /opt/data/.env Hermes'
} else {
  Write-Host '[ok] NINEROUTER_API_KEY sudah ada di Hermes (pakai -NewKey untuk mengganti)'
}

# 3. Uji koneksi
$testCode = @'
import json,urllib.request
k=[l.split('=',1)[1].strip() for l in open('/opt/data/.env').read().splitlines() if l.startswith('NINEROUTER_API_KEY=')][-1]
r=urllib.request.Request('http://9router:20128/v1/models',headers={'Authorization':'Bearer '+k})
try:
    d=json.load(urllib.request.urlopen(r,timeout=10))
except urllib.error.HTTPError as e:
    print('HTTP',e.code,e.read().decode()[:200]); raise SystemExit(1)
ids=[m.get('id') for m in d.get('data',[])]
print('OK', len(ids), 'model')
for i in ids[:40]: print('  -', i)
'@
Write-Host ''
Write-Host 'Uji http://9router:20128/v1/models dari dalam Hermes ...'
docker exec -u hermes $Hermes $Py -c $testCode
if ($LASTEXITCODE -ne 0) { throw 'Hermes belum bisa memakai 9Router (cek API key).' }

# 4. Opsional: jadikan default
if ($Model) {
  Write-Host ''
  Write-Host "Menjadikan 9Router default Hermes dengan model '$Model' ..."
  docker exec -u hermes $Hermes hermes config set model.provider 9router
  docker exec -u hermes $Hermes hermes config set model.base_url 'http://9router:20128/v1'
  docker exec -u hermes $Hermes hermes config set model.default $Model
  docker restart $Hermes | Out-Null
  Write-Host '[ok] Hermes di-restart dan sekarang memakai 9Router.'
  Write-Host '     Kembali ke Nous: powershell -File docker/connect-hermes-9router.ps1 -RevertToNous'
} else {
  Write-Host ''
  Write-Host 'Koneksi siap. Untuk menjadikan 9Router model default Hermes, jalankan lagi dengan -Model "<id model dari daftar di atas>"'
}
