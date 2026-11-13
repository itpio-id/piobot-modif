begin;

alter table public.piosales_invoices
  add column if not exists total_discount_type text not null default 'amount',
  add column if not exists total_discount_value numeric not null default 0;

alter table public.piosales_invoice_items
  add column if not exists discount_type text not null default 'amount',
  add column if not exists discount_value numeric not null default 0;
create or replace function public.save_piosales_invoice(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(payload->>'id', '')::uuid;
  v_subtotal numeric := 0;
  v_item_discount numeric := 0;
  v_after_item_discount numeric := 0;
  v_total_discount numeric := 0;
begin
  if v_id is null then
    raise exception 'ID invoice tidak valid.' using errcode = '22023';
  end if;

  select coalesce(sum(
    greatest(
      coalesce(nullif(item->>'qty', '')::numeric, 0)
      * coalesce(nullif(item->>'price', '')::numeric, 0),
      0
    )
  ), 0)
  into v_subtotal
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) as rows(item);

  select coalesce(sum(
    least(
      greatest(
        coalesce(nullif(item->>'qty', '')::numeric, 0)
        * coalesce(nullif(item->>'price', '')::numeric, 0),
        0
      ),
      case when item->>'discountType' = 'percent' then
        greatest(
          coalesce(nullif(item->>'qty', '')::numeric, 0)
          * coalesce(nullif(item->>'price', '')::numeric, 0),
          0
        ) * least(greatest(coalesce(nullif(item->>'discountValue', '')::numeric, 0), 0), 100) / 100
      else greatest(coalesce(nullif(item->>'discountValue', '')::numeric, 0), 0)
      end
    )
  ), 0)
  into v_item_discount
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) as rows(item);

  v_after_item_discount := greatest(v_subtotal - v_item_discount, 0);
  if payload->>'totalDiscountType' = 'percent' then
    v_total_discount := v_after_item_discount
      * least(greatest(coalesce(nullif(payload->>'totalDiscountValue', '')::numeric, 0), 0), 100) / 100;
  else
    v_total_discount := least(
      v_after_item_discount,
      greatest(coalesce(nullif(payload->>'totalDiscountValue', '')::numeric, 0), 0)
    );
  end if;

  insert into public.piosales_invoices (
    id, owner_id, invoice_no, customer_name, customer_phone,
    customer_address, customer_company, customer_email, invoice_date,
    due_date, status, dp_amount, total_discount_type, total_discount_value,
    notes, warranty_note, subtotal, total,
    created_at, updated_at
  ) values (
    v_id, v_user_id, coalesce(payload->>'invoiceNo', ''),
    coalesce(payload->>'customerName', ''), nullif(payload->>'customerPhone', ''),
    nullif(payload->>'customerAddress', ''), nullif(payload->>'customerCompany', ''),
    nullif(payload->>'customerEmail', ''),
    coalesce(nullif(payload->>'invoiceDate', '')::date, current_date),
    coalesce(nullif(payload->>'dueDate', '')::date, current_date),
    coalesce(nullif(payload->>'status', ''), 'BELUM LUNAS'),
    coalesce(nullif(payload->>'dpAmount', '')::numeric, 0),
    case when payload->>'totalDiscountType' = 'percent' then 'percent' else 'amount' end,
    case when payload->>'totalDiscountType' = 'percent' then
      least(greatest(coalesce(nullif(payload->>'totalDiscountValue', '')::numeric, 0), 0), 100)
    else greatest(coalesce(nullif(payload->>'totalDiscountValue', '')::numeric, 0), 0)
    end,
    nullif(payload->>'notes', ''), nullif(payload->>'warrantyNote', ''),
    v_subtotal, v_after_item_discount - v_total_discount,
    coalesce(nullif(payload->>'createdAt', '')::timestamptz, now()), now()
  )
  on conflict (id) do update set
    owner_id = excluded.owner_id,
    invoice_no = excluded.invoice_no,
    customer_name = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    customer_address = excluded.customer_address,
    customer_company = excluded.customer_company,
    customer_email = excluded.customer_email,
    invoice_date = excluded.invoice_date,
    due_date = excluded.due_date,
    status = excluded.status,
    dp_amount = excluded.dp_amount,
    total_discount_type = excluded.total_discount_type,
    total_discount_value = excluded.total_discount_value,
    notes = excluded.notes,
    warranty_note = excluded.warranty_note,
    subtotal = excluded.subtotal,
    total = excluded.total,
    updated_at = now();

  delete from public.piosales_invoice_items where invoice_id = v_id;

  insert into public.piosales_invoice_items (
    invoice_id, line_no, item_name, description, qty, unit_price,
    discount_type, discount_value, line_total
  )
  select
    v_id,
    rows.ordinality::integer,
    coalesce(rows.item->>'name', ''),
    nullif(rows.item->>'description', ''),
    coalesce(nullif(rows.item->>'qty', '')::numeric, 0),
    coalesce(nullif(rows.item->>'price', '')::numeric, 0),
    case when rows.item->>'discountType' = 'percent' then 'percent' else 'amount' end,
    case when rows.item->>'discountType' = 'percent' then
      least(greatest(coalesce(nullif(rows.item->>'discountValue', '')::numeric, 0), 0), 100)
    else greatest(coalesce(nullif(rows.item->>'discountValue', '')::numeric, 0), 0)
    end,
    greatest(parsed.qty * parsed.unit_price, 0) - least(
      greatest(parsed.qty * parsed.unit_price, 0),
      case when parsed.discount_type = 'percent' then
        greatest(parsed.qty * parsed.unit_price, 0)
          * least(greatest(parsed.discount_value, 0), 100) / 100
      else greatest(parsed.discount_value, 0)
      end
    )
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) with ordinality as rows(item, ordinality)
  cross join lateral (
    select
      coalesce(nullif(rows.item->>'qty', '')::numeric, 0) as qty,
      coalesce(nullif(rows.item->>'price', '')::numeric, 0) as unit_price,
      case when rows.item->>'discountType' = 'percent' then 'percent' else 'amount' end as discount_type,
      greatest(coalesce(nullif(rows.item->>'discountValue', '')::numeric, 0), 0) as discount_value
  ) as parsed;

  return v_id;
end;
$$;

commit;
