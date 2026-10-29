import { evaluateTrade, type LeagueSettings, type Position, type TradeEvaluation } from "./cap";
import { draftFromMoves, toParties, type ArrivalSlot, type SimTeam, type TradeMoveInput } from "./trade-draft";

/**
 * Cercatore di scambi (Fase 7.4, docs/product/PIANO-PROPOSTE-SCAMBIO.md): prova combinazioni tra la tua squadra e una
 * controparte (o tutte), le valuta con `evaluateTrade` come il simulatore e tiene solo quelle senza blocchi e senza
 * sforamento del cap per nessuno. Aiuta a costruire una proposta, non decide niente: l'equilibrio (PDK e stipendi) è
 * un'indicazione mostrata come tale, mai un filtro, perché nessuna regola di lega dice cosa è «equo».
 *
 * I limiti qui sotto (quanti giocatori per lato, quante prove) sono costanti di ricerca, non regole di lega.
 */
export type FinderNeed =
  /** un giocatore preciso di un'altra squadra (id contratto) */
  | { kind: "player"; contractId: number }
  /** un giocatore di quel ruolo */
  | { kind: "role"; pos: Position }
  /** spazio nel cap: scaricare stipendio dei titolari; `amount` crediti che servono */
  | { kind: "cap"; amount: number }
  /** spazio nel budget riserve; `amount` crediti che servono */
  | { kind: "reserves"; amount: number };

export interface FinderInput {
  teams: readonly SimTeam[];
  settings: LeagueSettings;
  /** squadra da cui si parte */
  me: string;
  /** controparte; null = tutta la lega (per un giocatore preciso conta solo la sua squadra) */
  counterpart: string | null;
  need: FinderNeed;
  /** se true, una pick della tua squadra può entrare nello scambio */
  picks: boolean;
  /** PDK per id contratto (dati Dunkest); vuoto = equilibrio solo sugli stipendi */
  pdk: Readonly<Record<number, number>>;
  /** risultati da restituire */
  limit?: number;
  /** valutazioni massime: oltre, la ricerca si ferma e lo dice */
  budget?: number;
}

export interface FinderResult {
  /** [tua squadra, controparte] */
  teams: [string, string];
  moves: TradeMoveInput[];
  ev: TradeEvaluation;
  /** per la tua squadra: crediti di spazio guadagnati nel cap (o nelle riserve, per quel bisogno); 0 per giocatore e ruolo */
  gain: number;
  /** per la tua squadra: stipendi ricevuti − stipendi ceduti */
  salaryDiff: number;
  /** per la tua squadra: PDK ricevuto − PDK ceduto; null senza dati Dunkest */
  pdkDiff: number | null;
  /** qualche giocatore dello scambio non ha PDK (conta 0) */
  pdkPartial: boolean;
}

export interface FinderOutput {
  results: FinderResult[];
  /** combinazioni valutate */
  tried: number;
  /** combinazioni valide trovate (prima del taglio a `limit`) */
  valid: number;
  /** la ricerca si è fermata al budget */
  truncated: boolean;
}

export const FINDER_LIMIT = 10;
export const FINDER_BUDGET = 100_000;
/** al massimo questi giocatori ceduti dalla tua squadra, per bisogno */
const MAX_GIVE: Record<FinderNeed["kind"], number> = { player: 3, role: 2, cap: 2, reserves: 2 };
/** risultati con lo stesso pacchetto ricevuto (varietà della lista) */
const SAME_RECEIVE = 3;

type Player = SimTeam["players"][number];

/** Sottoinsiemi di `items` con almeno `min` e al massimo `max` elementi, dal più piccolo. */
export function* subsets<T>(items: readonly T[], min: number, max: number): Generator<T[]> {
  for (let k = Math.max(min, 0); k <= Math.min(max, items.length); k++) {
    const idx = Array.from({ length: k }, (_, i) => i);
    if (k === 0) {
      yield [];
      continue;
    }
    while (true) {
      yield idx.map((i) => items[i]);
      let i = k - 1;
      while (i >= 0 && idx[i] === items.length - k + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}

/** Cosa può cedere la tua squadra: contratti (non talenti) e, se richiesto, una pick con al massimo un contratto. */
function* giveSets(team: SimTeam, need: FinderNeed, picks: boolean): Generator<{ players: Player[]; pick: number | null }> {
  const pool = team.players.filter((p) => p.slot !== "talent");
  const ok = (ps: Player[]) =>
    need.kind === "cap" ? ps.some((p) => p.slot === "starter") : need.kind === "reserves" ? ps.some((p) => p.slot === "reserve") : true;
  for (const ps of subsets(pool, 1, MAX_GIVE[need.kind])) if (ok(ps)) yield { players: ps, pick: null };
  if (!picks) return;
  for (const pick of team.picks) for (const ps of subsets(pool, 0, 1)) if (need.kind === "player" || need.kind === "role" || ok(ps)) yield { players: ps, pick: pick.id };
}

/** Cosa può arrivare dalla controparte, per bisogno. */
function receiveSets(team: SimTeam, need: FinderNeed): Player[][] {
  const pool = team.players.filter((p) => p.slot !== "talent");
  if (need.kind === "player") {
    const target = pool.find((p) => p.id === need.contractId);
    if (!target) return [];
    return [[target], ...pool.filter((p) => p !== target).map((p) => [target, p])];
  }
  if (need.kind === "role") return pool.filter((p) => p.pos === need.pos).map((p) => [p]);
  return [[], ...pool.map((p) => [p])];
}

/**
 * Cerca scambi a due squadre che soddisfano il bisogno. Ogni combinazione si valuta prima con gli slot di arrivo di
 * sempre; se ha blocchi (di solito i massimi di rosa) o fa sforare il cap si riprova facendo arrivare come riserva ciò che
 * riceve una squadra, poi l'altra, poi entrambe. Restano solo le combinazioni senza blocchi e senza sforamento del cap.
 */
export function findTrades(input: FinderInput): FinderOutput {
  const { teams, settings, me, need, picks, pdk } = input;
  const limit = input.limit ?? FINDER_LIMIT;
  const budget = input.budget ?? FINDER_BUDGET;
  const mine = teams.find((t) => t.id === me);
  const out: FinderOutput = { results: [], tried: 0, valid: 0, truncated: false };
  if (!mine) return out;

  const owner = need.kind === "player" ? teams.find((t) => t.players.some((p) => p.id === need.contractId))?.id : undefined;
  if (need.kind === "player" && (!owner || owner === me)) return out;
  const others = teams.filter((t) => t.id !== me && (owner ? t.id === owner : input.counterpart === null || t.id === input.counterpart));
  const withPdk = Object.keys(pdk).length > 0;
  const found: FinderResult[] = [];

  const evaluate = (other: SimTeam, moves: TradeMoveInput[]) => {
    out.tried++;
    const ids = [me, other.id];
    return evaluateTrade(toParties(teams, draftFromMoves(ids, moves)), settings);
  };
  const asReserve = (moves: TradeMoveInput[], to: string): TradeMoveInput[] =>
    moves.map((m) => (m.kind === "contract" && m.to === to ? { ...m, slot: "reserve" as ArrivalSlot } : m));
  const slotOf = (team: SimTeam, id: number) => team.players.find((p) => p.id === id)?.slot;

  search: for (const other of others) {
    const receives = receiveSets(other, need);
    for (const give of giveSets(mine, need, picks)) {
      for (const got of receives) {
        if (give.players.length === 0 && got.length === 0) continue;
        if (need.kind === "player" && got.length > 1 && give.players.length > 2) continue;
        if (out.tried >= budget) {
          out.truncated = true;
          break search;
        }
        const base: TradeMoveInput[] = [
          ...give.players.map((p) => ({ kind: "contract" as const, id: p.id, version: p.version ?? 0, from: me, to: other.id })),
          ...(give.pick === null ? [] : [{ kind: "pick" as const, id: give.pick, version: mine.picks.find((p) => p.id === give.pick)?.version ?? 0, from: me, to: other.id }]),
          ...got.map((p) => ({ kind: "contract" as const, id: p.id, version: p.version ?? 0, from: other.id, to: me })),
        ];
        // Varianti degli slot di arrivo: solo per chi riceve qualcosa che oggi è titolare.
        const variants = [base];
        const starterTo = (to: string, from: SimTeam) => base.some((m) => m.kind === "contract" && m.to === to && slotOf(from, m.id) === "starter");
        if (starterTo(me, other)) variants.push(asReserve(base, me));
        if (starterTo(other.id, mine)) variants.push(asReserve(base, other.id));
        if (variants.length === 3) variants.push(asReserve(asReserve(base, me), other.id));

        for (const moves of variants) {
          const ev = evaluate(other, moves);
          if (ev.errors.length || ev.capBreakers.length) continue;
          const r = result(mine, other, moves, ev);
          if (need.kind === "player" || need.kind === "role" || r.gain > 0) found.push(r);
          break; // la prima variante valida è quella da proporre
        }
      }
    }
  }

  function result(a: SimTeam, b: SimTeam, moves: TradeMoveInput[], ev: TradeEvaluation): FinderResult {
    const salary = new Map([...a.players, ...b.players].map((p) => [p.id, p.salary]));
    let salaryDiff = 0;
    let pdkDiff = 0;
    let pdkPartial = false;
    for (const m of moves) {
      if (m.kind !== "contract") continue;
      const sign = m.to === a.id ? 1 : -1;
      salaryDiff += sign * (salary.get(m.id) ?? 0);
      const v = pdk[m.id];
      if (v === undefined) pdkPartial = true;
      else pdkDiff += sign * v;
    }
    const [mineImpact] = ev.impacts;
    const gain =
      need.kind === "cap"
        ? mineImpact.after.capSpace - mineImpact.before.capSpace
        : need.kind === "reserves"
          ? mineImpact.after.reserveSpace - mineImpact.before.reserveSpace
          : 0;
    return {
      teams: [a.id, b.id],
      moves,
      ev,
      gain: round(gain),
      salaryDiff: round(salaryDiff),
      pdkDiff: withPdk ? round(pdkDiff) : null,
      pdkPartial: withPdk && pdkPartial,
    };
  }

  out.valid = found.length;
  out.results = rank(found, need, mine, pdk).slice(0, limit);
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Distanza dall'equilibrio: PDK se c'è, altrimenti stipendi (a pari PDK decidono gli stipendi). */
const imbalance = (r: FinderResult) => Math.abs(r.pdkDiff ?? r.salaryDiff);

/**
 * Ordine: prima la vicinanza al bisogno (per lo spazio: prima chi libera almeno i crediti chiesti; chi non ci arriva dopo, dal
 * guadagno più grande), poi l'equilibrio (dopo quelli con il PDK di tutti: senza dati l'equilibrio non si sa), per un ruolo
 * il PDK di chi arriva, per lo spazio il guadagno più vicino a quello chiesto,
 * poi stipendi più vicini e meno movimenti. Al massimo `SAME_RECEIVE` risultati con lo stesso pacchetto ricevuto (con un
 * giocatore preciso conta ciò che arriva oltre a lui) e uno solo per ciò che cedi.
 */
function rank(found: FinderResult[], need: FinderNeed, mine: SimTeam, pdk: Readonly<Record<number, number>>): FinderResult[] {
  const incoming = (r: FinderResult) => r.moves.reduce((n, m) => n + (m.kind === "contract" && m.to === mine.id ? (pdk[m.id] ?? 0) : 0), 0);
  const amount = need.kind === "cap" || need.kind === "reserves" ? need.amount : 0;
  const meets = (r: FinderResult) => r.gain >= amount;
  const sorted = [...found].sort(
    (a, b) =>
      Number(meets(b)) - Number(meets(a)) ||
      (meets(a) ? 0 : b.gain - a.gain) ||
      Number(a.pdkPartial) - Number(b.pdkPartial) ||
      imbalance(a) - imbalance(b) ||
      (need.kind === "role" ? incoming(b) - incoming(a) : 0) ||
      a.gain - b.gain ||
      Math.abs(a.salaryDiff) - Math.abs(b.salaryDiff) ||
      a.moves.length - b.moves.length,
  );
  // pacchetto che va a `to`: contratti (senza il giocatore cercato) e pick
  const side = (r: FinderResult, to: string) =>
    r.moves
      .filter((m) => m.to === to && !(need.kind === "player" && m.kind === "contract" && m.id === need.contractId))
      .map((m) => `${m.kind[0]}${m.id}`)
      .sort()
      .join(",");
  const byReceive = new Map<string, number>();
  const gave = new Set<string>();
  const out: FinderResult[] = [];
  for (const r of sorted) {
    const recv = side(r, mine.id);
    const give = side(r, r.teams[1]);
    if (gave.has(give) || (byReceive.get(recv) ?? 0) >= SAME_RECEIVE) continue;
    gave.add(give);
    byReceive.set(recv, (byReceive.get(recv) ?? 0) + 1);
    out.push(r);
  }
  return out;
}
