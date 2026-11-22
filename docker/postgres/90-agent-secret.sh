#!/bin/sh
# Daftarkan hash secret agen n8n (PIOBOT_AGENT_SECRET dari docker/.env) untuk RPC piobot_agent_*.
set -eu
[ -n "${PIOBOT_AGENT_SECRET:-}" ] || { echo "PIOBOT_AGENT_SECRET kosong, lewati"; exit 0; }
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v secret="$PIOBOT_AGENT_SECRET" <<'SQL'
insert into public.piobot_agent_secrets(name, secret_sha256)
values ('n8n', encode(extensions.digest(:'secret', 'sha256'), 'hex'))
on conflict (name) do update set secret_sha256 = excluded.secret_sha256, updated_at = now();
SQL
