import Link from "next/link";
import type { ReactNode } from "react";
import { TeamCrest } from "@/components/crest";
import { DunkestLogo } from "@/components/dunkest";
import { Icon } from "@/components/icons";
import { PosChip, stagger } from "@/components/ui";
import { syncState } from "@/lib/dunkest";
import { teamForm, type CheckedPlayer, type DunkestLeagueView, type LeagueMatch, type LineupCheck, type LineupStatus } from "@/lib/dunkest-league";
import { fmtDateTime } from "@/lib/format";
import type { TeamView } from "@/lib/league";

/*
 * Lega su Dunkest (issue #72) nel design system Arena Night: classifica come tabella da broadcast (posizione grande, stemma,
 * record, forma, punti con barra sul leader), scontri come tabellone a due righe, formazioni in tre blocchi (quintetto,
 * panchina, tribuna) con gli avvisi di divergenza dalle rose dell'app. Fonte sempre dichiarata col logo Dunkest.
 */

export interface TeamInfo {
  name: string;
  owner: string;
  color: string;
}
export type TeamIndex = Map<string, TeamInfo>;

/** Nome, proprietario e colore di ogni squadra della lega (colori da `teamColors`). */
export function teamIndex(teams: TeamView[], colors: Map<string, string>): TeamIndex {
  return new Map(teams.map((t) => [t.team.id, { name: t.team.name, owner: t.team.owner_name, color: colors.get(t.team.id) ?? "var(--muted)" }]));
}

/** Punti fantasy come li scrive Dunkest (due decimali, virgola). */
export const fpt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const team = (teams: TeamIndex, id: string): TeamInfo => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };

/**
 * Fonte e ora dell'ultimo aggiornamento della parte di lega. Stati: aggiornato, token da rinnovare / mancante, ultimo
 * tentativo fallito (si vedono i dati validi precedenti), mai aggiornato, non disponibile.
 */
export function LeagueSource({ league, dark = false, className = "" }: { league: DunkestLeagueView; dark?: boolean; className?: string }) {
  const s = league.sync;
  const state = !league.available
    ? "unavailable"
    : s?.errorCode === "token_rejected"
      ? "token"
      : syncState(s && { lastSuccessAt: s.lastSuccessAt, lastAttemptAt: s.lastAttemptAt, lastError: s.lastError, sourceUpdatedAt: null, report: null });
  const last = s?.lastSuccessAt;
  const tone = dark ? "border-white/15 bg-white/5 text-white/70" : "border-line bg-surface text-muted";
  const warn = dark ? "text-arena-warn" : "text-warning";
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
      {(state === "failed" || state === "token") && (
        <span className={`inline-flex min-w-0 items-center gap-1 font-semibold ${warn}`} title={s?.lastError ?? undefined}>
          <Icon name={state === "token" ? "key" : "alert"} size={13} strokeWidth={2.4} />
          <span className="truncate">
            {state === "token" ? "in attesa del nuovo token" : "aggiornamento fallito"}
            {last && ` · dati del ${fmtDateTime(last)}`}
          </span>
        </span>
      )}
      {state === "never" && <span className="truncate">in attesa del primo aggiornamento</span>}
      {state === "unavailable" && <span className="truncate">dati non disponibili</span>}
    </span>
  );
}

const FORM: Record<"W" | "L" | "D", { label: string; long: string; className: string }> = {
  W: { label: "V", long: "vittoria", className: "bg-success text-white" },
  L: { label: "P", long: "sconfitta", className: "bg-danger/85 text-white" },
  D: { label: "N", long: "pareggio", className: "bg-foreground/25 text-foreground" },
};

/** Ultimi risultati come tessere V/P/N (lettera + colore, mai solo colore). */
export function FormPips({ form }: { form: ("W" | "L" | "D")[] }) {
  if (form.length === 0) return <span className="text-xs text-muted">–</span>;
  return (
    <span className="inline-flex gap-[3px]" title={`Ultimi risultati: ${form.map((f) => FORM[f].long).join(", ")}`}>
      {form.map((f, i) => (
        <span key={i} className={`grid h-5 w-5 place-items-center rounded-[5px] text-[0.625rem] leading-none font-black ${FORM[f].className}`}>
          {FORM[f].label}
        </span>
      ))}
      <span className="sr-only">Ultimi risultati: {form.map((f) => FORM[f].long).join(", ")}</span>
    </span>
  );
}

/**
 * Classifica del torneo. `compact`: senza proprietario e forma, per la home. La barra sotto i punti misura il totale sul
 * leader dei punti (non sul primo in classifica: in un testa a testa possono essere squadre diverse).
 */
export function StandingsTable({ league, teams, myTeamId, compact = false }: { league: DunkestLeagueView; teams: TeamIndex; myTeamId?: string | null; compact?: boolean }) {
  const top = Math.max(...league.standings.map((s) => s.totalPts), 1);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="eyebrow flex items-center gap-3 border-b border-line bg-surface-subtle/60 px-3 py-2 text-muted sm:px-4">
        <span className="w-7 text-center">#</span>
        <span className="flex-1">Squadra</span>
        {!compact && <span className="hidden w-[7.5rem] sm:block">Forma</span>}
        <span className="w-12 text-center">V–P</span>
        <span className="w-[4.5rem] text-right">Punti</span>
      </div>
      <ol>
        {league.standings.map((s, i) => {
          const t = team(teams, s.teamId);
          const mine = s.teamId === myTeamId;
          const record = s.draws ? `${s.wins}–${s.draws}–${s.losses}` : `${s.wins}–${s.losses}`;
          return (
            <li key={s.teamId} className={`rise relative border-t border-line first:border-t-0 ${mine ? "bg-gold/8" : ""}`} style={stagger(i)}>
              {mine && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gold" />}
              <Link href={`/squadre/${s.teamId}`} className="group flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-subtle/60 sm:px-4">
                <span className={`font-display tnum w-7 text-center text-3xl leading-none font-black ${s.position === 1 ? "text-highlight" : s.position <= 3 ? "text-foreground" : "text-muted"}`}>
                  {s.position}
                </span>
                <TeamCrest name={t.name} color={t.color} size="sm" mine={mine} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold group-hover:underline">{t.name}</span>
                  {!compact && <span className="block truncate text-xs text-muted">{t.owner}</span>}
                </span>
                {!compact && (
                  <span className="hidden w-[7.5rem] sm:block">
                    <FormPips form={teamForm(league, s.teamId)} />
                  </span>
                )}
                <span className="font-display tnum w-12 text-center text-xl leading-none font-extrabold">
                  {record}
                  <span className="sr-only"> vittorie e sconfitte</span>
                </span>
                <span className="flex w-[4.5rem] flex-col items-end leading-none">
                  <span className="font-display tnum text-xl font-extrabold text-brand-blue">{fpt(s.totalPts)}</span>
                  <span aria-hidden className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                    <span className="meter-fill block h-full rounded-full bg-brand-blue" style={{ width: `${Math.max(4, (s.totalPts / top) * 100)}%` }} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScoreLine({ teams, teamId, pts, won, decided, myTeamId }: { teams: TeamIndex; teamId: string; pts: number | null; won: boolean; decided: boolean; myTeamId?: string | null }) {
  const t = team(teams, teamId);
  const dim = decided && !won;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <TeamCrest name={t.name} color={t.color} size="xs" mine={teamId === myTeamId} />
      <span className={`min-w-0 flex-1 truncate text-sm ${won ? "font-bold" : "font-semibold"} ${dim ? "text-muted" : ""}`}>{t.name}</span>
      {won && <Icon name="arrow-right" size={13} strokeWidth={2.6} className="shrink-0 text-success" />}
      <span className={`font-display tnum w-16 shrink-0 text-right text-2xl leading-none font-black ${pts === null ? "text-muted/60" : dim ? "text-muted" : ""}`}>
        {pts === null ? "–" : fpt(pts)}
      </span>
    </div>
  );
}

/**
 * Uno scontro come tabellone a due righe: casa sopra, trasferta sotto, chi è avanti in grassetto con la freccia.
 * `live`: l'ultima giornata con punti può essere ancora in corso, quindi si dice «in testa» e non «ha vinto».
 */
export function MatchScore({ match, teams, myTeamId, live = false }: { match: LeagueMatch; teams: TeamIndex; myTeamId?: string | null; live?: boolean }) {
  const decided = match.winnerTeamId !== null && match.homePts !== null;
  const label = !decided ? null : `${live ? "In testa" : "Vince"} ${team(teams, match.winnerTeamId!).name}`;
  return (
    <div className="space-y-1.5" aria-label={label ?? undefined}>
      <ScoreLine teams={teams} teamId={match.homeTeamId} pts={match.homePts} won={decided && match.winnerTeamId === match.homeTeamId} decided={decided} myTeamId={myTeamId} />
      <ScoreLine teams={teams} teamId={match.awayTeamId} pts={match.awayPts} won={decided && match.winnerTeamId === match.awayTeamId} decided={decided} myTeamId={myTeamId} />
    </div>
  );
}

const STATUS: Record<Exclude<LineupStatus, "ok">, { label: string; tone: string }> = {
  reserve: { label: "Riserva", tone: "border-warning/40 bg-warning/12 text-warning" },
  other_team: { label: "Di un'altra squadra", tone: "border-danger/35 bg-danger/10 text-danger" },
  free: { label: "Non in rosa", tone: "border-danger/35 bg-danger/10 text-danger" },
  unlinked: { label: "Non collegato", tone: "border-line bg-surface-subtle text-muted" },
  replaced: { label: "Sostituito dopo", tone: "border-line bg-surface-subtle text-muted" },
};

/** Avviso su un giocatore schierato che non torna con le rose dell'app, o nota neutra se è stato sostituito dopo. */
export function StatusChip({ player, teams }: { player: CheckedPlayer; teams: TeamIndex }) {
  if (player.status === "ok") return null;
  const s = STATUS[player.status];
  const label = player.status === "other_team" && player.otherTeamId ? `Di ${team(teams, player.otherTeamId).name}` : s.label;
  return (
    <span
      title={player.status === "replaced" ? "Era in rosa quando è stato schierato; ora non è più nella rosa Dunkest della squadra" : undefined}
      className={`inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded-full border px-1.5 py-px text-[0.625rem] leading-4 font-bold tracking-wide uppercase ${s.tone}`}
    >
      <Icon name={player.status === "replaced" ? "swap" : "alert"} size={11} strokeWidth={2.4} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Role({ p }: { p: CheckedPlayer }) {
  if (p.isCaptain)
    return (
      <span title="Capitano" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[0.625rem] font-black text-nav">
        C<span className="sr-only">apitano</span>
      </span>
    );
  if (p.isSixthMan)
    return (
      <span title="Sesto uomo" className="grid h-5 shrink-0 place-items-center rounded-full bg-brand-blue px-1.5 text-[0.625rem] font-black text-white">
        6°<span className="sr-only"> uomo</span>
      </span>
    );
  return null;
}

function LineupRows({ players, teams, muted = false }: { players: CheckedPlayer[]; teams: TeamIndex; muted?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {players.map((p) => (
        <li key={p.fantasyId} className={`flex min-h-12 items-center gap-2.5 px-3 py-2 ${p.status !== "ok" && p.status !== "replaced" ? "bg-warning/5" : ""}`}>
          <PosChip pos={p.pos} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate text-sm font-semibold ${muted ? "text-foreground/80" : ""}`}>{p.name}</span>
              <Role p={p} />
            </span>
            {p.status !== "ok" && (
              <span className="mt-0.5 flex">
                <StatusChip player={p} teams={teams} />
              </span>
            )}
          </span>
          <span className={`font-display tnum shrink-0 text-xl leading-none font-extrabold ${p.pts === null ? "text-muted/60" : muted ? "text-foreground/70" : "text-brand-blue"}`}>
            {p.pts === null ? "–" : fpt(p.pts)}
            <span className="sr-only"> punti</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="eyebrow mb-1.5 flex items-baseline justify-between gap-2 text-muted">
        <span>{title}</span>
        {hint && <span className="tracking-normal normal-case">{hint}</span>}
      </h3>
      {children}
    </div>
  );
}

/**
 * Formazione di una squadra in uno scontro: quintetto, panchina (col sesto uomo) e tribuna (titolari dell'app non schierati).
 * `stands`: chi è in tribuna (dalla rosa Dunkest se c'è, altrimenti i titolari dell'app non schierati); `columns`: quintetto e
 * panchina affiancati da `sm` (pagina squadra).
 */
export function Lineup({
  check,
  stands,
  teams,
  columns = true,
  standsFromDunkest = false,
  past = false,
}: {
  check: LineupCheck;
  stands: { id: number; name: string; pos: string | null }[];
  teams: TeamIndex;
  columns?: boolean;
  /** tribuna letta dalla rosa Dunkest (altrimenti: titolari dell'app non schierati) */
  standsFromDunkest?: boolean;
  /** giornata chiusa: la tribuna viene dalla rosa di oggi, non da quella di allora */
  past?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${columns ? "sm:grid-cols-2" : ""}`}>
        <Block title="Quintetto" hint={`${check.starters.length} in campo`}>
          <LineupRows players={check.starters} teams={teams} />
        </Block>
        <Block title="Panchina" hint="col sesto uomo">
          <LineupRows players={check.bench} teams={teams} muted />
        </Block>
      </div>
      <Block
        title="Tribuna"
        hint={past ? "dalla rosa di oggi, non da quella di allora" : standsFromDunkest ? "in rosa su Dunkest, non schierati" : "titolari dell'app non schierati"}
      >
        {stands.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-3 py-2.5 text-sm text-muted">Nessuno: tutta la rosa è in formazione.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {stands.map((s) => (
              <li key={s.id} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-dashed border-line bg-surface py-1 pr-3 pl-1 text-sm">
                <PosChip pos={s.pos} />
                <span className="font-semibold text-foreground/80">{s.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

/** Riepilogo degli avvisi di una formazione (per la pagina squadra e l'admin). */
export function issuesText(check: LineupCheck, teams: TeamIndex): string[] {
  return check.issues.map((p) => {
    if (p.status === "reserve") return `${p.name} è una riserva nell'app ma è schierato su Dunkest.`;
    if (p.status === "other_team") return `${p.name} è schierato ma nell'app è di ${team(teams, p.otherTeamId ?? "").name}.`;
    if (p.status === "free") return `${p.name} è schierato ma nell'app non è in nessuna rosa.`;
    return `${p.name} non è collegato a un giocatore della lega (nome diverso?).`;
  });
}
