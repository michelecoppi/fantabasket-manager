import { useId } from "react";
import Link from "next/link";
import { ViewSwitch } from "@/components/chips";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { seasonLabel, shortSeasonLabel, winPct, type Career } from "@/lib/league-history";
import { monogram } from "@/lib/team-colors";

/*
 * Albo d'oro: l'anello del campione (R-61: il 1° in classifica vince l'anello). Disegnato come gli anelli NBA di oggi
 * (castone ottagonale con un bordo di diamanti a pavé, pietre nel colore della squadra, trofeo al centro, file di pietre
 * sulle spalle, stagione incisa sulla fascia), senza loghi né trofei NBA: il trofeo è un trofeo generico col pallone.
 */

const sizes = { xs: 22, sm: 34, md: 60, lg: 96, xl: 132 } as const;
export type RingSize = keyof typeof sizes;

// Oro del token `--gold` schiarito o scurito: niente esadecimali, segue il tema.
const GOLD_HI = "color-mix(in oklab, var(--gold) 40%, white)";
const GOLD_LO = "color-mix(in oklab, var(--gold) 62%, black)";
const GOLD_DEEP = "color-mix(in oklab, var(--gold) 40%, black)";
const ICE = "rgb(255 255 255 / 0.96)";
const DISPLAY = "var(--font-display), Impact, sans-serif";

// Castone ottagonale (a gradini verso l'interno: oro, pavé, pietre) e fascia che scende dietro, più spessa ai lati.
const HEAD = "M26 4h48l12 12v40l-12 12H26L14 56V16Z";
const PAVE = "M28.5 8h43l10.5 10.5v35L71.5 64h-43L18 53.5v-35Z";
const FIELD = "M33 14h34l9 9v26l-9 9H33l-9-9V23Z";
const SHANK = "M14 50C14 88 31 110 50 110C69 110 86 88 86 50L76 56C76 82 64 100 50 100C36 100 24 82 24 56Z";

/** Punto sulla linea di mezzo della fascia (lato sinistro, t da 0 = sotto il castone a 1 = in fondo); il destro è speculare. */
function shankPoint(t: number): [number, number] {
  const u = 1 - t;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = [19, 53, 19, 85, 33, 105, 50, 105];
  return [u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3, u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3];
}
/** Pietre sulle spalle: tre per lato, nel colore della squadra. */
const SIDE_STONES = [0.3, 0.44, 0.58].flatMap((t) => {
  const [x, y] = shankPoint(t);
  return [[x, y], [100 - x, y]] as [number, number][];
});

/**
 * Anello del campione. `color` = colore della squadra (le pietre del castone e delle spalle); `year` = stagione vinta
 * (incisa sulla fascia da `md` in su, dove si legge). Decorativo: il testo accanto dice di chi e di che anno è.
 */
export function ChampionRing({ name, color, year, size = "md", className = "" }: { name: string; color: string; year: number; size?: RingSize; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (k: string) => `ring-${k}-${uid}`;
  const url = (k: string) => `url(#${id(k)})`;
  const px = sizes[size];
  const detail = px >= 60;
  return (
    <svg viewBox="0 0 100 114" width={px} height={px * 1.14} className={`shrink-0 drop-shadow-[0_4px_8px_rgb(6_10_20/0.3)] ${className}`} aria-hidden>
      <defs>
        <linearGradient id={id("band")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: GOLD_LO }} />
          <stop offset="0.3" style={{ stopColor: GOLD_HI }} />
          <stop offset="0.62" style={{ stopColor: "var(--gold)" }} />
          <stop offset="1" style={{ stopColor: GOLD_DEEP }} />
        </linearGradient>
        <linearGradient id={id("head")} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" style={{ stopColor: GOLD_HI }} />
          <stop offset="0.45" style={{ stopColor: "var(--gold)" }} />
          <stop offset="1" style={{ stopColor: GOLD_LO }} />
        </linearGradient>
        <pattern id={id("pave")} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" style={{ fill: GOLD_LO }} />
          <circle cx="2" cy="2" r="1.45" fill={ICE} />
          <circle cx="1.5" cy="1.5" r="0.55" fill="rgb(255 255 255)" />
        </pattern>
        <radialGradient id={id("stone")} cx="0.32" cy="0.28" r="0.95">
          <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${color} 50%, white)` }} />
          <stop offset="0.5" style={{ stopColor: color }} />
          <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${color} 55%, black)` }} />
        </radialGradient>
      </defs>

      {/* fascia, con le pietre sulle spalle e la stagione incisa in fondo */}
      <path d={SHANK} fill={url("band")} style={{ stroke: GOLD_DEEP }} strokeWidth="0.8" />
      <path d="M76 56C76 82 64 100 50 100C36 100 24 82 24 56" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="0.7" />
      {SIDE_STONES.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.7" fill={url("stone")} stroke={ICE} strokeWidth="0.8" />
      ))}
      {detail && (
        <text x="50" y="107.5" textAnchor="middle" style={{ fill: "var(--nav)", fontFamily: DISPLAY, fontWeight: 900, fontSize: 6.8, letterSpacing: "0.06em" }}>
          {shortSeasonLabel(year)}
        </text>
      )}

      {/* castone: spessore, oro, pavé di diamanti, pietre della squadra */}
      <path d={HEAD} transform="translate(0 5)" style={{ fill: GOLD_DEEP }} />
      <path d={HEAD} fill={url("head")} style={{ stroke: GOLD_LO }} strokeWidth="1" />
      <path d={PAVE} fill={url("pave")} />
      <path d={FIELD} fill={url("stone")} style={{ stroke: GOLD_HI }} strokeWidth="1.4" />
      <path d="M33 14h34L24 45V23Z" fill="rgb(255 255 255 / 0.16)" />
      <path d={FIELD} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="0.6" transform="translate(50 36) scale(0.84) translate(-50 -36)" />

      {/* trofeo col pallone (generico, non quello NBA) */}
      <g style={{ fill: "var(--gold)", stroke: GOLD_LO }} strokeWidth="0.5">
        <circle cx="50" cy="21" r="3.3" />
        <path d="M43.6 25.5h12.8v5.2a6.4 6.4 0 0 1-12.8 0Z" />
        <path d="M43.8 26.9h-2.4a2.6 2.6 0 0 0 2.6 4.4M56.2 26.9h2.4a2.6 2.6 0 0 1-2.6 4.4" fill="none" style={{ stroke: "var(--gold)" }} strokeWidth="1.2" />
        <path d="M48.7 36.9h2.6v4h-2.6Z" />
        <path d="M44.6 40.9h10.8l1 3.2H43.6Z" />
      </g>
      <path d="M47.6 21h4.8M50 17.7v6.6" style={{ stroke: GOLD_LO }} strokeWidth="0.5" opacity="0.8" />
      {detail && (
        <text x="50" y="54.4" textAnchor="middle" style={{ fill: "var(--gold)", fontFamily: DISPLAY, fontWeight: 900, fontSize: 8, letterSpacing: "0.03em" }}>
          {monogram(name)}
        </text>
      )}

      {/* luce */}
      <path d="M86 1.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill={ICE} />
    </svg>
  );
}

/** Punti fantasy delle classifiche finali, sempre con due decimali come negli screenshot di Dunkest («14.283,50»). */
export const fmtPts = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Anelli in fila con la stagione sotto: profilo della squadra e carriere. Vuoto = niente. */
export function RingRow({ name, color, years, size = "sm", label = true }: { name: string; color: string; years: number[]; size?: RingSize; label?: boolean }) {
  if (years.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-end gap-x-2 gap-y-1" aria-label={`${years.length === 1 ? "Un anello" : `${years.length} anelli`}: ${years.map(seasonLabel).join(", ")}`}>
      {years.map((y, i) => (
        <li key={y} className="pop flex flex-col items-center gap-0.5" style={{ "--i": i } as React.CSSProperties} title={`Campioni ${seasonLabel(y)}`}>
          <ChampionRing name={name} color={color} year={y} size={size} />
          {label && <span className="font-display tnum text-xs leading-none font-black text-highlight">{shortSeasonLabel(y)}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Nome di squadra nello storico: link alla pagina della squadra di oggi, altrimenti testo con lo stemma grigio. `crestName` =
 * nome di oggi per il monogramma dello stemma, se la squadra allora si chiamava diversamente.
 */
export function HistoryTeam({ name, crestName, teamId, color, sub }: { name: string; crestName?: string; teamId: string | null; color: string; sub?: React.ReactNode }) {
  const body = (
    <>
      <TeamCrest name={crestName ?? name} color={color} size="sm" />
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${teamId ? "" : "text-muted"}`}>{name}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </>
  );
  return teamId ? (
    <Link href={`/squadre/${teamId}?vista=vetrina`} className="flex min-w-0 items-center gap-2.5 hover:underline">
      {body}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2.5">{body}</span>
  );
}

/** Linguette di `/classifica` con l'albo d'oro attivo: lo storico è una sezione della classifica, senza voce di menu nuova. */
export function LeagueTabs({ active }: { active: "storia" }) {
  return (
    <ViewSwitch
      label="Sezioni della classifica"
      options={[
        { href: "/classifica", label: "Classifica", hint: "punti, record e forma", icon: "trophy", active: false },
        { href: "/classifica?vista=andamento", label: "Andamento", hint: "giornata per giornata", icon: "chart", active: false },
        { href: "/classifica?vista=calendario", label: "Calendario", hint: "scontri e formazioni", icon: "clock", active: false },
        { href: "/classifica?vista=premi", label: "Premi", hint: "i trofei della giornata", icon: "crown", active: false },
        { href: "/storia", label: "Albo d'oro", hint: "le stagioni passate", icon: "medal", active: active === "storia" },
      ]}
    />
  );
}

const recordText = (r: { wins: number; draws: number; losses: number }) => (r.draws ? `${r.wins}–${r.draws}–${r.losses}` : `${r.wins}–${r.losses}`);

function winPctText(r: { wins: number; draws: number; losses: number }) {
  const p = winPct(r);
  return p === null ? "senza partite" : `${(p * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

/**
 * Storia della squadra (scheda Vetrina): numeri di carriera, anelli e piazzamento di ogni stagione conclusa, dalla più
 * recente. La stagione in corso conta per stagioni e record, non per i piazzamenti.
 */
export function TeamHistory({ career, name, color, currentYear }: { career: Career; name: string; color: string; currentYear: number }) {
  const stats = [
    { label: "In lega dal", value: seasonLabel(career.since) },
    { label: "Stagioni", value: career.seasons },
    { label: "Migliore", value: career.best ? `${career.best.position}°` : "–", gold: career.best?.position === 1 },
    { label: "V–P totali", value: recordText(career) },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="arena rise flex flex-col gap-5 rounded-2xl px-5 py-5">
        <div className="relative z-[2] flex items-center gap-4">
          {career.rings.length > 0 ? (
            <RingRow name={name} color={color} years={career.rings} size="md" />
          ) : (
            <span className="grid h-[4.5rem] w-[3.75rem] place-items-center rounded-2xl border border-dashed border-white/25 text-white/45">
              <Icon name="medal" size={26} />
            </span>
          )}
          <span className="min-w-0">
            <span className="eyebrow block text-white/55">Anelli</span>
            <span className={`font-display tnum block text-5xl leading-none font-black ${career.rings.length ? "jumbo" : "text-white/60"}`}>{career.rings.length}</span>
            <span className="mt-1 block text-xs text-white/65">
              {career.rings.length ? `Campioni ${career.rings.map(seasonLabel).join(", ")}` : "Ancora nessun titolo"}
              {career.podiums > 0 && ` · ${career.podiums} ${career.podiums === 1 ? "podio" : "podi"}`}
            </span>
          </span>
        </div>
        <dl className="relative z-[2] grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col justify-between gap-0.5 bg-board px-3 py-2.5">
              <dt className="eyebrow leading-tight text-white/55">{s.label}</dt>
              <dd className={`font-display tnum text-2xl leading-none font-extrabold ${s.gold ? "text-highlight" : "text-white"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="relative z-[2] text-xs text-white/60">
          {winPctText(career)} di vittorie, compresa la {seasonLabel(currentYear)} in corso{career.live ? ` (${recordText(career.live)})` : ""}.
          {career.replaced.length > 0 && ` Ha preso il posto di ${career.replaced.map((r) => r.name).join(" e ")}, senza ereditarne la storia.`}
        </p>
      </div>

      <div className="rise overflow-hidden rounded-2xl border border-line bg-surface" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="eyebrow flex items-center gap-3 border-b border-line bg-surface-subtle/60 px-4 py-2 text-muted">
          <span className="flex-1">Stagione</span>
          <span className="w-16 text-center">Pos.</span>
          <span className="w-14 text-center">V–P</span>
          <span className="w-[4.75rem] text-right">Punti</span>
        </div>
        <ol>
          {career.live && (
            <li className="flex min-h-12 items-center gap-3 border-b border-dashed border-line px-4 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-display tnum block text-xl leading-none font-black">{seasonLabel(currentYear)}</span>
                <span className="text-xs text-muted">in corso</span>
              </span>
              <span className="font-display tnum w-16 text-center text-xl leading-none font-extrabold text-muted">{career.live.position}°</span>
              <span className="font-display tnum w-14 text-center text-lg leading-none font-extrabold">{recordText(career.live)}</span>
              <span className="w-[4.75rem] text-right text-xs">
                <Link href="/classifica" className="font-bold text-brand-blue hover:underline">
                  Classifica
                </Link>
              </span>
            </li>
          )}
          {career.finishes.map((f) => (
            <li key={f.year} className={`flex min-h-12 items-center gap-3 border-t border-line px-4 py-1.5 first:border-t-0 ${f.position === 1 ? "bg-gold/8" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="font-display tnum block text-xl leading-none font-black">{seasonLabel(f.year)}</span>
                {f.alias && <span className="block truncate text-xs text-muted">come {f.alias}</span>}
              </span>
              <span className="flex w-16 items-center justify-center gap-1">
                {f.position === 1 && <ChampionRing name={name} color={color} year={f.year} size="xs" />}
                <span className={`font-display tnum text-xl leading-none font-extrabold ${f.position === 1 ? "text-highlight" : f.position <= 3 ? "" : "text-muted"}`}>{f.position}°</span>
              </span>
              <span className="font-display tnum w-14 text-center text-lg leading-none font-extrabold">{recordText(f)}</span>
              <span className="font-display tnum w-[4.75rem] text-right text-base font-extrabold text-brand-blue">{fmtPts(f.totalPts)}</span>
            </li>
          ))}
          {career.finishes.length === 0 && <li className="px-4 py-3 text-sm text-muted">Prima stagione in lega: il primo piazzamento arriva a fine stagione.</li>}
        </ol>
        <Link href="/storia" className="flex min-h-11 items-center gap-1.5 border-t border-line px-4 text-xs font-bold text-brand-blue hover:underline">
          Albo d&apos;oro della lega
          <Icon name="arrow-right" size={14} strokeWidth={2.2} />
        </Link>
      </div>
    </div>
  );
}
