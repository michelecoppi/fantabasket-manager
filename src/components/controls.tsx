"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 disabled:opacity-50";

const variants = {
  primary: "bg-brand-red text-white hover:brightness-110 disabled:bg-foreground/20 disabled:text-muted",
  secondary: "border border-line bg-surface text-foreground hover:border-brand-blue hover:text-brand-blue disabled:opacity-50",
  danger: "bg-brand-red text-white hover:brightness-110 disabled:bg-foreground/20 disabled:text-muted",
  ghost: "text-muted hover:text-foreground disabled:opacity-50",
} as const;

export function Button({
  variant = "primary",
  pending = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; pending?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || pending}
      className={`font-display inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-lg font-bold tracking-wide transition active:scale-[0.98] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {pending && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/** Pulsante di invio di un `<form>`/`<Form>`: mostra il caricamento finché l'invio (o la navigazione) non finisce. */
export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} className={className}>
      {children}
    </Button>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Scelta singola a pulsanti affiancati (adatta al pollice su telefono). */
export function Segmented<T extends string | number | null>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-11 min-w-14 flex-1 rounded-md border px-3 text-base font-semibold transition disabled:opacity-40 ${
              on ? "border-brand-blue bg-brand-blue text-white" : "border-line bg-surface hover:border-brand-blue"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const callouts = {
  info: "border-brand-blue bg-brand-blue/10",
  warn: "border-amber-500 bg-amber-500/15",
  bad: "border-brand-red bg-brand-red/10",
  good: "border-green-600 bg-green-600/10",
} as const;

export function Callout({ tone = "info", title, children }: { tone?: keyof typeof callouts; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`animate-[fade-in_200ms_ease-out] rounded-md border-l-4 px-3 py-2.5 text-sm ${callouts[tone]}`}>
      {title && <div className="font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 text-base ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" className="h-5 w-5 accent-[var(--brand-red)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
