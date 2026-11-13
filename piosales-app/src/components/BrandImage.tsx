import { useState } from "react";

/**
 * Renders the first working <img> from a list of candidate paths (so both
 * .png and .jpg drops work without code changes), falling back to `children`
 * (a placeholder) if none of them exist yet.
 */
export function BrandImage({
  srcs,
  alt,
  className,
  children,
}: {
  srcs: string[];
  alt: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);

  if (attempt >= srcs.length) return <>{children}</>;

  return (
    <img
      key={srcs[attempt]}
      src={srcs[attempt]}
      alt={alt}
      className={className}
      onError={() => setAttempt((n) => n + 1)}
    />
  );
}
