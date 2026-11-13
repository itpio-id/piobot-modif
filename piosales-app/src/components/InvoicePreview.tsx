import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import type { Invoice } from "@/types";
import {
  invoiceDue,
  invoiceItemDiscount,
  invoiceItemDiscountTotal,
  invoiceItemTotal,
  invoiceSubtotal,
  invoiceTotal,
  invoiceTotalDiscount,
} from "@/types";
import { formatDateID, formatRupiah, terbilang } from "@/lib/terbilang";
import { LogoMark, QrisMark, SignatureMark } from "./LogoMark";

export const PREVIEW_WIDTH = 560;
export const PREVIEW_HEIGHT = 794; // A5 ratio (148:210)

const PAGE_PADDING = 28;
const CONTENT_WIDTH = PREVIEW_WIDTH - PAGE_PADDING * 2;
const CONTENT_HEIGHT = PREVIEW_HEIGHT - PAGE_PADDING * 2;

// Plain hex-stop gradients (no Tailwind oklch/color-mix utilities) so PDF/JPG
// export via html2canvas renders identically to the on-screen preview.
const TINT_GRADIENT = { backgroundImage: "linear-gradient(135deg, #f0fdfa, #eff6ff)" };
const TINT_GRADIENT_H = { backgroundImage: "linear-gradient(90deg, #f0fdfa, #eff6ff)" };

export const InvoicePreview = forwardRef<HTMLDivElement, { invoice: Invoice }>(function InvoicePreview(
  { invoice },
  ref
) {
  const subtotal = invoiceSubtotal(invoice);
  const itemDiscount = invoiceItemDiscountTotal(invoice);
  const totalDiscount = invoiceTotalDiscount(invoice);
  const total = invoiceTotal(invoice);
  const due = invoiceDue(invoice);

  // Kalau item terlalu banyak, isi nota otomatis diperkecil supaya tetap muat
  // satu halaman A5 — daripada bagian bawah (catatan & tanda tangan) terpotong.
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Ukur selalu dari kondisi acuan (tanpa skala, lebar ditentukan di sini) supaya
    // hasilnya stabil dan tidak saling kejar dengan skala yang sedang terpasang.
    const appliedWidth = el.style.width;
    const appliedTransform = el.style.transform;
    el.style.transform = "none";
    const heightAtScale = (s: number) => {
      el.style.width = `${CONTENT_WIDTH / s}px`;
      return el.scrollHeight;
    };
    const clamp = (s: number) => Math.min(Math.max(s, 0.55), 1.18);

    // Isi nota diskala agar mengisi tinggi A5: mengecil kalau item banyak,
    // sedikit membesar kalau cuma 1-2 item (batas 1.25 supaya tetap proporsional).
    let next = clamp(CONTENT_HEIGHT / heightAtScale(1));
    // Lebar dikompensasi 1/skala, jadi saat membesar kolom sempit (catatan di samping
    // QRIS) makin banyak terlipat dan isinya lebih tinggi dari hasil ukur di atas.
    // Cek ulang di lebar sebenarnya; kalau tidak muat, turunkan skala seperlunya
    // (lebar jadi lebih lega, jadi tingginya pasti tidak bertambah).
    const actual = heightAtScale(next);
    if (actual * next > CONTENT_HEIGHT) next = clamp(CONTENT_HEIGHT / actual);

    el.style.width = appliedWidth;
    el.style.transform = appliedTransform;
    setScale((prev) => (Math.abs(prev - next) > 0.004 ? next : prev));
  });

  return (
    <div
      ref={ref}
      className="invoice-paper relative overflow-hidden bg-white font-sans text-slate-900"
      style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, padding: PAGE_PADDING }}
    >
      <div
        ref={contentRef}
        className="flex flex-col"
        style={{
          // Lebar dikompensasi 1/skala supaya setelah diperkecil isinya tetap
          // memenuhi lebar halaman, bukan menyisakan margin kanan yang lebar.
          width: CONTENT_WIDTH / scale,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
      {/* Header: identitas + kontak di kiri, nomor & tanggal invoice di kanan */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark className="h-16 w-16 shrink-0" />
          <div>
            <div className="text-[11px] font-semibold leading-tight text-slate-600">IT Partner In One</div>
            <div className="mt-0.5 whitespace-nowrap text-[7.5px] font-semibold uppercase tracking-wide text-brand-600">
              Gadget Solutions &bull; Software Apps &bull; IT Maintenance
            </div>
          </div>
        </div>
        <div className="min-w-0 pt-1 text-right">
          <div className="text-[11px] font-semibold leading-tight text-slate-600">Surabaya - Sidoarjo</div>
          <div className="mt-1 space-y-px text-[8.5px] leading-snug text-slate-500">
            <div>083125299879</div>
            <div>itpio@itpio.id</div>
            <div>www.itpio.id</div>
          </div>
        </div>
      </div>

      <div className="my-3 h-px bg-slate-200" />

      {/* Bill to (kiri) berdampingan dengan blok INVOICE + tanggal (kanan) */}
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
        <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Kepada Yth:</div>
        <div className="text-[12px] font-bold text-slate-800">{invoice.customerName || "Nama Customer"}</div>
        {invoice.customerCompany && (
          <div className="text-[10px] font-semibold text-slate-600">{invoice.customerCompany}</div>
        )}
        {invoice.customerAddress && (
          <div className="text-[9.5px] leading-snug text-slate-500">{invoice.customerAddress}</div>
        )}
        {(invoice.customerPhone || invoice.customerEmail) && (
          <div className="text-[9.5px] text-slate-500">
            {[invoice.customerPhone, invoice.customerEmail].filter(Boolean).join(" • ")}
          </div>
        )}
        </div>

        <div className="shrink-0 text-right">
          <div
            className="rounded-lg border-l-[3px] border-accent-600 px-3 py-1.5"
            style={TINT_GRADIENT}
          >
            <div className="text-[15px] font-extrabold leading-tight text-accent-700">INVOICE</div>
            <div className="text-[9px] font-bold text-slate-600">No: {invoice.invoiceNo || "-"}</div>
          </div>
          <div className="mt-1.5 space-y-px text-[9px] leading-snug text-slate-500">
            <div>
              Tanggal: <span className="font-semibold text-slate-700">{formatDateID(invoice.invoiceDate)}</span>
            </div>
            <div>
              Jatuh Tempo: <span className="font-bold text-accent-700">{formatDateID(invoice.dueDate)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-[8px] font-bold uppercase tracking-wide text-slate-500" style={TINT_GRADIENT_H}>
            <th className="rounded-l-md px-2 py-1.5 font-bold">Deskripsi</th>
            <th className="px-1 py-1.5 text-center font-bold">Qty</th>
            <th className="px-1 py-1.5 text-right font-bold">Harga</th>
            <th className="px-1 py-1.5 text-right font-bold">Diskon</th>
            <th className="rounded-r-md px-2 py-1.5 text-right font-bold">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100 align-top">
              <td className="px-2 py-1.5">
                <div className="text-[10.5px] font-semibold text-slate-800">{it.name || "Nama item"}</div>
                {it.description && (
                  <div className="mt-0.5 text-[8.5px] leading-snug text-slate-400">{it.description}</div>
                )}
              </td>
              <td className="px-1 py-1.5 text-center text-[9.5px] text-slate-600">{it.qty}</td>
              <td className="px-1 py-1.5 text-right text-[9.5px] text-slate-600">{formatRupiah(it.price)}</td>
              <td className="px-1 py-1.5 text-right text-[8.5px] text-rose-600">
                {invoiceItemDiscount(it) > 0 ? `-${formatRupiah(invoiceItemDiscount(it))}` : "—"}
              </td>
              <td className="px-2 py-1.5 text-right text-[9.5px] font-semibold text-slate-700">
                {formatRupiah(invoiceItemTotal(it))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals + terbilang (LUNAS stamp anchors here, not to page whitespace) */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="rounded-lg border border-brand-100 px-3 py-2" style={TINT_GRADIENT}>
            <div className="text-[7.5px] font-bold uppercase tracking-wider text-brand-700">Terbilang:</div>
            <div className="text-[9.5px] font-bold italic leading-snug text-slate-700">"{terbilang(total)}"</div>
          </div>

          {/* QRIS (kiri) sejajar dengan catatan pembayaran (kanan) */}
          <div className="mt-3 flex items-start gap-3">
            <div className="flex w-[92px] shrink-0 flex-col items-center gap-1 rounded-lg border border-slate-200 p-2 text-center">
              <QrisMark className="h-[76px] w-[76px]" />
              <div className="text-[7px] font-bold leading-tight text-slate-700">Pembayaran QRIS</div>
              <div className="text-[6px] leading-tight text-slate-400">Scan M-Banking / E-Wallet apa pun</div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-400">
                Catatan Pembayaran &amp; Layanan:
              </div>
              {/* Bullet dipisah dari teks supaya baris yang terlipat tetap rata di kolom sempit ini */}
              <ul className="space-y-1 break-words text-[8.7px] leading-snug text-slate-600">
                <li className="flex gap-1">
                  <span>&bull;</span>
                  <span className="min-w-0">
                    Transfer BCA: <span className="font-bold text-slate-800">0188111117</span> a.n Fionni Sarranova
                  </span>
                </li>
                <li className="flex gap-1">
                  <span>&bull;</span>
                  <span className="min-w-0">
                    Transfer CIMB: <span className="font-bold text-slate-800">7056 4111 1800</span> a.n Fionni
                    Sarranova
                  </span>
                </li>
                <li className="flex gap-1">
                  <span>&bull;</span>
                  <span className="min-w-0">
                    Konfirmasi pembayaran ke: <span className="font-bold text-slate-800">083125299879</span> (WA)
                  </span>
                </li>
                {invoice.warrantyNote && (
                  <li className="flex gap-1 font-semibold text-amber-600">
                    <span>&bull;</span>
                    <span className="min-w-0">{invoice.warrantyNote}</span>
                  </li>
                )}
                {invoice.notes && (
                  <li className="flex gap-1 text-slate-600">
                    <span>&bull;</span>
                    <span className="min-w-0 whitespace-pre-line">{invoice.notes}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
        <div className="w-[150px] shrink-0 text-[9.5px]">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-700">{formatRupiah(subtotal)}</span>
          </div>
          {itemDiscount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Diskon item</span>
              <span className="font-semibold">-{formatRupiah(itemDiscount)}</span>
            </div>
          )}
          {totalDiscount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Diskon total</span>
              <span className="font-semibold">-{formatRupiah(totalDiscount)}</span>
            </div>
          )}
          {invoice.status === "DP" && (
            <div className="flex justify-between text-slate-500">
              <span>Sudah Dibayar</span>
              <span className="font-semibold text-slate-700">-{formatRupiah(invoice.dpAmount)}</span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
            <span className="text-[10px] font-bold text-slate-800">
              {invoice.status === "DP" ? "Sisa Tagihan" : "Total"}
            </span>
            <span className="text-[14px] font-extrabold text-accent-700">
              {formatRupiah(invoice.status === "DP" ? due : total)}
            </span>
          </div>

          {/* Signature sits right under the total, per house style */}
          <div className="mt-3 border-t border-slate-100 pt-2 text-right">
            <div className="text-[7.5px] italic text-slate-400">Dengan Hormat,</div>
            <SignatureMark className="ml-auto h-9" />
            <div className="ml-auto w-[86px]">
              <div className="border-t border-slate-400 pt-0.5 text-center text-[10px] font-bold text-slate-800">
                Fionni
              </div>
              <div className="text-center text-[6.5px] font-semibold uppercase tracking-widest text-slate-400">
                Owner
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Stempel LUNAS: menimpa di tengah halaman, ukuran tetap (tidak ikut
          menyusut walau isi nota diperkecil otomatis). */}
      {invoice.status === "LUNAS" && (
        <div
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
          style={{ opacity: 0.25 }}
        >
          <div
            className="whitespace-nowrap rounded-2xl border-[7px] border-red-500 px-10 py-3 font-black uppercase text-red-500"
            style={{ fontSize: 72, lineHeight: 1.05, letterSpacing: "0.12em", transform: "rotate(-16deg)" }}
          >
            Lunas
          </div>
        </div>
      )}
    </div>
  );
});
