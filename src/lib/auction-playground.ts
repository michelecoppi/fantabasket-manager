// Scenari del playground dell'asta (/asta, issue #104): da dati veri della lega a una sala d'asta da provare in locale.
// Niente si salva. Gli esempi di tagliati e restricted sono finti e dichiarati come tali nella pagina.
import { auctionBase, type AuctionRules, type LotKind, type LotPlayer } from "./auction";
import { auctionFloor, cutShare, type AuctionFloor, type LeagueSettings, type Position, type TradeSide } from "./cap";

export interface PlaygroundTeam {
  id: string;
  name: string;
  color: string;
  side: TradeSide;
}

/** Giocatore a contratto oggi (serve allo scenario «da zero» e agli esempi di tagliati). */
export interface RosterPick {
  playerId: number;
  contractId: number;
  teamId: string;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  salary: number;
  pdk: number | null;
}

/** Free agent del listone, con il minimo d'asta R-25 e l'eventuale diritto di pareggio R-23 veri. */
export interface FreeAgent extends LotPlayer {
  floor: AuctionFloor | null;
  restrictedTeamId: string | null;
}

export interface PlaygroundData {
  teams: PlaygroundTeam[];
  free: FreeAgent[];
  rostered: RosterPick[];
  settings: LeagueSettings;
  today: string;
}

/** Un giocatore all'asta: tipo di lotto, base e da dove viene il valore. */
export interface PoolEntry {
  player: LotPlayer;
  kind: LotKind;
  formerTeamId: string | null;
  base: number;
  /** «crediti Dunkest» o «stipendio di oggi» (scenario da zero, chi è in rosa non ha crediti nel listone) */
  valueLabel: string;
  example: boolean;
}

export type ScenarioMode = "today" | "zero";

export interface Scenario {
  teams: PlaygroundTeam[];
  /** giocatori chiamabili dalle squadre */
  pool: PoolEntry[];
  /** asta dei tagliati (R-41, R-50): lotti chiamati dall'app prima di tutto il resto */
  cutQueue: PoolEntry[];
  /** ordine di chiamata: tu per primo (nel playground serve a provare subito la chiamata), gli altri sorteggiati */
  order: string[];
}

function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DUNKEST = "crediti Dunkest";
const SALARY = "stipendio di oggi";

/**
 * Prepara la sala. «today» (riparazione): rose e spazio veri, all'asta i free agent del listone. «zero»: rose vuote e tutti
 * all'asta, chi è in rosa col suo stipendio come valore (nel listone non ha crediti). Con `examples` due tagliati e due restricted
 * finti: uno dei restricted è della squadra `me`, così si prova il diritto di pareggio.
 */
export function buildScenario(data: PlaygroundData, mode: ScenarioMode, examples: boolean, me: string, rules: AuctionRules, rand: () => number): Scenario {
  const s = data.settings;
  const bots = data.teams.map((t) => t.id).filter((id) => id !== me);
  let teams = data.teams.map((t) => ({ ...t, side: mode === "zero" ? { roster: [], cuts: [], bonus: t.side.bonus } : t.side }));
  const entry = (player: LotPlayer, valueLabel: string, floor: AuctionFloor | null, kind: LotKind = "free", formerTeamId: string | null = null, example = false): PoolEntry => ({
    player,
    kind,
    formerTeamId,
    base: auctionBase(player.credits, floor, rules),
    valueLabel,
    example,
  });
  const fromRoster = (r: RosterPick): LotPlayer => ({ id: r.playerId, name: r.name, pos: r.pos, nbaTeam: r.nbaTeam, credits: r.salary, pdk: r.pdk });
  const free = data.free.map((f) => entry(f, DUNKEST, f.floor, f.restrictedTeamId ? "restricted" : "free", f.restrictedTeamId));
  let pool = mode === "zero" ? [...data.rostered.map((r) => entry(fromRoster(r), SALARY, null)), ...free] : free;
  const cutQueue: PoolEntry[] = [];

  if (examples) {
    const taken = new Set<number>();
    // Tagliati: un giocatore di metà rosa di due squadre diverse (bot). R-25: la base non scende sotto metà dell'ultimo stipendio.
    for (const teamId of shuffle(bots, rand).slice(0, 2)) {
      const mine = data.rostered.filter((r) => r.teamId === teamId && r.salary >= 4).sort((a, b) => b.salary - a.salary);
      const pick = mine[Math.floor(mine.length / 3 + rand() * (mine.length / 3))];
      if (!pick) continue;
      taken.add(pick.playerId);
      const floor = auctionFloor({ salary: pick.salary, on: data.today }, data.today, s);
      cutQueue.push(entry(fromRoster(pick), SALARY, floor, "cut", teamId, true));
      if (mode === "today") {
        // R-42: tagliato, il posto si libera e la quota resta nel monte ingaggi finché non lo prende un altro (ASSUNZIONE R-41/R-42).
        teams = teams.map((t) =>
          t.id === teamId ? { ...t, side: { ...t.side, roster: t.side.roster.filter((c) => c.id !== pick.contractId), cuts: [...t.side.cuts, { salary: cutShare(pick.salary) }] } } : t,
        );
      }
    }
    // Restricted: contratto scaduto, la squadra di prima può pareggiare (R-23). Uno tuo e uno di un bot.
    const holders = [me, shuffle(bots, rand)[0]];
    for (const holder of holders) {
      const source =
        mode === "zero"
          ? data.rostered.filter((r) => r.teamId === holder && !taken.has(r.playerId)).sort((a, b) => b.salary - a.salary).slice(0, 4)
          : [];
      const r = source[Math.floor(rand() * source.length)];
      if (r) {
        taken.add(r.playerId);
        pool = pool.filter((p) => p.player.id !== r.playerId);
        pool.unshift(entry(fromRoster(r), SALARY, auctionFloor({ salary: r.salary, on: data.today }, data.today, s), "restricted", holder, true));
        continue;
      }
      const top = pool.filter((p) => p.kind === "free" && !taken.has(p.player.id) && p.valueLabel === DUNKEST).slice(0, 6);
      const fa = top[Math.floor(rand() * top.length)];
      if (!fa) continue;
      taken.add(fa.player.id);
      pool = pool.map((p) => (p === fa ? { ...p, kind: "restricted", formerTeamId: holder, example: true } : p));
    }
    pool = pool.filter((p) => !cutQueue.some((c) => c.player.id === p.player.id));
  }

  pool.sort((a, b) => b.player.credits - a.player.credits || a.player.name.localeCompare(b.player.name));
  return { teams, pool, cutQueue, order: [me, ...shuffle(bots, rand)] };
}
