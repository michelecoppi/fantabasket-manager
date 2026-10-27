import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { stagger } from "@/components/ui";
import type { PlanSeason } from "@/lib/cap-planner";
import { fmt } from "@/lib/format";

/**
 * Pezzi del planner del cap (issue #46): etichette di natura del dato, meter di stagione, legenda e panoramica della lega.
 * Regola P3-03: ogni numero dichiara se è scritto nel contratto, calcolato dalle regole o frutto di un'ipotesi.
 */
export type ValueKind = "nominal" | "calc" | "hyp";

const KIND: Record<ValueKind, { label: string; title: string; className: string }> = {
  nominal: { label: "Nominale", title: "Scritto nel contratto", className: "bg-foreground/8 text-foreground/70" },
  calc: { label: "Calcolato", title: "Ricavato dalle regole di lega e da league_settings", className: "bg-brand-blue/12 text-brand-blue" },
  hyp: { label: "Ipotesi", title: "Dipende dalle ipotesi scelte: non è ufficiale", className: "border border-dashed border-warning text-warning" },
};

export function KindTag({ kind }: { kind: ValueKind }) {
  const k = KIND[kind];
  return (
    <span title={k.title} className={`inline-flex h-[1.125rem] shrink-0 items-center rounded px-1.5 text-[0.5625rem] leading-none font-bold tracking-[0.1em] uppercase ${k.className}`}>
      {k.label}
      <span className="sr-only">: {k.title}</span>
    </span>
  );
}

/** Strato del meter: occupa tutta la pista ed è ritagliato sul suo tratto, così cambia senza animare width/left. */
function Layer({ from, to, scale, className, style }: { from: number; to: number; scale: number; className: string; style?: CSSProperties }) {
  const l = Math.max(0, Math.min(100, (from / scale) * 100));
  const r = Math.max(0, Math.min(100, 100 - (to / scale) * 100));
  return (
    <span
      aria-hidden
      className={`absolute inset-0 transition-[clip-path] duration-500 ease-[var(--ease-out)] ${className}`}
      style={{ clipPath: to > from ? `inset(0 ${r}% 0 ${l}%)` : "inset(0 100% 0 0)", ...style }}
    />
  );
}

/** Indicatore verticale sopra la pista (cap), spostato con transform: la percentuale è sulla larghezza della pista. */
function Marker({ value, scale, label, className }: { value: number; scale: number; label: ReactNode; className: string }) {
  const pct = Math.min(100, (value / scale) * 100);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bottom-0 transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${pct}%)` }}>
      <span className={`absolute top-4 h-6 w-0.5 -translate-x-1/2 rounded-full ${className}`} />
      <span className={`absolute top-0 text-[0.625rem] leading-none font-bold tracking-[0.12em] whitespace-nowrap uppercase tnum ${pct > 75 ? "-translate-x-full" : pct < 25 ? "" : "-translate-x-1/2"}`}>{label}</span>
    </span>
  );
}

/**
 * Meter di una stagione: titolari pieni, option a strisce, quote dei tagli e durate da fissare tratteggiate,
 * parte oltre il cap a strisce rosse. Sotto, la forbice del cap col bonus di classifica (R-60).
 * `scale` è comune a tutte le stagioni della squadra, così i meter si confrontano a colpo d'occhio.
 */
export function PlanMeter({ season: s, scale }: { season: PlanSeason; scale: number }) {
  const a = s.starters;
  const b = a + s.options;
  const c = b + s.cuts;
  const over = s.payroll > s.cap;
  const range = s.capRange;
  return (
    <div
      role="img"
      aria-label={`${s.year}: impegni ${fmt(s.payroll)} su cap ${fmt(s.cap)}${over ? `, ${fmt(s.payroll - s.cap)} oltre` : ""}${s.unknown > 0 ? `, più ${fmt(s.unknown)} con durata da fissare` : ""}`}
      className="relative overflow-hidden pt-5 pb-3"
    >
      <div className="relative h-3.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="meter-fill absolute inset-0">
          <Layer from={0} to={a} scale={scale} className="bg-linear-to-r from-brand-blue to-[#4f7bff]" />
          <Layer from={a} to={b} scale={scale} className="stripes bg-brand-blue/70" />
          <Layer from={b} to={c} scale={scale} className="hatch bg-foreground/25 text-foreground" />
          <Layer from={c} to={c + s.unknown} scale={scale} className="hatch text-warning" />
          {over && <Layer from={s.cap} to={s.payroll} scale={scale} className="stripes bg-brand-red" />}
        </div>
      </div>
      <Marker value={s.cap} scale={scale} label={`Cap ${fmt(s.cap)}`} className={over ? "bg-danger" : "bg-foreground"} />
      {range && (
        <span
          aria-hidden
          title={`Cap possibile col bonus di classifica (R-60): da ${fmt(range[0])} a ${fmt(range[1])}`}
          className="absolute bottom-0 h-1 rounded-full bg-gold"
          style={{ left: `${(range[0] / scale) * 100}%`, width: `${((range[1] - range[0]) / scale) * 100}%` }}
        />
      )}
    </div>
  );
}

const SWATCHES: { label: string; className: string; kind: ValueKind; text: string }[] = [
  { label: "Titolari", className: "bg-brand-blue", kind: "nominal", text: "stipendi dei contratti che coprono la stagione" },
  { label: "Team option", className: "stripes bg-brand-blue/70", kind: "hyp", text: "solo se la segni come esercitata (R-22)" },
  { label: "Quote dei tagli", className: "hatch bg-foreground/25 text-foreground", kind: "calc", text: "1/3 dello stipendio finché dura il contratto (R-42)" },
  { label: "Durata da fissare", className: "hatch text-warning ring-1 ring-warning/50 ring-inset", kind: "nominal", text: "oggi pesa; dopo non si sa, quindi resta fuori dal totale" },
  { label: "Forbice del cap", className: "bg-gold", kind: "calc", text: "dall'ultimo al primo posto in classifica (R-60)" },
];

/** Legenda dei colori e dei tre tipi di valore, con le ipotesi che il planner non può conoscere. */
export function PlannerLegend() {
  return (
    <section aria-labelledby="come-leggere" className="mt-12 grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 id="come-leggere" className="font-display text-2xl leading-none font-extrabold">
          Come leggere il planner
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm">
          {SWATCHES.map((s) => (
            <li key={s.label} className="flex items-start gap-3">
              <span aria-hidden className={`mt-1 h-3 w-7 shrink-0 rounded-full ${s.className}`} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{s.label}</span> <span className="text-muted">— {s.text}</span>
              </span>
              <KindTag kind={s.kind} />
            </li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-brand-blue/55 px-1.5 text-[0.6875rem] font-bold text-brand-blue uppercase">
            <Icon name="plus" size={11} strokeWidth={2.6} />
            Option
          </span>
          da toccare per esercitarla; dopo l&apos;ultima stagione
          <span className="rounded-full border border-brand-blue/40 px-1.5 text-[0.6875rem] font-bold text-brand-blue uppercase">Pareggio · RFA</span>
          puoi pareggiare (R-23),
          <span className="rounded-full border border-line px-1.5 text-[0.6875rem] font-bold uppercase">Libero · UFA</span>
          va libero.
        </p>
        <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-3">
          {(["nominal", "calc", "hyp"] as const).map((k) => (
            <div key={k}>
              <dt>
                <KindTag kind={k} />
              </dt>
              <dd className="mt-1 text-xs text-muted">{KIND[k].title}.</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="font-display flex items-center gap-2 text-2xl leading-none font-extrabold">
          <Icon name="info" size={20} className="text-brand-blue" />
          Cosa il planner non sa
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-muted [&>li]:pl-4 [&>li]:-indent-4">
          <li>• Il cap delle stagioni future è il cap base di oggi ({"league_settings"}): parametri e bonus nuovi si decidono alla chiusura.</li>
          <li>• Nessuno scenario si salva e nessuna scelta qui è una decisione: option, tagli e classifica li registrano gli admin.</li>
          <li>• Non conta firme, aste, scambi, pareggi dei restricted né rookie della squadra talenti.</li>
          <li>• Le riserve restano riserve e pesano sul budget riserve, non sul cap.</li>
          <li>• I contratti con durata da fissare pesano solo sulla stagione corrente finché la lega non li decide.</li>
          <li>• Un tagliato in asta preso da un&apos;altra squadra smette di pesare dalla stagione dopo (ipotesi da confermare).</li>
        </ul>
      </div>
    </section>
  );
}

export interface OutlookTeam {
  id: string;
  name: string;
  color: string;
  mine: boolean;
  seasons: PlanSeason[];
  /** stesse stagioni con tutte le team option esercitate */
  withOptions: PlanSeason[];
  href: string;
}

/**
 * Panoramica della lega: spazio sotto il cap base per squadra e stagione, scenario neutro (nessuna option, nessun bonus).
 * Ogni riga apre il planner della squadra.
 */
export function CapOutlook({ teams, years, startersNeeded }: { teams: OutlookTeam[]; years: number[]; startersNeeded: number }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Spazio salariale per squadra e stagione, sul cap base e senza team option</caption>
        <thead>
          <tr>
            <th scope="col" className="eyebrow sticky left-0 z-[1] bg-surface px-3 py-2.5 text-left text-muted sm:px-4">
              Squadra
            </th>
            {years.map((y, k) => (
              <th key={y} scope="col" className="eyebrow px-2 py-2.5 text-right text-muted sm:px-4">
                <span className="font-display block text-xl leading-none font-black text-foreground tnum">{y}</span>
                {k === 0 ? "oggi" : "base"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.id} className={`rise group ${t.mine ? "bg-gold/8" : ""}`} style={stagger(i)}>
              <th scope="row" className={`sticky left-0 z-[1] border-t border-line px-3 py-2.5 text-left font-normal sm:px-4 ${t.mine ? "bg-[color-mix(in_oklab,var(--gold)_8%,var(--surface))]" : "bg-surface"}`}>
                <Link href={t.href} className="flex min-w-0 items-center gap-2.5">
                  <TeamCrest name={t.name} color={t.color} size="sm" mine={t.mine} />
                  <span className="min-w-0">
                    <span className="block max-w-[5.5rem] truncate font-semibold group-hover:underline sm:max-w-none">{t.name}</span>
                    {t.mine && <span className="eyebrow text-highlight">La tua</span>}
                  </span>
                </Link>
              </th>
              {t.seasons.slice(0, years.length).map((s, k) => {
                const opt = t.withOptions[k];
                const extra = Math.round((opt.payroll - s.payroll) * 10) / 10;
                return (
                  <td key={s.year} className="border-t border-line px-2 py-2.5 text-right align-top sm:px-4">
                    <span className={`font-display block text-2xl leading-none font-black tnum ${s.space < 0 ? "text-danger" : ""}`}>
                      {s.space < 0 ? "−" : ""}
                      {fmt(Math.abs(s.space))}
                    </span>
                    <span className="mt-1.5 ml-auto block h-1 w-full max-w-24 overflow-hidden rounded-full bg-foreground/[0.08]">
                      <span className={`meter-fill block h-full rounded-full ${s.space < 0 ? "bg-brand-red" : "bg-brand-blue"}`} style={{ width: `${Math.min(100, (s.payroll / s.cap) * 100)}%` }} />
                    </span>
                    <span className="mt-1 block text-[0.6875rem] leading-4 whitespace-nowrap text-muted tnum">
                      <span title="Titolari sotto contratto">
                        {s.starterCount}/{startersNeeded}
                        <span className="hidden sm:inline"> tit.</span>
                      </span>
                      {extra > 0 && (
                        <span title="Costo delle team option se esercitate tutte" className="block text-brand-blue sm:inline">
                          <span className="hidden sm:inline"> · </span>opt −{fmt(extra)}
                        </span>
                      )}
                    </span>
                    {s.space < 0 && <span className="sr-only">oltre il cap</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
