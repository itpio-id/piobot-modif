import type { DiscountType, Invoice } from "@/types";
import { requireSupabase } from "@/lib/supabase";

type InvoiceRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_company: string | null;
  customer_email: string | null;
  status: Invoice["status"];
  dp_amount: number | null;
  total_discount_type: DiscountType | null;
  total_discount_value: number | null;
  notes: string | null;
  warranty_note: string | null;
  created_at: string;
  updated_at?: string | null;
};

type InvoiceItemRow = {
  invoice_id: string;
  line_no: number;
  item_name: string;
  description: string | null;
  qty: number;
  unit_price: number;
  discount_type: DiscountType | null;
  discount_value: number | null;
};

function fromRows(row: InvoiceRow, items: InvoiceItemRow[]): Invoice {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    customerAddress: row.customer_address || "",
    customerCompany: row.customer_company || "",
    customerEmail: row.customer_email || "",
    items: items
      .sort((a, b) => a.line_no - b.line_no)
      .map((item) => ({
        id: String(item.line_no),
        name: item.item_name || "",
        description: item.description || "",
        qty: Number(item.qty),
        price: Number(item.unit_price),
        discountType: item.discount_type === "percent" ? "percent" : "amount",
        discountValue: Number(item.discount_value || 0),
      })),
    totalDiscountType: row.total_discount_type === "percent" ? "percent" : "amount",
    totalDiscountValue: Number(row.total_discount_value || 0),
    notes: row.notes || "",
    warrantyNote: row.warranty_note || "",
    status: row.status,
    dpAmount: Number(row.dp_amount || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export async function listInvoices(): Promise<{ items: Invoice[]; mode: "remote" }> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("piosales_invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const invoiceRows = (rows || []) as unknown as InvoiceRow[];
  if (!invoiceRows.length) return { items: [], mode: "remote" };

  const { data: itemRows, error: itemError } = await client
    .from("piosales_invoice_items")
    .select("*")
    .in("invoice_id", invoiceRows.map((row) => row.id));
  if (itemError) throw itemError;
  const grouped = new Map<string, InvoiceItemRow[]>();
  for (const item of (itemRows || []) as unknown as InvoiceItemRow[]) {
    grouped.set(item.invoice_id, [...(grouped.get(item.invoice_id) || []), item]);
  }
  return { items: invoiceRows.map((row) => fromRows(row, grouped.get(row.id) || [])), mode: "remote" };
}

export async function saveInvoice(inv: Invoice): Promise<"remote"> {
  const { error } = await requireSupabase().rpc("save_piosales_invoice", { payload: inv });
  if (error) throw error;
  return "remote";
}

export async function saveInvoicePdfToDrive(inv: Invoice, pdf: Blob): Promise<void> {
  if (pdf.size > 2 * 1024 * 1024) throw new Error("PDF invoice melebihi batas 2 MB untuk upload otomatis.");
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const fileName = `INV-${inv.invoiceNo.replace(/\//g, "-")}.pdf`;
  const response = await fetch("/api/google/drive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save-piosales-invoice",
      invoiceNo: inv.invoiceNo,
      fileName,
      pdfBase64: btoa(binary)
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Upload invoice ke Google Drive gagal.");
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await requireSupabase().rpc("delete_piosales_invoice", { p_invoice_id: id });
  if (error) throw error;
}

export interface EnrichResult {
  description: string;
  notes?: string;
}

export async function enrichWithAI(input: {
  itemName: string;
  description: string;
  context?: string;
  kind?: "item" | "notes";
}): Promise<EnrichResult | null> {
  try {
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as EnrichResult;
  } catch {
    return null;
  }
}

/** Generate next invoice number in format INV/YYYYMMDD/NN based on today's existing invoices. */
export function nextInvoiceNo(existing: Invoice[]): string {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const prefix = `INV/${ymd}/`;
  const countToday = existing.filter((i) => i.invoiceNo.startsWith(prefix)).length;
  return `${prefix}${String(countToday + 1).padStart(2, "0")}`;
}
