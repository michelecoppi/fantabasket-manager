// Affari e flop (Fase 6.2): posizione per stipendio contro posizione per punteggio medio Dunkest (PDK) dei giocatori a
// contratto. Solo presentazione, nessuna regola di lega: le soglie sotto sono costanti di visualizzazione. Puro e testato.
import type { Position } from "./cap";

/** Partite minime per entrare in classifica: con meno, la media PDK dice poco (soglia di presentazione, da confermare). */
export const VALUE_MIN_GAMES = 3;
/** Righe per lista (soglia di presentazione). */
export const VALUE_LIST_SIZE = 10;

export interface ValueContract {
  playerId: number;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  teamId: string;
  slot: "starter" | "reserve";
  salary: number;
}

export interface ValueRow extends ValueContract {
  pdk: number;
  gp: number;
  /** 1 = il più pagato; a pari stipendio la posizione è condivisa */
  salaryRank: number;
  /** 1 = il miglior PDK; a pari PDK la posizione è condivisa */
  pdkRank: number;
  /** salaryRank − pdkRank: positivo = rende più di quanto è pagato */
  delta: number;
}

export interface ValueBoard {
  /** giocatori in classifica (con almeno VALUE_MIN_GAMES partite) */
  pool: number;
  /** tutti i giocatori in classifica, per la pagina squadra */
  rows: ValueRow[];
  deals: ValueRow[];
  flops: ValueRow[];
}

/** Posizione "da gara" (1, 2, 2, 4): a pari valore la stessa posizione, la successiva salta. Valori più alti prima. */
function ranks<T>(items: T[], value: (x: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const out = new Map<T, number>();
  sorted.forEach((x, i) => out.set(x, i > 0 && value(sorted[i - 1]) === value(x) ? out.get(sorted[i - 1])! : i + 1));
  return out;
}

/**
 * Classifica affari e flop. Entra chi ha un contratto (titolare o riserva della stagione corrente; i talenti non hanno
 * stipendio) e almeno `minGames` partite. Affari: delta positivo dal più grande (a pari delta il PDK più alto); flop: delta
 * negativo dal più grande (a pari delta lo stipendio più alto). Un giocatore con delta 0 non è né l'uno né l'altro.
 */
export function valueBoard(
  contracts: ValueContract[],
  stats: Map<number, { pdk: number; gp: number }>,
  opts: { minGames?: number; size?: number } = {},
): ValueBoard {
  const minGames = opts.minGames ?? VALUE_MIN_GAMES;
  const size = opts.size ?? VALUE_LIST_SIZE;
  const seen = new Set<number>();
  const eligible = contracts.flatMap((c) => {
    const s = stats.get(c.playerId);
    if (!s || s.gp < minGames || seen.has(c.playerId)) return [];
    seen.add(c.playerId);
    return [{ ...c, pdk: s.pdk, gp: s.gp }];
  });
  const bySalary = ranks(eligible, (x) => x.salary);
  const byPdk = ranks(eligible, (x) => x.pdk);
  const rows: ValueRow[] = eligible.map((x) => {
    const salaryRank = bySalary.get(x)!;
    const pdkRank = byPdk.get(x)!;
    return { ...x, salaryRank, pdkRank, delta: salaryRank - pdkRank };
  });
  const deals = rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta || b.pdk - a.pdk || a.name.localeCompare(b.name, "it"));
  const flops = rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta || b.salary - a.salary || a.name.localeCompare(b.name, "it"));
  return { pool: rows.length, rows, deals: deals.slice(0, size), flops: flops.slice(0, size) };
}

/** Miglior affare e peggior flop di una squadra (null se non ne ha). */
export function teamValue(board: ValueBoard, teamId: string): { deal: ValueRow | null; flop: ValueRow | null } {
  const mine = board.rows.filter((r) => r.teamId === teamId);
  const deal = mine.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta || b.pdk - a.pdk)[0] ?? null;
  const flop = mine.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta || b.salary - a.salary)[0] ?? null;
  return { deal, flop };
}

/** Contratti dalle rose della vista di lega (titolari e riserve). */
export function valueContracts(teams: { team: { id: string }; starters: Omit<ValueContract, "teamId">[]; reserves: Omit<ValueContract, "teamId">[] }[]): ValueContract[] {
  return teams.flatMap((t) =>
    [...t.starters, ...t.reserves].map((p) => ({ playerId: p.playerId, name: p.name, pos: p.pos, nbaTeam: p.nbaTeam, teamId: t.team.id, slot: p.slot, salary: p.salary })),
  );
}
