-- Tabel dasar PioSales (di Supabase cloud dibuat lewat dashboard; di lokal dibuat di sini).
create table if not exists public.piosales_invoices (
  id uuid primary key,
  invoice_no text not null default '',
  customer_name text not null default '',
  customer_phone text,
  customer_address text,
  customer_company text,
  customer_email text,
  invoice_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'BELUM LUNAS',
  dp_amount numeric not null default 0,
  notes text,
  warranty_note text,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.piosales_invoice_items (
  invoice_id uuid not null references public.piosales_invoices(id) on delete cascade,
  line_no integer not null,
  item_name text not null default '',
  description text,
  qty numeric not null default 0,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  primary key (invoice_id, line_no)
);
