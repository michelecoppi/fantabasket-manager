import type { ReactNode } from "react";

const tones = {
  neutral: "border-line bg-surface-subtle text-foreground/80",
  good: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  bad: "border-danger/30 bg-danger/10 text-danger",
  accent: "border-brand-blue/30 bg-brand-blue/10 text-brand-blue",
} as const;

export function Badge({ tone = "neutral", children, title }: { tone?: keyof typeof tones; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded-[2px] border px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-wide uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" }) {
  return (
    <div>
      <div className="eyebrow text-muted">{label}</div>
      <div className={`font-display text-3xl leading-tight font-bold tabular-nums ${tone === "bad" ? "text-danger" : ""}`}>{value}</div>
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
      <div className="eyebrow text-muted">{label}</div>
      <div className={`font-display text-3xl leading-tight font-bold tabular-nums ${bad ? "text-danger" : ""}`}>{fmt1(after)}</div>
      <div className="text-xs text-muted tabular-nums">
        {delta === 0 ? "invariato" : (
          <>
            <span className={worse ? "text-danger" : delta > 0 && worseWhenLower ? "text-success" : ""}>{delta > 0 ? "▲ +" : "▼ −"}{fmt1(Math.abs(delta))}</span> · era {fmt1(before)}
          </>
        )}
      </div>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6 border-b border-line pb-5">
      <h1 className="font-display text-5xl leading-[0.95] font-extrabold sm:text-6xl">{children}</h1>
      {sub && <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-surface ${className}`}>{children}</div>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-2">
        <h2 className="font-display text-3xl leading-none font-bold">{title}</h2>
        {aside && <span className="text-right text-xs text-muted">{aside}</span>}
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
