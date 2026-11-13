import { useEffect, useRef, useState } from "react";

/**
 * Keeps a fixed-size inner layout (designed at `baseWidth` x `baseHeight` px)
 * and visually scales it to fit the available width via CSS transform.
 * This avoids text reflow / weird wrapping on small screens — the DOM layout
 * never changes, only its visual scale — which is what keeps the invoice
 * preview looking identical on phone, tablet and desktop, and keeps the
 * html2canvas export pixel-perfect regardless of viewport.
 */
export function ScaledFrame({
  baseWidth,
  baseHeight,
  className,
  frameRef,
  children,
}: {
  baseWidth: number;
  baseHeight: number;
  className?: string;
  frameRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setScale(Math.min(width / baseWidth, 1.6));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);

  return (
    <div ref={wrapRef} className={className} style={{ height: baseHeight * scale }}>
      <div
        style={{
          width: baseWidth,
          height: baseHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div ref={frameRef} style={{ width: baseWidth, height: baseHeight }}>
          {children}
        </div>
      </div>
    </div>
  );
}
