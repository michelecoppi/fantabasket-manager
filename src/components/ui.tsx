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

/** Valore dopo un'operazione, con quello di prima sotto: non va a capo su telefono e mostra la direzione. */
export function StatChange({ label, before, after, worseWhenLower = false, bad }: { label: string; before: number; after: number; worseWhenLower?: boolean; bad?: boolean }) {
  const delta = Math.round((after - before) * 10) / 10;
  const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
  const worse = worseWhenLower ? delta < 0 : false;
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`font-display text-3xl leading-tight font-bold tabular-nums ${bad ? "text-brand-red" : ""}`}>{fmt1(after)}</div>
      <div className="text-xs text-muted tabular-nums">
        {delta === 0 ? "invariato" : (
          <>
            <span className={worse ? "text-brand-red" : delta > 0 && worseWhenLower ? "text-green-700 dark:text-green-400" : ""}>{delta > 0 ? "▲ +" : "▼ −"}{fmt1(Math.abs(delta))}</span> · era {fmt1(before)}
          </>
        )}
      </div>
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

/** "r" = contratto rookie (R-26), "u" = unrestricted alla scadenza (R-23/R-24). */
export function RestrictionBadge({ rookie, restriction }: { rookie: boolean; restriction: "unrestricted" | null }) {
  return (
    <>
      {rookie && <Badge tone="accent" title="Contratto rookie">r</Badge>}
      {restriction === "unrestricted" && <Badge title="Unrestricted: a fine contratto va libero">u</Badge>}
    </>
  );
}
