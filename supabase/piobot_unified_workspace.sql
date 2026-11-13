-- Jalankan sekali di SQL Editor project Supabase PioSales.
-- Backend memakai SUPABASE_SERVICE_ROLE_KEY; secret ini hanya disimpan di Vercel.

begin;

create table if not exists public.piobot_integrations (
  name text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.piobot_staff_credentials (
  staff_id text primary key check (staff_id = 'primary'),
  password_hash text not null,
  force_change boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.piobot_push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.piobot_notification_log (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  kind text not null,
  event_id text,
  sent_at timestamptz not null default now()
);

create table if not exists public.piobot_markup_categories (
  category text primary key,
  markup_percent numeric not null check (markup_percent >= 0 and markup_percent <= 500),
  updated_at timestamptz not null default now()
);

alter table public.piobot_integrations enable row level security;
alter table public.piobot_staff_credentials enable row level security;
alter table public.piobot_push_subscriptions enable row level security;
alter table public.piobot_notification_log enable row level security;
alter table public.piobot_markup_categories enable row level security;

revoke all on public.piobot_integrations, public.piobot_staff_credentials,
  public.piobot_push_subscriptions, public.piobot_notification_log,
  public.piobot_markup_categories from public, anon, authenticated;
grant all on public.piobot_integrations, public.piobot_staff_credentials,
  public.piobot_push_subscriptions, public.piobot_notification_log,
  public.piobot_markup_categories to service_role;
grant usage, select on sequence public.piobot_notification_log_id_seq to service_role;

-- Tutup akses browser langsung ke invoice. Semua baca/tulis harus lewat API owner-only.
alter table public.piosales_invoices enable row level security;
alter table public.piosales_invoice_items enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('piosales_invoices', 'piosales_invoice_items')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;
revoke all on public.piosales_invoices, public.piosales_invoice_items from public, anon, authenticated;
grant all on public.piosales_invoices, public.piosales_invoice_items to service_role;

revoke all on function public.save_piosales_invoice(jsonb) from public, anon, authenticated;
revoke all on function public.delete_piosales_invoice(uuid) from public, anon, authenticated;
grant execute on function public.save_piosales_invoice(jsonb) to service_role;
grant execute on function public.delete_piosales_invoice(uuid) to service_role;

commit;
