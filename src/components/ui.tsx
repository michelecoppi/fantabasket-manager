import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { fmt } from "@/lib/format";

/** Ritardo di entrata in sequenza per `.rise`/`.pop` (globals.css): style={stagger(i)}. */
export function stagger(i: number): CSSProperties {
  return { "--i": Math.min(i, 14) } as CSSProperties;
}

const tones = {
  neutral: "border-line bg-surface-subtle text-foreground/80",
  good: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/35 bg-warning/12 text-warning",
  bad: "border-danger/35 bg-danger/10 text-danger",
  accent: "border-brand-blue/30 bg-brand-blue/10 text-brand-blue",
  gold: "border-gold/60 bg-gold text-nav",
} as const;

export function Badge({ tone = "neutral", children, title, icon }: { tone?: keyof typeof tones; children: ReactNode; title?: string; icon?: IconName }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] leading-4 font-bold tracking-wide whitespace-nowrap uppercase ${tones[tone]}`}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
      {title && <span className="sr-only"> ({title})</span>}
    </span>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: "bad"; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow truncate text-muted">{label}</div>
      <div className={`font-display tnum text-4xl leading-none font-extrabold ${tone === "bad" ? "text-danger" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Valore dopo un'operazione, con quello di prima sotto: non va a capo su telefono e mostra la direzione. */
export function StatChange({ label, before, after, worseWhenLower = false, bad }: { label: string; before: number; after: number; worseWhenLower?: boolean; bad?: boolean }) {
  const delta = Math.round((after - before) * 10) / 10;
  const worse = worseWhenLower ? delta < 0 : false;
  const better = worseWhenLower && delta > 0;
  return (
    <div className="min-w-0">
      <div className="eyebrow truncate text-muted">{label}</div>
      <div className={`font-display tnum text-4xl leading-none font-extrabold ${bad ? "text-danger" : ""}`}>{fmt(after)}</div>
      <div className="mt-1 text-xs text-muted tnum">
        {delta === 0 ? (
          "invariato"
        ) : (
          <>
            <span className={`font-bold ${worse ? "text-danger" : better ? "text-success" : "text-foreground"}`}>
              {delta > 0 ? "▲ +" : "▼ −"}
              {fmt(Math.abs(delta))}
            </span>{" "}
            · era {fmt(before)}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Intestazione di pagina "arena": banda scura con le linee del campo, icona, titolo grande.
 * `aside`: numeri chiave della pagina, a destra su desktop e sotto su mobile.
 */
export function PageTitle({ children, sub, eyebrow, icon, aside }: { children: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; icon?: IconName; aside?: ReactNode }) {
  return (
    <div className="arena sweep -mx-4 mb-8 px-5 py-7 sm:mx-0 sm:rounded-2xl sm:px-8 sm:py-9">
      <div className="relative z-[2] flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {(eyebrow || icon) && (
            <div className="rise flex items-center gap-2.5 text-white/65">
              {icon && (
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-nav">
                  <Icon name={icon} size={18} strokeWidth={2} />
                </span>
              )}
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            </div>
          )}
          <h1 className="rise font-display mt-3 text-[clamp(2.75rem,7vw,5rem)] leading-[0.86] font-black" style={stagger(1)}>
            {children}
          </h1>
          {sub && (
            <p className="rise mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:text-[0.9375rem]" style={stagger(2)}>
              {sub}
            </p>
          )}
        </div>
        {aside && (
          <div className="rise shrink-0" style={stagger(3)}>
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}

/** Numeri chiave dentro una superficie scura (PageTitle aside, hero): stile tabellone. */
export function Scoreboard({ items }: { items: { label: string; value: ReactNode; tone?: "bad" | "gold" }[] }) {
  return (
    <dl
      className={`grid gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12 ${items.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "auto-cols-fr grid-flow-col"}`}
    >
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col justify-between gap-0.5 bg-[#060a16]/85 px-3.5 py-3 backdrop-blur-sm sm:px-5">
          <dt className="eyebrow leading-tight text-white/55">{it.label}</dt>
          <dd className={`font-display tnum text-3xl leading-none font-extrabold sm:text-4xl ${it.tone === "bad" ? "text-[#ff8a95]" : it.tone === "gold" ? "jumbo" : "text-white"}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface shadow-[0_1px_0_rgb(6_10_20/0.04)] ${className}`}>{children}</div>;
}

export function Section({ title, children, aside, icon, id }: { title: string; children: ReactNode; aside?: ReactNode; icon?: IconName; id?: string }) {
  return (
    <section className="mt-12 first:mt-0" aria-labelledby={id}>
      <div className="mb-4 flex items-center gap-3">
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-nav text-gold">
            <Icon name={icon} size={17} strokeWidth={2} />
          </span>
        )}
        <h2 id={id} className="font-display min-w-0 flex-1 text-3xl leading-none font-extrabold sm:flex-none">
          {title}
        </h2>
        <span aria-hidden className="hidden h-px flex-1 bg-linear-to-r from-line to-transparent sm:block" />
        {aside && <span className="shrink-0 text-right text-xs font-semibold text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Stato vuoto con icona e, se c'è, un'azione reale. */
export function Empty({ title, children, icon = "ball" }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-subtle text-muted">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="font-display mt-3 text-2xl font-extrabold">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

const POS_STYLE: Record<string, string> = {
  G: "bg-brand-blue text-white",
  A: "bg-gold text-nav",
  C: "bg-brand-red text-white",
};
const POS_NAME: Record<string, string> = { G: "Guardia", A: "Ala", C: "Centro" };

/** Ruolo del giocatore come gettone colorato (G blu, A oro, C rosso); `?` se il ruolo non è noto. */
export function PosChip({ pos }: { pos: string | null }) {
  return (
    <span
      title={pos ? POS_NAME[pos] : "Ruolo non indicato"}
      className={`font-display grid h-7 w-7 shrink-0 place-items-center rounded-md text-base leading-none font-black ${pos ? POS_STYLE[pos] : "border border-dashed border-line text-muted"}`}
    >
      <span aria-hidden>{pos ?? "?"}</span>
      <span className="sr-only">{pos ? POS_NAME[pos] : "Ruolo non indicato"}</span>
    </span>
  );
}

/**
 * Durata del contratto come tacche: piena = stagione, mezza = mezza stagione, tratteggiata = team option (+1).
 * `label` resta il testo del foglio ("2", "1+1", "?").
 */
export function ContractPips({ years, option, label }: { years: number | null; option: boolean; label: string }) {
  if (years === null) {
    return (
      <span title="Durata da fissare" className="inline-flex items-center gap-1.5 text-xs font-bold text-warning">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-dashed border-current" />?
        <span className="sr-only">Durata da fissare</span>
      </span>
    );
  }
  const full = Math.floor(years);
  const half = years % 1 !== 0;
  const title = `${label} — ${years === 0.5 ? "mezza stagione" : `${fmt(years)} ${years === 1 ? "stagione" : "stagioni"}`}${option ? " + team option" : ""}`;
  return (
    <span title={title} className="inline-flex items-center gap-1.5">
      <span className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: Math.min(full, 5) }, (_, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-full bg-foreground/80" />
        ))}
        {half && <span className="h-2.5 w-2.5 rounded-full bg-linear-to-r from-foreground/80 from-50% to-foreground/15 to-50%" />}
        {option && <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-brand-blue" />}
      </span>
      <span className="tnum w-7 text-xs font-semibold text-muted">{label}</span>
      <span className="sr-only">{title}</span>
    </span>
  );
}

/** "r" = contratto rookie (R-26), "u" = unrestricted alla scadenza (R-23/R-24). */
export function RestrictionBadge({ rookie, restriction }: { rookie: boolean; restriction: "unrestricted" | null }) {
  return (
    <>
      {rookie && (
        <Badge tone="accent" title="Contratto rookie">
          r
        </Badge>
      )}
      {restriction === "unrestricted" && <Badge title="Unrestricted: a fine contratto va libero">u</Badge>}
    </>
  );
}
