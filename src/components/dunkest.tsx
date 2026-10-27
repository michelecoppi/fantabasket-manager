import Image from "next/image";
import type { ReactNode } from "react";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { PosChip, Scoreboard } from "@/components/ui";
import type { Position } from "@/lib/cap";
import { syncState, type DunkestView, type Injury, type InjuryStatus, type PlayerStats, type RoleStat } from "@/lib/dunkest";
import { fmt, fmtDateTime, fmtDay } from "@/lib/format";

/*
 * Dati Dunkest (issue #68) nel design system Arena Night: fonte sempre dichiarata col logo, infortuni come chip di stato,
 * punteggio medio (PDK) come cifra blu con una tacca di confronto col ruolo, scheda giocatore a comparsa (popover nativo,
 * niente JavaScript: foglio dal basso su telefono, finestra centrata da `sm`).
 */

const ROLE_PLURAL: Record<Position, string> = { G: "guardie", A: "ali", C: "centri" };

/** Logo Dunkest (fornito dall'utente, public/dunkest-logo.png): la fonte dei dati, mai decorazione. */
export function DunkestLogo({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Image src="/dunkest-logo.png" alt="Dunkest" width={size} height={size} className={`shrink-0 rounded-[28%] ${className}`} />;
}

/**
 * Fonte e ora dell'ultimo aggiornamento, da mettere accanto a ogni blocco di dati Dunkest.
 * Stati: aggiornato, ultimo tentativo fallito (si vedono i dati validi precedenti), mai aggiornato, non disponibile.
 */
export function DunkestSource({ dunkest, dark = false, className = "" }: { dunkest: DunkestView; dark?: boolean; className?: string }) {
  const state = dunkest.available ? syncState(dunkest.sync) : "unavailable";
  const last = dunkest.sync?.lastSuccessAt;
  const tone = dark ? "border-white/15 bg-white/5 text-white/70" : "border-line bg-surface text-muted";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs ${tone} ${className}`}>
      <DunkestLogo size={18} />
      <span className={`font-bold ${dark ? "text-white" : "text-foreground"}`}>Dunkest</span>
      <span aria-hidden className="opacity-50">
        ·
      </span>
      {state === "ok" && last && (
        <span className="truncate">
          agg. <time dateTime={last}>{fmtDateTime(last)}</time>
        </span>
      )}
      {state === "failed" && (
        <span className={`inline-flex min-w-0 items-center gap-1 font-semibold ${dark ? "text-gold" : "text-warning"}`} title={dunkest.sync?.lastError ?? undefined}>
          <Icon name="alert" size={13} strokeWidth={2.4} />
          <span className="truncate">{last ? `aggiornamento fallito · dati del ${fmtDateTime(last)}` : "aggiornamento fallito"}</span>
        </span>
      )}
      {state === "never" && <span className="truncate">in attesa del primo aggiornamento</span>}
      {state === "unavailable" && <span className="truncate">dati non disponibili</span>}
    </span>
  );
}

const INJURY: Record<InjuryStatus, { label: string; long: string; className: string }> = {
  out: { label: "Out", long: "Fuori", className: "border-danger/35 bg-danger/10 text-danger" },
  doubtful: { label: "GTD", long: "In dubbio", className: "border-warning/40 bg-warning/12 text-warning" },
  season: { label: "Out stagione", long: "Stagione finita", className: "border-danger bg-danger text-white" },
};

/** Testo breve per tooltip e lettori di schermo: "Fuori fino al 20 nov · Ginocchio". */
export function injuryText(i: Injury): string {
  const head = i.status === "out" && i.until ? `Fuori fino al ${i.until}` : INJURY[i.status].long;
  return i.injury ? `${head} · ${i.injury}` : head;
}

/** Chip di stato infortunio: OUT rosso, GTD (in dubbio) oro, stagione finita rosso pieno. Testo e icona, mai solo colore. */
export function InjuryChip({ injury, size = "sm" }: { injury: Injury; size?: "sm" | "md" }) {
  const s = INJURY[injury.status];
  return (
    <span
      title={injuryText(injury)}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold tracking-wide whitespace-nowrap uppercase ${s.className} ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-px text-[0.625rem] leading-4"
      }`}
    >
      <Icon name="medkit" size={size === "md" ? 14 : 11} strokeWidth={2.4} />
      {s.label}
      <span className="sr-only"> ({injuryText(injury)})</span>
    </span>
  );
}

/**
 * Cella PDK per le righe giocatore: media a partita in blu, una tacca che si riempie fino al migliore del ruolo con la media
 * del ruolo segnata, partite giocate sotto. "–" se non ha ancora giocato.
 */
export function PdkCell({ stats, role }: { stats: PlayerStats | undefined; role: RoleStat | null | undefined }) {
  if (!stats || stats.gp === 0) {
    return (
      <span className="flex w-12 shrink-0 flex-col items-end leading-none" title="Nessuna partita giocata">
        <span className="font-display tnum text-xl font-extrabold text-muted/60">–</span>
        <span className="mt-1.5 text-[0.625rem] font-bold tracking-wide text-muted uppercase">0 pg</span>
      </span>
    );
  }
  const pct = role && role.max > 0 ? Math.max(4, Math.min(100, (stats.pdk / role.max) * 100)) : 0;
  const avgPct = role && role.max > 0 ? Math.min(100, (role.avg / role.max) * 100) : null;
  return (
    <span className="flex w-12 shrink-0 flex-col items-end leading-none" title={`Punteggio Dunkest medio ${fmt(stats.pdk)} in ${stats.gp} partite`}>
      <span className="font-display tnum text-xl font-extrabold text-brand-blue">{fmt(stats.pdk)}</span>
      <span aria-hidden className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
        <span className="meter-fill absolute inset-y-0 left-0 rounded-full bg-brand-blue" style={{ width: `${pct}%` }} />
        {avgPct !== null && <span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${avgPct}%` }} />}
      </span>
      <span className="tnum mt-1 text-[0.625rem] font-bold tracking-wide text-muted uppercase">{stats.gp} pg</span>
      <span className="sr-only">
        Punteggio Dunkest medio {fmt(stats.pdk)} in {stats.gp} partite
      </span>
    </span>
  );
}

/** Pulsante trasparente su tutta la riga che apre la scheda: i link nella riga restano sopra (`relative z-[2]`). */
export function SheetTrigger({ id, name }: { id: string; name: string }) {
  return (
    <button
      type="button"
      popoverTarget={id}
      aria-label={`Scheda Dunkest di ${name}`}
      className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-offset-[-3px]"
    />
  );
}

export const sheetId = (playerId: number) => `scheda-${playerId}`;

/** Barra di confronto: punteggio del giocatore sul migliore del ruolo, con la media del ruolo segnata. */
function CompareBar({ pdk, scale, label }: { pdk: number; scale: RoleStat; label: string }) {
  const pct = scale.max > 0 ? Math.max(3, Math.min(100, (pdk / scale.max) * 100)) : 0;
  const avgPct = scale.max > 0 ? Math.min(100, (scale.avg / scale.max) * 100) : 0;
  const delta = Math.round((pdk - scale.avg) * 10) / 10;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">Contro le {label}</span>
        <span className={`tnum text-sm font-bold ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"}`}>
          {delta === 0 ? "nella media" : `${delta > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(delta))} sulla media`}
        </span>
      </div>
      <div className="relative mt-5 mb-1">
        <div className="h-3 overflow-hidden rounded-full bg-foreground/10">
          <div className="meter-fill h-full rounded-full bg-linear-to-r from-brand-blue/70 to-brand-blue" style={{ width: `${pct}%` }} />
        </div>
        <span aria-hidden className="absolute -top-1 bottom-[-0.25rem] w-0.5 rounded-full bg-foreground" style={{ left: `calc(${avgPct}% - 1px)` }} />
        <span aria-hidden className="tnum absolute -top-5 -translate-x-1/2 text-[0.625rem] font-bold tracking-wide whitespace-nowrap text-muted uppercase" style={{ left: `clamp(1.75rem, ${avgPct}%, calc(100% - 1.75rem))` }}>
          media {fmt(scale.avg)}
        </span>
      </div>
      <div className="tnum flex justify-between text-[0.6875rem] text-muted">
        <span>0</span>
        <span>migliore {fmt(scale.max)}</span>
      </div>
      <p className="sr-only">
        {fmt(pdk)} punti di media; media delle {label} {fmt(scale.avg)}, migliore {fmt(scale.max)}.
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-subtle/70 px-3 py-2">
      <dt className="eyebrow leading-tight text-muted">{label}</dt>
      <dd className="font-display tnum text-2xl leading-none font-extrabold">{value}</dd>
    </div>
  );
}

export interface SheetPlayer {
  playerId: number;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  /** squadra della lega che lo ha in rosa */
  owner?: { name: string; color: string } | null;
}

/**
 * Scheda giocatore a comparsa (popover nativo): testata tabellone con PDK, partite e minuti, confronto col ruolo,
 * punti/rimbalzi/assist, infortunio, fonte. Si renderizza una volta per giocatore e pagina; le righe la aprono con `SheetTrigger`.
 */
export function PlayerSheet({ player, dunkest }: { player: SheetPlayer; dunkest: DunkestView }) {
  const id = sheetId(player.playerId);
  const stats = dunkest.stats.get(player.playerId);
  const injury = dunkest.injuries.get(player.playerId);
  const rank = dunkest.ranks.get(player.playerId);
  const role = player.pos ? dunkest.roles[player.pos] : undefined;
  const played = !!stats && stats.gp > 0;
  const titleId = `${id}-titolo`;

  return (
    <div id={id} popover="auto" role="dialog" aria-labelledby={titleId} className="sheet">
      <div className="arena px-5 pt-3 pb-5 sm:px-6 sm:pt-5">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="relative z-[2] flex items-start gap-3">
          <PosChip pos={player.pos} />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display truncate text-3xl leading-none font-black">
              {player.name}
            </h2>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/65">
              <span>{player.nbaTeam ?? "Squadra NBA n.d."}</span>
              {player.owner && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span aria-hidden>·</span>
                  <TeamCrest name={player.owner.name} color={player.owner.color} size="xs" />
                  <span className="truncate font-semibold text-white/85">{player.owner.name}</span>
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Chiudi la scheda"
            className="-mt-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div className="relative z-[2] mt-5">
          <Scoreboard
            items={[
              { label: "PDK medio", value: played ? fmt(stats.pdk) : "–", tone: played ? "gold" : undefined },
              { label: "Partite", value: stats?.gp ?? 0 },
              { label: "Minuti", value: played ? fmt(stats.min) : "–" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {injury && (
          <section aria-label="Infortunio" className={`rounded-2xl border p-4 ${injury.status === "doubtful" ? "border-warning/40 bg-warning/8" : "border-danger/35 bg-danger/6"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <InjuryChip injury={injury} size="md" />
              {injury.injury && <span className="font-display text-xl leading-none font-extrabold">{injury.injury}</span>}
            </div>
            {injury.description && <p className="mt-2 text-sm">{injury.description}</p>}
            <p className="mt-1 text-xs text-muted">
              {injury.since && <>Dal {fmtDay(injury.since)}</>}
              {injury.since && injury.until && " · "}
              {injury.until && <>rientro previsto il {injury.until}</>}
            </p>
          </section>
        )}

        {played ? (
          <>
            {rank && player.pos && (
              <p className="flex items-baseline gap-2">
                <span className="font-display tnum text-4xl leading-none font-black">{rank.rank}°</span>
                <span className="text-sm text-muted">
                  tra le {ROLE_PLURAL[player.pos]} del listone per punteggio (su {rank.of})
                </span>
              </p>
            )}
            {role && player.pos ? (
              <CompareBar pdk={stats.pdk} scale={role} label={ROLE_PLURAL[player.pos]} />
            ) : (
              dunkest.all && <CompareBar pdk={stats.pdk} scale={dunkest.all} label="altre del listone" />
            )}
            <dl className="grid grid-cols-3 gap-2">
              <MiniStat label="Punti" value={fmt(stats.pts)} />
              <MiniStat label="Rimbalzi" value={fmt(stats.reb)} />
              <MiniStat label="Assist" value={fmt(stats.ast)} />
            </dl>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-subtle">
              <Icon name="chart" size={20} />
            </span>
            {!dunkest.available
              ? "Dati Dunkest non disponibili al momento."
              : injury
                ? "Nessuna partita giocata in questa stagione."
                : "Nessuna partita giocata in questa stagione, oppure non ancora collegato ai dati Dunkest."}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <DunkestSource dunkest={dunkest} />
          <span className="text-[0.6875rem] text-muted">medie a partita · aggiornate ogni mattina</span>
        </div>
      </div>
    </div>
  );
}
