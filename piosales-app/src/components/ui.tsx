import { forwardRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[13px] font-semibold text-slate-600">{label}</span>
    {children}
    {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
  </label>
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, onFocus, ...props }, ref) => (
    <input
      ref={ref}
      className={cx(
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400",
        "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10",
        className
      )}
      // Numbers default to 0 — select it on focus so typing replaces it
      // instead of prepending (avoids "0300000"-style values).
      onFocus={
        props.type === "number"
          ? (e) => {
              e.target.select();
              onFocus?.(e);
            }
          : onFocus
      }
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx(
        "w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400",
        "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cx(
          "h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-[15px] text-slate-900 outline-none transition",
          "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      >
        <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
);
Select.displayName = "Select";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }
>(({ className, variant = "secondary", loading, disabled, children, ...props }, ref) => {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-r from-brand-500 to-accent-600 text-white shadow-sm shadow-brand-600/20 hover:brightness-105 active:brightness-95",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 active:bg-red-100",
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        variants[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";

export function CheckToggle({
  checked,
  onChange,
  label,
  description,
  accent = "brand",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  accent?: "brand" | "amber";
}) {
  const accentClass = accent === "amber" ? "bg-amber-500 border-amber-500" : "bg-brand-600 border-brand-600";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50"
    >
      <span
        className={cx(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition",
          checked ? accentClass : "border-slate-300 bg-white"
        )}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>
        <span className="block text-[14px] font-semibold text-slate-700">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-400">{description}</span>}
      </span>
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/10 to-accent-600/10 text-brand-600">
          {icon}
        </span>
        <h2 className="text-[15px] font-bold text-slate-800">{title}</h2>
      </div>
      {action}
    </div>
  );
}
