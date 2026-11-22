-- PioAssist Fase 1 (PioBot + PioStudio): tiket, ACC Gate, dan audit log.
-- Jalankan sekali di SQL Editor project Supabase PioSales, SETELAH piobot_unified_workspace.sql.
--
-- Alur:
--   web itpio.id (API Vercel, service_role) ──buat tiket / ACC──▶ piobot_tickets
--   n8n lokal/VPS (kunci publishable + header x-piobot-agent-secret) ──RPC piobot_agent_*──▶ piobot_tickets
--
-- n8n TIDAK memakai service_role. Ia hanya bisa memanggil 3 fungsi RPC di bawah,
-- dan setiap fungsi menolak request tanpa secret agen yang hash-nya tersimpan di piobot_agent_secrets.
-- Daftarkan secret (hash SHA-256 hex) sekali:
--   insert into public.piobot_agent_secrets(name, secret_sha256) values ('n8n', '<hash>')
--   on conflict (name) do update set secret_sha256 = excluded.secret_sha256, updated_at = now();

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.piobot_agent_secrets (
  name text primary key,
  secret_sha256 text not null check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.piobot_tickets (
  id uuid primary key default gen_random_uuid(),
  agent text not null default 'piostudio' check (agent in ('piobot', 'piostudio', 'piosales', 'piolearn')),
  kind text not null check (kind in ('help', 'psdraft', 'psmedia', 'pspost')),
  title text not null check (char_length(title) between 1 and 200),
  request jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in (
    'new', 'processing', 'awaiting_acc', 'revision', 'approved', 'finalizing', 'done', 'rejected', 'failed'
  )),
  result jsonb,
  revision_note text,
  attempts int not null default 0,
  created_by text not null default 'owner',
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists piobot_tickets_status_idx on public.piobot_tickets (status, created_at);

create table if not exists public.piobot_ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.piobot_tickets(id) on delete cascade,
  actor text not null,
  action text not null,
  note text,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists piobot_ticket_events_ticket_idx on public.piobot_ticket_events (ticket_id, created_at);

alter table public.piobot_agent_secrets enable row level security;
alter table public.piobot_tickets enable row level security;
alter table public.piobot_ticket_events enable row level security;

revoke all on public.piobot_agent_secrets, public.piobot_tickets, public.piobot_ticket_events
  from public, anon, authenticated;
grant all on public.piobot_agent_secrets, public.piobot_tickets, public.piobot_ticket_events to service_role;
grant usage, select on sequence public.piobot_ticket_events_id_seq to service_role;

-- Secret agen dibaca dari header HTTP PostgREST, bukan dari argumen, agar tidak tercatat di log query.
create or replace function public.piobot_agent_check()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  supplied text := coalesce(headers ->> 'x-piobot-agent-secret', '');
  agent_name text;
begin
  if char_length(supplied) < 32 then
    raise exception 'agent secret required' using errcode = '28000';
  end if;
  select name into agent_name
  from public.piobot_agent_secrets
  where secret_sha256 = encode(extensions.digest(supplied, 'sha256'), 'hex');
  if agent_name is null then
    raise exception 'invalid agent secret' using errcode = '28000';
  end if;
  return agent_name;
end $$;

-- Ambil tiket yang perlu dikerjakan: new/revision -> processing, approved -> finalizing.
-- Tiket processing/finalizing yang macet > 15 menit diambil ulang (maks 3 percobaan).
create or replace function public.piobot_agent_claim(p_limit int default 3)
returns setof public.piobot_tickets
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agent_name text := public.piobot_agent_check();
begin
  update public.piobot_tickets t
     set status = 'failed', updated_at = now(), revision_note = coalesce(t.revision_note, '') || ' [gagal 3x diproses agen]'
   where t.status in ('processing', 'finalizing') and t.attempts >= 3 and t.claimed_at < now() - interval '15 minutes';

  return query
  with picked as (
    select t.id
      from public.piobot_tickets t
     where t.status in ('new', 'revision', 'approved')
        or (t.status in ('processing', 'finalizing') and t.claimed_at < now() - interval '15 minutes')
     order by t.created_at
     limit greatest(1, least(coalesce(p_limit, 3), 10))
     for update skip locked
  ), updated as (
    update public.piobot_tickets t
       set status = case when t.status in ('approved', 'finalizing') then 'finalizing' else 'processing' end,
           claimed_at = now(),
           attempts = t.attempts + 1,
           updated_at = now()
      from picked
     where t.id = picked.id
    returning t.*
  ), logged as (
    insert into public.piobot_ticket_events (ticket_id, actor, action)
    select u.id, agent_name, 'claim:' || u.status from updated u
  )
  select * from updated;
end $$;

-- Laporkan hasil kerja agen. Transisi yang diizinkan:
--   processing -> awaiting_acc | failed
--   finalizing -> done | failed
create or replace function public.piobot_agent_report(p_ticket_id uuid, p_status text, p_result jsonb default null, p_note text default null)
returns public.piobot_tickets
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agent_name text := public.piobot_agent_check();
  current_row public.piobot_tickets;
begin
  select * into current_row from public.piobot_tickets where id = p_ticket_id for update;
  if current_row.id is null then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  if not (
    (current_row.status = 'processing' and p_status in ('awaiting_acc', 'failed')) or
    (current_row.status = 'finalizing' and p_status in ('done', 'failed'))
  ) then
    raise exception 'transition % -> % not allowed', current_row.status, p_status using errcode = '22023';
  end if;
  update public.piobot_tickets
     set status = p_status,
         result = case when p_result is null then result else coalesce(result, '{}'::jsonb) || p_result end,
         claimed_at = null,
         attempts = case when p_status = 'failed' then attempts else 0 end,
         updated_at = now()
   where id = p_ticket_id
  returning * into current_row;
  insert into public.piobot_ticket_events (ticket_id, actor, action, note)
  values (p_ticket_id, agent_name, 'report:' || p_status, left(p_note, 2000));
  return current_row;
end $$;

-- Dipakai cron n8n (PSPost tgl 28) untuk membuka tiket baru.
create or replace function public.piobot_agent_create(p_kind text, p_title text, p_request jsonb default '{}'::jsonb)
returns public.piobot_tickets
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agent_name text := public.piobot_agent_check();
  new_row public.piobot_tickets;
begin
  insert into public.piobot_tickets (agent, kind, title, request, created_by)
  values (case when p_kind = 'help' then 'piobot' else 'piostudio' end, p_kind, left(p_title, 200), coalesce(p_request, '{}'::jsonb), agent_name)
  returning * into new_row;
  insert into public.piobot_ticket_events (ticket_id, actor, action) values (new_row.id, agent_name, 'create');
  return new_row;
end $$;

revoke all on function public.piobot_agent_check() from public, anon, authenticated;
revoke all on function public.piobot_agent_claim(int) from public;
revoke all on function public.piobot_agent_report(uuid, text, jsonb, text) from public;
revoke all on function public.piobot_agent_create(text, text, jsonb) from public;
grant execute on function public.piobot_agent_claim(int) to anon, service_role;
grant execute on function public.piobot_agent_report(uuid, text, jsonb, text) to anon, service_role;
grant execute on function public.piobot_agent_create(text, text, jsonb) to anon, service_role;

commit;
