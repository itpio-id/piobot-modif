import { Eye, FileDown, FileEdit, ImageDown, Pencil, Trash2 } from "lucide-react";
import type { Invoice } from "@/types";
import { invoiceTotal } from "@/types";
import { formatDateID, formatRupiah } from "@/lib/terbilang";
import { Button, Card } from "./ui";

const STATUS_STYLE: Record<Invoice["status"], string> = {
  LUNAS: "bg-emerald-50 text-emerald-600 border-emerald-200",
  "BELUM LUNAS": "bg-amber-50 text-amber-600 border-amber-200",
  DP: "bg-blue-50 text-blue-600 border-blue-200",
};

export function HistoryList({
  invoices,
  onOpen,
  onPreview,
  onDelete,
  onQuickDownload,
}: {
  invoices: Invoice[];
  onOpen: (inv: Invoice) => void;
  onPreview: (inv: Invoice) => void;
  onDelete: (inv: Invoice) => void;
  onQuickDownload: (inv: Invoice, kind: "pdf" | "jpg") => void;
}) {
  if (invoices.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <FileEdit className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">Belum ada invoice tersimpan</p>
        <p className="text-xs text-slate-400">Invoice yang Anda simpan akan muncul di sini.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {invoices.map((inv) => (
        <Card key={inv.id} className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-slate-800">{inv.invoiceNo}</div>
              <div className="truncate text-xs text-slate-400">{formatDateID(inv.invoiceDate)}</div>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[inv.status]}`}
            >
              {inv.status}
            </span>
          </div>
          <div>
            <div className="truncate text-sm font-semibold text-slate-700">
              {inv.customerName || "Tanpa nama customer"}
            </div>
            <div className="text-base font-extrabold text-slate-900">{formatRupiah(invoiceTotal(inv))}</div>
          </div>
          <div className="piosales-history-actions mt-auto flex items-center gap-1.5 border-t border-slate-100 pt-3 sm:gap-2">
            <Button
              variant="secondary"
              className="piosales-history-action h-9 w-9 shrink-0 px-0 min-[761px]:w-auto min-[761px]:flex-1 min-[761px]:px-2 min-[761px]:text-xs"
              onClick={() => onOpen(inv)}
              aria-label="Edit invoice"
              title="Edit invoice"
            >
              <Pencil className="piosales-history-action-icon h-5 w-5" strokeWidth={2.25} />
              <span className="piosales-history-label hidden min-[761px]:inline">Edit</span>
            </Button>
            <Button
              variant="secondary"
              className="piosales-history-action h-9 w-9 shrink-0 px-0 min-[761px]:w-auto min-[761px]:flex-1 min-[761px]:px-2 min-[761px]:text-xs"
              onClick={() => onQuickDownload(inv, "pdf")}
              aria-label={`Unduh PDF ${inv.invoiceNo}`}
              title="Unduh PDF"
            >
              <FileDown className="piosales-history-action-icon h-5 w-5" strokeWidth={2.25} />
              <span className="piosales-history-label hidden min-[761px]:inline">PDF</span>
            </Button>
            <Button
              variant="secondary"
              className="piosales-history-action h-9 w-9 shrink-0 px-0 min-[761px]:w-auto min-[761px]:flex-1 min-[761px]:px-2 min-[761px]:text-xs"
              onClick={() => onQuickDownload(inv, "jpg")}
              aria-label={`Unduh gambar ${inv.invoiceNo}`}
              title="Unduh gambar"
            >
              <ImageDown className="piosales-history-action-icon h-5 w-5" strokeWidth={2.25} />
              <span className="piosales-history-label hidden min-[761px]:inline">Gambar</span>
            </Button>
            <Button
              variant="secondary"
              className="piosales-history-action h-9 w-9 shrink-0 px-0"
              onClick={() => onPreview(inv)}
              aria-label={`Preview invoice ${inv.invoiceNo}`}
              title="Preview invoice"
            >
              <Eye className="piosales-history-action-icon h-5 w-5" strokeWidth={2.25} />
            </Button>
            <Button
              variant="danger"
              className="piosales-history-action h-9 w-9 shrink-0 px-0"
              aria-label="Hapus invoice"
              onClick={() => {
                if (confirm(`Hapus invoice ${inv.invoiceNo}?`)) onDelete(inv);
              }}
            >
              <Trash2 className="piosales-history-action-icon h-5 w-5" strokeWidth={2.25} />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
