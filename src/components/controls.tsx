"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "@/components/icons";

export const inputClass =
  "w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none transition-[border-color,box-shadow] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15 disabled:opacity-50";

const variants = {
  primary: "bg-brand-red text-white shadow-[0_8px_20px_-10px_var(--brand-red)] hover:brightness-110 disabled:bg-foreground/20 disabled:text-muted disabled:shadow-none",
  secondary: "border border-line bg-surface text-foreground hover:border-brand-blue hover:text-brand-blue disabled:opacity-50",
  danger: "bg-brand-red text-white hover:brightness-110 disabled:bg-foreground/20 disabled:text-muted",
  gold: "bg-gold text-nav shadow-[0_8px_24px_-10px_var(--gold)] hover:brightness-105 disabled:opacity-50",
  ghost: "text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-50",
} as const;

export function Button({
  variant = "primary",
  pending = false,
  icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; pending?: boolean; icon?: IconName }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || pending}
      aria-busy={pending || undefined}
      className={`font-display inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-lg font-extrabold tracking-wide transition-[transform,filter,background-color,border-color,color,box-shadow] duration-150 active:scale-[0.97] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {pending ? <Icon name="ball" size={18} strokeWidth={2} className="ball-spin" /> : icon && <Icon name={icon} size={18} strokeWidth={2.1} />}
      {children}
    </button>
  );
}

/** Pulsante di invio di un `<form>`/`<Form>`: mostra il caricamento finché l'invio (o la navigazione) non finisce. */
export function SubmitButton({ children, className, icon, variant }: { children: ReactNode; className?: string; icon?: IconName; variant?: keyof typeof variants }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} className={className} icon={icon} variant={variant}>
      {children}
    </Button>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow mb-1 block text-muted">
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
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-surface-subtle p-1">
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
            className={`min-h-11 min-w-12 flex-1 rounded-lg px-3 text-base font-semibold transition-[background-color,color,box-shadow] disabled:opacity-40 ${
              on ? "bg-brand-blue text-white shadow-md dark:bg-gold dark:text-nav" : "text-muted hover:bg-surface hover:text-foreground"
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
  info: { box: "border-brand-blue/40 bg-brand-blue/8", icon: "info", color: "text-brand-blue" },
  warn: { box: "border-warning/45 bg-warning/10", icon: "alert", color: "text-warning" },
  bad: { box: "border-danger/45 bg-danger/8", icon: "alert", color: "text-danger" },
  good: { box: "border-success/40 bg-success/8", icon: "check", color: "text-success" },
} as const;

export function Callout({ tone = "info", title, children }: { tone?: keyof typeof callouts; title?: string; children?: ReactNode }) {
  const c = callouts[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex animate-[fade-in_200ms_ease-out] gap-3 rounded-xl border px-3.5 py-3 text-sm ${c.box}`}>
      <span className={`mt-0.5 shrink-0 ${c.color}`}>
        <Icon name={c.icon} size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 text-base ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" className="h-5 w-5 accent-[var(--brand-blue)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
