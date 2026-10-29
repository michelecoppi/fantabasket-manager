// Cambi di rosa su Dunkest (Fase 6, richiesta dell'utente del 2026-10-29): chi è entrato e chi è uscito dalla rosa Dunkest di
// una squadra. Da ora li annota il job (`dunkest_roster_moves`); quelli di prima si ricostruiscono dalle formazioni: chi è
// stato schierato e oggi non è più in rosa è uscito dopo la sua ultima giornata in formazione. Gli ingressi di prima non si
// possono ricostruire (chi era in tribuna non compare nelle formazioni). Puro e testato.
import type { Position } from "./cap";

export interface RosterMove {
  fantasyId: number;
  playerId: number | null;
  name: string;
  pos: Position | null;
  move: "in" | "out";
  /** registrato dal job: ultima giornata con punti in quel momento (può essere in corso) e ora */
  seenMatchday: number | null;
  seenAt: string | null;
  /** ricostruito dalle formazioni: ultima giornata in cui è stato schierato */
  lastFielded: number | null;
}

export interface FieldedPlayer {
  fantasyId: number;
  playerId: number | null;
  name: string;
  pos: Position | null;
}

/**
 * Cambi di una squadra, dal più recente: quelli registrati dal job più le uscite ricostruite dalle formazioni (`fielded`:
 * giornata → schierati della squadra) per chi non è più nella rosa Dunkest di oggi e non ha già un'uscita registrata.
 * Con la rosa di oggi vuota (non letta) non si ricostruisce niente.
 */
export function teamRosterMoves(
  logged: Omit<RosterMove, "lastFielded">[],
  fielded: { matchday: number; players: FieldedPlayer[] }[],
  current: { fantasyId: number }[],
): RosterMove[] {
  const now = new Set(current.map((p) => p.fantasyId));
  const loggedOut = new Set(logged.filter((m) => m.move === "out").map((m) => m.fantasyId));
  const last = new Map<number, { p: FieldedPlayer; matchday: number }>();
  for (const d of fielded) {
    for (const p of d.players) {
      const prev = last.get(p.fantasyId);
      if (!prev || d.matchday > prev.matchday) last.set(p.fantasyId, { p, matchday: d.matchday });
    }
  }
  const inferred: RosterMove[] =
    now.size === 0
      ? []
      : [...last.values()]
          .filter(({ p }) => !now.has(p.fantasyId) && !loggedOut.has(p.fantasyId))
          .map(({ p, matchday }) => ({ ...p, move: "out" as const, seenMatchday: null, seenAt: null, lastFielded: matchday }));
  const recorded: RosterMove[] = logged.map((m) => ({ ...m, lastFielded: null }));
  // registrati per ora (dal più recente), poi i ricostruiti per ultima giornata in formazione (dalla più recente)
  return [
    ...recorded.sort((a, b) => (b.seenAt ?? "").localeCompare(a.seenAt ?? "") || a.move.localeCompare(b.move) || a.name.localeCompare(b.name, "it")),
    ...inferred.sort((a, b) => (b.lastFielded ?? 0) - (a.lastFielded ?? 0) || a.name.localeCompare(b.name, "it")),
  ];
}

/** Gruppi per la pagina: un gruppo per ora di registrazione (giorno) o per ultima giornata in formazione. */
export function groupMoves(moves: RosterMove[]): { key: string; seenAt: string | null; seenMatchday: number | null; lastFielded: number | null; moves: RosterMove[] }[] {
  const out: ReturnType<typeof groupMoves> = [];
  for (const m of moves) {
    const key = m.seenAt ? `seen-${m.seenAt.slice(0, 10)}-${m.seenMatchday ?? ""}` : `fielded-${m.lastFielded}`;
    const g = out.find((x) => x.key === key);
    if (g) g.moves.push(m);
    else out.push({ key, seenAt: m.seenAt, seenMatchday: m.seenMatchday, lastFielded: m.lastFielded, moves: [m] });
  }
  return out;
}
