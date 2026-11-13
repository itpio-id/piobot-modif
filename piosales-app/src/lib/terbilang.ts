const SATUAN = [
  "",
  "Satu",
  "Dua",
  "Tiga",
  "Empat",
  "Lima",
  "Enam",
  "Tujuh",
  "Delapan",
  "Sembilan",
  "Sepuluh",
  "Sebelas",
];

function spell(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${spell(n - 10)} Belas`;
  if (n < 100) return `${spell(Math.floor(n / 10))} Puluh ${spell(n % 10)}`.trim();
  if (n < 200) return `Seratus ${spell(n - 100)}`.trim();
  if (n < 1000) return `${spell(Math.floor(n / 100))} Ratus ${spell(n % 100)}`.trim();
  if (n < 2000) return `Seribu ${spell(n - 1000)}`.trim();
  if (n < 1_000_000) return `${spell(Math.floor(n / 1000))} Ribu ${spell(n % 1000)}`.trim();
  if (n < 1_000_000_000)
    return `${spell(Math.floor(n / 1_000_000))} Juta ${spell(n % 1_000_000)}`.trim();
  if (n < 1_000_000_000_000)
    return `${spell(Math.floor(n / 1_000_000_000))} Miliar ${spell(n % 1_000_000_000)}`.trim();
  return `${spell(Math.floor(n / 1_000_000_000_000))} Triliun ${spell(
    n % 1_000_000_000_000
  )}`.trim();
}

/** Convert a rupiah amount into Indonesian words, e.g. 7400000 -> "Tujuh Juta Empat Ratus Ribu Rupiah" */
export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "Nol Rupiah";
  const words = spell(n).replace(/\s+/g, " ").trim();
  return `${words} Rupiah`;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

export function formatDateID(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
