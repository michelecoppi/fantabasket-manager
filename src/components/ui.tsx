import type { ReactNode } from "react";

const tones = {
  neutral: "bg-foreground/10 text-foreground/80",
  good: "bg-green-600/15 text-green-700 dark:text-green-400",
  warn: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  bad: "bg-brand-red/15 text-brand-red",
  accent: "bg-brand-blue/15 text-brand-blue",
} as const;

export function Badge({ tone = "neutral", children, title }: { tone?: keyof typeof tones; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`font-display text-3xl leading-tight font-bold tabular-nums ${tone === "bad" ? "text-brand-red" : ""}`}>{value}</div>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-surface ${className}`}>{children}</div>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-l-4 border-brand-red pl-3">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        {aside && <span className="text-sm text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** "r" = restricted, "u" = unrestricted alla scadenza (R-23/R-24). */
export function RestrictionBadge({ value }: { value: "restricted" | "unrestricted" | null }) {
  if (!value) return null;
  return value === "restricted" ? (
    <Badge tone="accent" title="Restricted: l'ultimo proprietario può pareggiare l'offerta">r</Badge>
  ) : (
    <Badge title="Unrestricted: a fine contratto va libero">u</Badge>
  );
}
