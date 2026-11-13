import { useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { DiscountType, Invoice, InvoiceItem } from "@/types";
import { emptyItem, invoiceItemDiscount, invoiceItemSubtotal, invoiceItemTotal, invoiceTotalDiscount } from "@/types";
import { Button, Field, Input, Select, Textarea } from "./ui";
import { formatRupiah } from "@/lib/terbilang";
import { enrichWithAI } from "@/lib/api";

export function ItemsEditor({
  invoice,
  onChange,
}: {
  invoice: Invoice;
  onChange: (next: Invoice) => void;
}) {
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    onChange({
      ...invoice,
      items: invoice.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  }

  function addItem() {
    onChange({ ...invoice, items: [...invoice.items, emptyItem()] });
  }

  function removeItem(id: string) {
    if (invoice.items.length <= 1) return;
    onChange({ ...invoice, items: invoice.items.filter((it) => it.id !== id) });
  }

  async function handleEnrich(item: InvoiceItem) {
    if (!item.name.trim()) return;
    setEnrichingId(item.id);
    const result = await enrichWithAI({
      itemName: item.name,
      description: item.description,
      kind: "item",
    });
    setEnrichingId(null);
    if (result) {
      updateItem(item.id, { description: result.description });
    } else {
      alert(
        "AI enrich belum aktif. Pastikan ANTHROPIC_API_KEY sudah diset di environment Vercel, lalu deploy ulang."
      );
    }
  }

  return (
    <div className="space-y-3">
      {invoice.items.map((item, idx) => (
        <div key={item.id} className="rounded-xl border border-slate-200 p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Item #{idx + 1}</span>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              disabled={invoice.items.length <= 1}
              className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`Hapus item ${idx + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Field label="Nama item">
              <Input
                value={item.name}
                onChange={(e) => updateItem(item.id, { name: e.target.value })}
                placeholder="Mis. Ganti Baterai iPhone 12"
              />
            </Field>
            <Field label="Qty">
              <Input
                type="number"
                min={0}
                className="sm:w-24"
                value={item.qty}
                onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Harga satuan (Rp)">
              <Input
                type="number"
                min={0}
                className="sm:w-36"
                value={item.price}
                onChange={(e) => updateItem(item.id, { price: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-600">Deskripsi / catatan item</span>
              <Button
                type="button"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[12px] text-brand-700"
                loading={enrichingId === item.id}
                disabled={!item.name.trim()}
                onClick={() => handleEnrich(item)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Sempurnakan dengan AI
              </Button>
            </div>
            <Textarea
              rows={2}
              value={item.description}
              onChange={(e) => updateItem(item.id, { description: e.target.value })}
              placeholder="Deskripsi singkat pekerjaan/barang (opsional, bisa disempurnakan AI)"
            />
          </div>

          <div className="mt-3 grid max-w-[420px] grid-cols-2 gap-3">
            <Field label="Jenis diskon item">
              <Select
                value={item.discountType}
                onChange={(e) => {
                  const discountType = e.target.value as DiscountType;
                  updateItem(item.id, {
                    discountType,
                    discountValue: discountType === "percent" ? Math.min(item.discountValue, 100) : item.discountValue,
                  });
                }}
              >
                <option value="amount">Nominal (Rp)</option>
                <option value="percent">Persen (%)</option>
              </Select>
            </Field>
            <Field label={item.discountType === "percent" ? "Diskon (%)" : "Diskon (Rp)"}>
              <Input
                type="number"
                min={0}
                max={item.discountType === "percent" ? 100 : undefined}
                step={item.discountType === "percent" ? 0.1 : 1}
                value={item.discountValue}
                onChange={(e) => {
                  const value = Math.max(0, Number(e.target.value) || 0);
                  updateItem(item.id, { discountValue: item.discountType === "percent" ? Math.min(value, 100) : value });
                }}
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-400">Diskon nominal berlaku untuk seluruh baris item. Diskon maksimum sebesar subtotal item.</p>

          <div className="mt-2 flex flex-wrap justify-end gap-x-3 gap-y-1 text-right text-[13px]">
            <span className="text-slate-500">Subtotal: {formatRupiah(invoiceItemSubtotal(item))}</span>
            {invoiceItemDiscount(item) > 0 && (
              <span className="font-semibold text-rose-600">Diskon: -{formatRupiah(invoiceItemDiscount(item))}</span>
            )}
            <span className="font-bold text-slate-700">Jumlah item: {formatRupiah(invoiceItemTotal(item))}</span>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" className="w-full gap-2" onClick={addItem}>
        <Plus className="h-4 w-4" />
        Tambah Item
      </Button>

      <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3.5">
        <div className="mb-2">
          <div className="text-[13px] font-bold text-slate-700">Diskon total invoice</div>
          <div className="mt-0.5 text-xs text-slate-500">Dihitung setelah seluruh diskon item.</div>
        </div>
        <div className="grid max-w-[420px] grid-cols-2 gap-3">
          <Field label="Jenis diskon total">
            <Select
              value={invoice.totalDiscountType}
              onChange={(e) => {
                const totalDiscountType = e.target.value as DiscountType;
                onChange({
                  ...invoice,
                  totalDiscountType,
                  totalDiscountValue:
                    totalDiscountType === "percent" ? Math.min(invoice.totalDiscountValue, 100) : invoice.totalDiscountValue,
                });
              }}
            >
              <option value="amount">Nominal (Rp)</option>
              <option value="percent">Persen (%)</option>
            </Select>
          </Field>
          <Field label={invoice.totalDiscountType === "percent" ? "Diskon total (%)" : "Diskon total (Rp)"}>
            <Input
              type="number"
              min={0}
              max={invoice.totalDiscountType === "percent" ? 100 : undefined}
              step={invoice.totalDiscountType === "percent" ? 0.1 : 1}
              value={invoice.totalDiscountValue}
              onChange={(e) => {
                const value = Math.max(0, Number(e.target.value) || 0);
                onChange({
                  ...invoice,
                  totalDiscountValue: invoice.totalDiscountType === "percent" ? Math.min(value, 100) : value,
                });
              }}
            />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">Nominal maksimal sebesar jumlah setelah diskon item.</span>
          {invoiceTotalDiscount(invoice) > 0 && (
            <span className="font-semibold text-rose-600">Potongan total: -{formatRupiah(invoiceTotalDiscount(invoice))}</span>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Tanpa stok — item &amp; jumlah cukup diinput manual. Untuk hasil cetak A5 rapi, idealnya maks. 8 item per
        invoice.
      </p>
    </div>
  );
}
