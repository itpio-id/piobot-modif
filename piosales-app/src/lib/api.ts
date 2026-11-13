import type { Invoice } from "@/types";

export async function listInvoices(): Promise<{ items: Invoice[]; mode: "remote" }> {
  const response = await fetch("/api/piosales/invoices", { cache: "no-store", credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal memuat invoice.");
  return { items: Array.isArray(data.items) ? data.items as Invoice[] : [], mode: "remote" };
}

export async function saveInvoice(inv: Invoice): Promise<"remote"> {
  const response = await fetch("/api/piosales/invoices", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inv)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal menyimpan invoice.");
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
  const response = await fetch("/api/piosales/invoices?id=" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal menghapus invoice.");
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
