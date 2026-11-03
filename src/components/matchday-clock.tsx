"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { countdownParts, countdownText, dayTiming, nextRound, roundDone, type RoundInfo } from "@/lib/dunkest-rounds";
import { fmtDateTime } from "@/lib/format";

/*
 * Round di una giornata con il countdown (round dal job giornaliero, `dunkest_rounds`): da iniziare = quanto manca al primo
 * round; in corso = round completati e quanto manca al prossimo; chiusa = round completati e, se c'è, quanto manca alla
 * giornata dopo. L'ora la sa solo il browser: sul server (e prima dell'idratazione) si vedono solo i round.
 */

// Un solo timer per tutta la pagina, a secondi.
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getNow = () => now || Date.now();
const getServerNow = () => null;

function Pips({ rounds, at }: { rounds: RoundInfo[]; at: number | null }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {rounds.map((r) => {
        const started = at !== null && Date.parse(r.startsAt) <= at;
        const tone = roundDone(r) ? "border-gold bg-gold" : started ? "border-gold bg-gold/25 ring-2 ring-gold/30" : "border-dashed border-muted/60";
        return <span key={r.round} className={`size-2.5 rounded-full border ${tone}`} />;
      })}
    </span>
  );
}

const UNIT = { g: "giorni", h: "ore", m: "min", s: "sec" } as const;

/**
 * Countdown come un piccolo tabellone: una casella per unità, la cifra che cambia scende al suo posto (`.digit-roll`, la chiave
 * cambia solo con la cifra). Nell'ultima ora le cifre diventano oro.
 */
function Countdown({ ms, label }: { ms: number; label: string }) {
  const parts = countdownParts(ms);
  const soon = ms < 3_600_000;
  return (
    <span role="timer" aria-label={`${label} ${countdownText(ms)}`} className="inline-flex items-center gap-1">
      {parts.map((p) => (
        <span key={p.unit} aria-hidden className="pop flex min-w-9 flex-col items-center rounded-lg border border-white/10 bg-nav px-1.5 pt-1.5 pb-1">
          <span className={`font-display tnum flex overflow-hidden text-xl leading-none font-extrabold ${soon ? "text-gold" : "text-white"}`}>
            {(p.unit === "g" ? String(p.value) : String(p.value).padStart(2, "0")).split("").map((ch, i, all) => (
              <span key={`${all.length - i}-${ch}`} className="digit-roll">
                {ch}
              </span>
            ))}
          </span>
          <span className="mt-0.5 text-[0.5625rem] leading-none font-bold tracking-wide text-white/55 uppercase">{UNIT[p.unit]}</span>
        </span>
      ))}
    </span>
  );
}

const STATUS = { upcoming: "da iniziare", live: "in corso", done: "round finiti" } as const;

/**
 * Stato della giornata in due parole dai round: «da iniziare» invece di «appena cominciata» quando Dunkest ha già messo gli
 * scontri a 0-0 ma il primo round non è partito. Senza round (o sul server) resta il testo di prima.
 */
export function MatchdayStatus({ rounds, fallback }: { rounds: RoundInfo[]; fallback: string }) {
  const at = useSyncExternalStore(subscribe, getNow, getServerNow);
  if (at === null || rounds.length === 0) return fallback;
  const t = dayTiming(rounds, new Date(at));
  return t.kind === "none" ? fallback : STATUS[t.kind];
}

export function MatchdayClock({
  rounds,
  following = null,
  className = "",
}: {
  rounds: RoundInfo[];
  /** giornata dopo, per il countdown quando questa è chiusa */
  following?: { matchday: number; rounds: RoundInfo[] } | null;
  className?: string;
}) {
  const at = useSyncExternalStore(subscribe, getNow, getServerNow);
  if (rounds.length === 0) return null;
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const total = sorted.length;
  const roundsLabel = `${total} round`;
  // Altezza minima delle caselle: il countdown arriva dopo l'idratazione e non deve spostare la pagina.
  const box = `flex min-h-15 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-subtle/60 px-3 py-2 text-sm ${className}`;

  if (at === null) {
    return (
      <div className={box}>
        <Pips rounds={sorted} at={null} />
        <span className="font-semibold text-muted">{roundsLabel}</span>
      </div>
    );
  }

  const t = dayTiming(sorted, new Date(at));
  const after = t.kind === "done" && following ? nextRound([following], new Date(at)) : null;
  // Riga in alto, riga sotto e countdown a destra (se c'è qualcosa che deve iniziare).
  const view: { headline: string; sub: string | null; target: { iso: string; label: string } | null } =
    t.kind === "upcoming"
      ? { headline: "Inizia tra", sub: `${fmtDateTime(t.startsAt)} · ${roundsLabel}`, target: { iso: t.startsAt, label: "Inizia tra" } }
      : t.kind === "live"
        ? {
            headline: `${t.completed} di ${t.total} round completati`,
            sub: t.next ? `Round ${t.next.round} · ${fmtDateTime(t.next.startsAt)}` : "ultimo round in corso",
            target: t.next ? { iso: t.next.startsAt, label: `Round ${t.next.round} tra` } : null,
          }
        : t.kind === "done"
          ? {
              headline: t.completed === t.total ? `${t.total} round su ${t.total} completati` : `${t.completed} di ${t.total} round completati`,
              sub: after ? `${after.round.round === 1 ? `Giornata ${after.matchday}` : `Giornata ${after.matchday}, round ${after.round.round}`} · ${fmtDateTime(after.round.startsAt)}` : null,
              target: after ? { iso: after.round.startsAt, label: `Giornata ${after.matchday} tra` } : null,
            }
          : { headline: roundsLabel, sub: null, target: null };

  return (
    <div className={`${box} justify-between`}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Pips rounds={sorted} at={at} />
          <span className="font-semibold">{view.headline}</span>
        </div>
        {view.sub && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            {view.target && <Icon name="stopwatch" size={13} />}
            {view.sub}
          </div>
        )}
      </div>
      {view.target && <Countdown ms={Date.parse(view.target.iso) - at} label={view.target.label} />}
    </div>
  );
}
