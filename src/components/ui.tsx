import type { ReactNode } from "react";

const tones = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  good: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  accent: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
} as const;

export function Badge({ tone = "neutral", children, title }: { tone?: keyof typeof tones; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <span className="text-sm text-neutral-500">{aside}</span>}
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
