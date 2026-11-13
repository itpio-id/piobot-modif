import { BrandImage } from "./BrandImage";

/** Placeholder reconstruction of the ITPIO pillar mark, used until /assets/logo.* is uploaded. */
function PlaceholderMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="ITPIO">
      <defs>
        <linearGradient id="itpio-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="34" fill="none" stroke="url(#itpio-grad)" strokeWidth="3" opacity="0.55" />
      <rect x="34" y="24" width="32" height="8" rx="1.5" fill="url(#itpio-grad)" />
      <rect x="46" y="24" width="8" height="52" fill="url(#itpio-grad)" />
      <path d="M50 30 h9 a10 10 0 0 1 0 20 h-9 z" fill="none" stroke="url(#itpio-grad)" strokeWidth="7" strokeLinejoin="round" />
      <rect x="34" y="68" width="32" height="8" rx="1.5" fill="url(#itpio-grad)" />
    </svg>
  );
}

const IMG_EXTS = ["png", "jpg", "jpeg", "webp"];
const withExts = (base: string) => IMG_EXTS.map((ext) => `/assets/${base}.${ext}`);

export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <BrandImage srcs={withExts("logo")} alt="ITPIO" className={className + " object-contain"}>
      <PlaceholderMark className={className} />
    </BrandImage>
  );
}

export function SignatureMark({ className = "h-16" }: { className?: string }) {
  return (
    <BrandImage srcs={withExts("signature")} alt="Tanda tangan Fionni" className={className + " object-contain"}>
      <span
        className={className + " flex items-center justify-center italic text-slate-700"}
        style={{ fontFamily: "'Caveat', cursive", fontSize: "2.25rem", lineHeight: 1 }}
      >
        Fionni
      </span>
    </BrandImage>
  );
}

export function QrisMark({ className = "h-32 w-32" }: { className?: string }) {
  return (
    <BrandImage srcs={withExts("qris")} alt="QRIS ITPIO" className={className + " object-contain"}>
      <div
        className={
          className +
          " flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-2 text-center"
        }
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-slate-400" fill="currentColor">
          <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm-2 4h4v2h-4v-2z" />
        </svg>
        <span className="text-[9px] leading-tight text-slate-400">Upload qris.png</span>
      </div>
    </BrandImage>
  );
}
