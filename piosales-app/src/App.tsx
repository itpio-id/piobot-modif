import { useEffect, useRef, useState } from "react";
import {
  FileImage,
  FileDown,
  ImageDown,
  FilePlus2,
  History,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Receipt,
  Save,
  UserRound,
} from "lucide-react";
import type { Invoice } from "@/types";
import { emptyInvoice } from "@/types";
import { deleteInvoice, listInvoices, nextInvoiceNo, saveInvoice, saveInvoicePdfToDrive } from "@/lib/api";
import { createInvoicePdfBlob, exportInvoiceAsJpg, exportInvoiceAsPdf } from "@/lib/exportInvoice";
import { LogoMark } from "@/components/LogoMark";
import { Button, Card, CheckToggle, Field, Input, SectionTitle, Textarea } from "@/components/ui";
import { ItemsEditor } from "@/components/ItemsEditor";
import { InvoicePreview, PREVIEW_HEIGHT, PREVIEW_WIDTH } from "@/components/InvoicePreview";
import { ScaledFrame } from "@/components/ScaledFrame";
import { HistoryList } from "@/components/HistoryList";

type Tab = "build" | "history" | "preview";

export default function App() {
  const [embeddedInPiobot] = useState(() =>
    window.parent !== window && new URLSearchParams(window.location.search).get("embedded") === "piobot"
  );
  const [tab, setTab] = useState<Tab>("build");
  const [authRole, setAuthRole] = useState<"loading" | "owner" | "staff" | "public">("loading");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoice, setInvoice] = useState<Invoice>(() => emptyInvoice(nextInvoiceNo([])));
  const [storageMode, setStorageMode] = useState<"remote" | "loading" | "error">("loading");
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "jpg" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleParentTheme(event: MessageEvent<unknown>) {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object" || !("type" in event.data)) return;
      const message = event.data as { type?: unknown; theme?: unknown; payload?: Record<string, unknown> };
      if (message.type === "piobot-theme" && (message.theme === "light" || message.theme === "dark")) {
        document.documentElement.dataset.theme = message.theme;
        return;
      }
      if (message.type !== "piobot-invoice-draft" || authRole !== "owner" || !message.payload) return;
      const draft = message.payload;
      const next = emptyInvoice(nextInvoiceNo(invoices));
      const quantity = Math.max(1, Number(draft.quantity) || 1);
      const price = Math.max(0, Number(draft.suggestedPrice) || 0);
      setInvoice({
        ...next,
        customerName: String(draft.customerName || ""),
        customerPhone: String(draft.customerPhone || ""),
        customerEmail: String(draft.customerEmail || ""),
        customerAddress: String(draft.customerAddress || ""),
        items: [{ ...next.items[0], name: String(draft.itemName || ""), description: [draft.specifications, draft.condition].filter(Boolean).join(" · "), qty: quantity, price }],
        notes: `DRAF — tinjau sebelum digunakan. Saran harga: modal pemasok + biaya terkait + markup kategori ${Number(draft.markupPercent) || 0}%. ${String(draft.formula || "")}`
      });
      setTab("build");
      setToast("Draf invoice PioBot dibuka. Tinjau data dan harga sebelum menyimpan.");
      window.parent.postMessage({ type: "piosales-draft-loaded" }, window.location.origin);
    }

    window.addEventListener("message", handleParentTheme);
    if (embeddedInPiobot && authRole !== "loading") {
      window.parent.postMessage({ type: "piosales-ready" }, window.location.origin);
    }
    return () => window.removeEventListener("message", handleParentTheme);
  }, [embeddedInPiobot, authRole, invoices]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authResponse = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
        const auth = await authResponse.json().catch(() => ({}));
        if (cancelled) return;
        setAuthRole(auth.role === "owner" || auth.role === "staff" ? auth.role : "public");
        if (auth.role !== "owner") {
          setStorageMode("error");
          setInvoicesLoaded(true);
          return;
        }
        setStorageMode("loading");
        const res = await listInvoices();
        if (cancelled) return;
        setInvoices(res.items);
        setStorageMode("remote");
        setInvoice(emptyInvoice(nextInvoiceNo(res.items)));
      } catch (error) {
        if (cancelled) return;
        setStorageMode("error");
        setToast(error instanceof Error ? `Supabase: ${error.message}` : "Gagal memuat invoice dari Supabase.");
      } finally {
        if (!cancelled) setInvoicesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function updateInvoice(patch: Partial<Invoice>) {
    setInvoice((prev) => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const mode = await saveInvoice(invoice);
      setStorageMode(mode);
      const res = await listInvoices();
      setInvoices(res.items);
      const saveMessage = "Invoice tersimpan ke Supabase.";
      try {
        if (!exportRef.current) throw new Error("Preview invoice belum siap dibuat.");
        const pdf = await createInvoicePdfBlob(exportRef.current);
        await saveInvoicePdfToDrive(invoice, pdf);
        setToast(`${saveMessage} PDF juga tersimpan di folder Google Drive piosalesinv.`);
      } catch (driveError) {
        const message = driveError instanceof Error ? driveError.message : "Upload invoice ke Google Drive gagal.";
        setToast(`${saveMessage} Drive: ${message}`);
      }
    } catch (error) {
      setStorageMode("error");
      setToast(error instanceof Error ? `Gagal menyimpan ke Supabase: ${error.message}` : "Gagal menyimpan invoice ke Supabase.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await listInvoices();
      setInvoices(res.items);
      setStorageMode("remote");
      setToast("Riwayat invoice diperbarui.");
    } catch (error) {
      setStorageMode("error");
      setToast(error instanceof Error ? `Gagal memuat riwayat: ${error.message}` : "Gagal memuat riwayat invoice.");
    } finally {
      setRefreshing(false);
    }
  }

  function handleNew() {
    setInvoice(emptyInvoice(nextInvoiceNo(invoices)));
    setTab("build");
  }

  function handleOpen(inv: Invoice) {
    setInvoice(inv);
    setTab("build");
  }

  function handlePreview(inv: Invoice) {
    setInvoice(inv);
    setTab("preview");
  }

  async function handleDelete(inv: Invoice) {
    try {
      await deleteInvoice(inv.id);
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      setToast("Invoice dihapus dari Supabase.");
    } catch (error) {
      setToast(error instanceof Error ? `Gagal menghapus invoice: ${error.message}` : "Gagal menghapus invoice.");
    }
  }

  async function runExport(kind: "pdf" | "jpg", target: Invoice) {
    if (!exportRef.current) return;
    setExporting(kind);
    try {
      const filename = `${target.invoiceNo.replace(/\//g, "-")}`;
      if (kind === "pdf") await exportInvoiceAsPdf(exportRef.current, filename);
      else await exportInvoiceAsJpg(exportRef.current, filename);
    } finally {
      setExporting(null);
    }
  }

  async function handleQuickDownloadFromHistory(inv: Invoice, kind: "pdf" | "jpg") {
    const prevInvoice = invoice;
    setInvoice(inv);
    // Let the hidden export frame re-render with this invoice's data first.
    await new Promise((r) => setTimeout(r, 60));
    try {
      await runExport(kind, inv);
    } finally {
      setInvoice(prevInvoice);
    }
  }

  if (!invoicesLoaded) {
    return <div className="piosales-app flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat invoice dari Supabase...</div>;
  }

  if (authRole !== "owner") {
    return <div className="piosales-app flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <LogoMark className="mx-auto mb-4 h-12 w-12" />
        <h1 className="text-xl font-bold text-slate-900">PioSales khusus pemilik</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Masuk dengan akun Google pemilik di PioBot untuk membuka dan mengelola invoice.</p>
        {authRole === "staff" ? <p className="mt-4 text-sm font-semibold text-amber-700">Akun reviewer tidak memiliki akses kalender atau invoice.</p> : <a className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white" href="/api/google/auth">Masuk dengan Google</a>}
      </div>
    </div>;
  }

  return (
    <div className={`piosales-app min-h-screen bg-slate-50 pb-24 lg:pb-10${embeddedInPiobot ? " piosales-embedded" : ""}`}>
      {/* Off-screen full-resolution copy, used only for PDF/JPG capture so on-screen
          responsive scaling never affects export quality. */}
      <div className="pointer-events-none fixed left-[-9999px] top-0" aria-hidden="true">
        <InvoicePreview ref={exportRef} invoice={invoice} />
      </div>

      <header className="piosales-header sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="piosales-toolbar mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="piosales-brand flex items-center gap-2.5">
            <LogoMark className="h-9 w-9" />
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold text-slate-800">PioSales</div>
              <div className="text-[10.5px] font-medium text-slate-400">Invoice Generator by ITPIO</div>
            </div>
          </div>

          <nav aria-label="Halaman PioSales" className="piosales-tabs flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              onClick={handleNew}
              aria-label="Buat invoice"
              aria-pressed={tab === "build"}
              className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition ${
                tab === "build" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Receipt className="h-5 w-5" strokeWidth={2.25} />
              <span className="piosales-tab-label hidden sm:inline">Buat Invoice</span>
            </button>
            <button
              onClick={() => setTab("history")}
              aria-label="Riwayat invoice"
              aria-pressed={tab === "history"}
              className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition ${
                tab === "history" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <History className="h-5 w-5" strokeWidth={2.25} />
              <span className="piosales-tab-label hidden sm:inline">Riwayat</span>
              {invoices.length > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">
                  {invoices.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("preview")}
              aria-label="Preview invoice"
              aria-pressed={tab === "preview"}
              className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition ${
                tab === "preview" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutTemplate className="h-5 w-5" strokeWidth={2.25} />
              <span className="piosales-tab-label hidden sm:inline">Preview</span>
            </button>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              aria-label="Muat ulang riwayat invoice"
              title="Muat ulang riwayat"
              disabled={refreshing}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2.25} />
            </button>
          </nav>

          <div className="piosales-header-actions flex items-center gap-1.5 sm:gap-2">
            {storageMode === "error" && (
              <span
                className="hidden rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 sm:inline-flex"
                title="Supabase tidak dapat diakses"
              >
                Supabase bermasalah
              </span>
            )}
            <Button variant="secondary" className="hidden h-9 gap-1.5 px-3 text-[13px] sm:inline-flex" onClick={handleNew}>
              <FilePlus2 className="h-4 w-4" /> Invoice Baru
            </Button>
          </div>
        </div>
      </header>

      <main className="piosales-main mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        {tab === "history" ? (
          <HistoryList
            invoices={invoices}
            onOpen={handleOpen}
            onPreview={handlePreview}
            onDelete={handleDelete}
            onQuickDownload={handleQuickDownloadFromHistory}
          />
        ) : tab === "preview" ? (
          <div className="mx-auto max-w-[440px]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-[13px] font-bold text-slate-700">Preview Invoice (A5)</span>
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setTab("build")}>
                  <UserRound className="h-4 w-4" /> Edit
                </Button>
              </div>
              <div className="flex justify-center bg-slate-100 p-4">
                <ScaledFrame baseWidth={PREVIEW_WIDTH} baseHeight={PREVIEW_HEIGHT} className="w-full max-w-[360px]">
                  <InvoicePreview invoice={invoice} />
                </ScaledFrame>
              </div>
              <div className="grid grid-cols-3 gap-2 p-4">
                <Button variant="primary" loading={saving} onClick={handleSave}>
                  <Save className="h-4 w-4" /> Simpan
                </Button>
                <Button variant="secondary" loading={exporting === "pdf"} onClick={() => runExport("pdf", invoice)}>
                  <FileDown className="h-4 w-4" /> PDF
                </Button>
                <Button variant="secondary" loading={exporting === "jpg"} onClick={() => runExport("jpg", invoice)}>
                  <ImageDown className="h-4 w-4" /> JPG
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
              {/* FORM */}
              <div className="space-y-5">
                <Card>
                  <SectionTitle icon={<UserRound className="h-4 w-4" />} title="Data Customer" />
                  <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                    <Field label="Nama Customer">
                      <Input
                        value={invoice.customerName}
                        onChange={(e) => updateInvoice({ customerName: e.target.value })}
                        placeholder="Mis. Budi Santoso"
                      />
                    </Field>
                    <Field label="No. Telepon / WA">
                      <Input
                        value={invoice.customerPhone}
                        onChange={(e) => updateInvoice({ customerPhone: e.target.value })}
                        placeholder="08xxxxxxxxxx"
                      />
                    </Field>
                    <Field label="Alamat" hint="Opsional">
                      <Textarea
                        rows={2}
                        value={invoice.customerAddress}
                        onChange={(e) => updateInvoice({ customerAddress: e.target.value })}
                        placeholder="Alamat customer"
                      />
                    </Field>
                    <Field label="Perusahaan" hint="Opsional">
                      <Input
                        value={invoice.customerCompany || ""}
                        onChange={(e) => updateInvoice({ customerCompany: e.target.value })}
                        placeholder="Mis. CV Sarana Indah Jaya"
                      />
                    </Field>
                    <Field label="Email" hint="Opsional">
                      <Input
                        type="email"
                        value={invoice.customerEmail || ""}
                        onChange={(e) => updateInvoice({ customerEmail: e.target.value })}
                        placeholder="nama@email.com"
                      />
                    </Field>
                    <Field label="No. Invoice">
                      <Input
                        value={invoice.invoiceNo}
                        onChange={(e) => updateInvoice({ invoiceNo: e.target.value })}
                      />
                    </Field>
                    <Field label="Tanggal Invoice">
                      <Input
                        type="date"
                        value={invoice.invoiceDate}
                        onChange={(e) => updateInvoice({ invoiceDate: e.target.value })}
                      />
                    </Field>
                    <Field label="Jatuh Tempo">
                      <Input
                        type="date"
                        value={invoice.dueDate}
                        onChange={(e) => updateInvoice({ dueDate: e.target.value })}
                      />
                    </Field>

                    <div className="flex flex-col gap-3 sm:col-span-2">
                      <span className="text-[13px] font-semibold text-slate-600">Status Pembayaran</span>
                      <CheckToggle
                        checked={invoice.status === "LUNAS"}
                        onChange={(checked) => updateInvoice({ status: checked ? "LUNAS" : "BELUM LUNAS" })}
                        label="Sudah Lunas"
                        description="Centang kalau customer sudah bayar penuh — stempel LUNAS otomatis muncul di invoice."
                      />
                      <CheckToggle
                        checked={invoice.status === "DP"}
                        onChange={(checked) => updateInvoice({ status: checked ? "DP" : "BELUM LUNAS" })}
                        label="Bayar Sebagian (DP/Cicilan)"
                        description="Centang kalau customer sudah membayar sebagian tagihan."
                        accent="amber"
                      />
                      {invoice.status === "DP" && (
                        <Field label="Total Sudah Dibayar (Rp)">
                          <Input
                            type="number"
                            min={0}
                            value={invoice.dpAmount}
                            onChange={(e) => updateInvoice({ dpAmount: Number(e.target.value) || 0 })}
                          />
                        </Field>
                      )}
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={<Receipt className="h-4 w-4" />} title="Item & Jumlah" />
                  <div className="p-5">
                    <ItemsEditor invoice={invoice} onChange={setInvoice} />
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={<FileImage className="h-4 w-4" />} title="Catatan Tambahan" />
                  <div className="space-y-4 p-5">
                    <Field label="Catatan garansi" hint="Ditampilkan di invoice bila diisi">
                      <Input
                        value={invoice.warrantyNote}
                        onChange={(e) => updateInvoice({ warrantyNote: e.target.value })}
                      />
                    </Field>
                    <Field label="Catatan lain untuk customer" hint="Opsional">
                      <Textarea
                        rows={2}
                        value={invoice.notes}
                        onChange={(e) => updateInvoice({ notes: e.target.value })}
                        placeholder="Mis. jadwal pengambilan, syarat berlaku, dsb."
                      />
                    </Field>
                  </div>
                </Card>
              </div>

              {/* PREVIEW */}
              <div className="hidden lg:block">
                <div className="lg:sticky lg:top-24">
                  <Card className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <span className="text-[13px] font-bold text-slate-700">Preview Invoice (A5)</span>
                    </div>
                    <div className="flex justify-center bg-slate-100 p-4">
                      <ScaledFrame baseWidth={PREVIEW_WIDTH} baseHeight={PREVIEW_HEIGHT} className="w-full max-w-[360px]">
                        <InvoicePreview invoice={invoice} />
                      </ScaledFrame>
                    </div>
                    <div className="grid grid-cols-3 gap-2 p-4">
                      <Button
                        variant="primary"
                        className="col-span-3 sm:col-span-1"
                        loading={saving}
                        onClick={handleSave}
                      >
                        <Save className="h-4 w-4" /> Simpan
                      </Button>
                      <Button
                        variant="secondary"
                        loading={exporting === "pdf"}
                        onClick={() => runExport("pdf", invoice)}
                      >
                        <FileDown className="h-4 w-4" /> PDF
                      </Button>
                      <Button
                        variant="secondary"
                        loading={exporting === "jpg"}
                        onClick={() => runExport("jpg", invoice)}
                      >
                        <ImageDown className="h-4 w-4" /> JPG
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile sticky action bar — hidden on the Preview tab since those same actions
          already sit right below the invoice card there. */}
      {tab === "build" && (
        <div className="piosales-mobile-actions fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl gap-2">
            <Button variant="primary" className="flex-1" loading={saving} onClick={handleSave}>
              <Save className="h-4 w-4" /> Simpan
            </Button>
            <Button
              variant="secondary"
              className="w-14 px-0"
              loading={exporting === "pdf"}
              onClick={() => runExport("pdf", invoice)}
              aria-label="Download PDF"
            >
              <FileDown className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              className="w-14 px-0"
              loading={exporting === "jpg"}
              onClick={() => runExport("jpg", invoice)}
              aria-label="Download JPG"
            >
              <ImageDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}

      {storageMode === "loading" && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat...
        </div>
      )}
    </div>
  );
}
