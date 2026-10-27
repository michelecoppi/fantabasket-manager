// Chiusura di stagione: classifica → bonus (R-60), ordine del draft (R-32), scadenza dei contratti (R-23/R-24/R-26), luxury tax (R-12).
// Pura e testata: la server action calcola il piano qui e la RPC `admin_close_season` lo applica in una transazione,
// senza ricalcolare nulla (regole solo in TypeScript, come per `cap.ts`).
import type { LeagueSettings } from "./cap";
import { fmtEuro } from "./format";

/**
 * Interruttore di sicurezza: finché è false la chiusura non parte (né dal pulsante né dall'action), anche con il piano valido.
 * La chiusura non si annulla; si porta a true con una PR dopo aver provato la RPC su dati veri.
 */
export const SEASON_CLOSE_ENABLED = false;

export interface CloseContract {
  id: number;
  version: number;
  teamId: string;
  name: string;
  /** null = durata ancora da fissare */
  years: number | null;
  teamOption: boolean;
  isRookie: boolean;
  restriction: "unrestricted" | null;
}
/** Solo i tagli che pesano sul monte ingaggi: `pending` (in asta) e `cut` (definitivi). */
export interface CloseCut {
  id: number;
  version: number;
  teamId: string;
  name: string;
  status: "pending" | "cut";
  years: number | null;
}
export interface ClosePick {
  year: number;
  round: number;
  originalTeamId: string;
  currentTeamId: string | null;
  toConfirm: boolean;
}
export interface CloseTeam {
  id: string;
  name: string;
  /** luxury tax in euro, sul monte ingaggi di adesso (R-12) */
  taxEur: number;
  taxPaid: boolean;
}
export interface CloseInput {
  seasonId: number;
  seasonYear: number;
  teams: CloseTeam[];
  contracts: CloseContract[];
  cuts: CloseCut[];
  picks: ClosePick[];
}

/** Scelte dell'admin. Le liste hanno una voce per posizione, "" = non ancora scelta. */
export interface CloseChoices {
  /** squadre dal 1° all'ultimo posto della classifica */
  ranking: string[];
  /** squadre nell'ordine in cui sono uscite alla lottery (R-32), prime scelte del draft */
  lottery: string[];
  /** contratti la cui team option è esercitata (R-22) */
  exercised: number[];
}

export interface ClosePlan {
  errors: string[];
  warnings: string[];
  newYear: number;
  /** `taxEur`: luxury tax dovuta alla chiusura (R-12), solo per il registro */
  teams: { teamId: string; rank: number; bonus: number; taxEur: number }[];
  carryContracts: { id: number; version: number; years: number; teamOption: boolean; restriction: "unrestricted" | null }[];
  /** `restricted`: il vecchio proprietario può pareggiare l'offerta più alta (R-23) */
  expireContracts: { id: number; version: number; teamId: string; name: string; restricted: boolean }[];
  carryCuts: { id: number; version: number; years: number }[];
  endCuts: { id: number; version: number }[];
  draftOrder: { pickNo: number; round: number; teamId: string; originalTeamId: string; note: string }[];
  summary: string;
}

const isPermutation = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/**
 * R-23 / R-24: a fine contratto il vecchio proprietario può pareggiare (restricted), salvo mezza stagione
 * o contratto già unrestricted (secondo contratto dopo un pareggio). L'option riscattata è gestita a parte.
 */
export const expiresRestricted = (years: number, restriction: "unrestricted" | null) => years !== 0.5 && restriction !== "unrestricted";

/** R-22: la team option si decide nell'ultimo anno di contratto. */
export const optionContracts = (contracts: CloseContract[]) => contracts.filter((c) => c.teamOption && c.years !== null && c.years <= 1);

const names = (xs: { name: string }[]) => xs.slice(0, 3).map((x) => x.name).join(", ") + (xs.length > 3 ? "…" : "");

export function planSeasonClose(input: CloseInput, choices: CloseChoices, s: LeagueSettings): ClosePlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const n = input.teams.length;
  const newYear = input.seasonYear + 1;
  const teamName = (id: string) => input.teams.find((t) => t.id === id)?.name ?? "?";
  const plan: ClosePlan = { errors, warnings, newYear, teams: [], carryContracts: [], expireContracts: [], carryCuts: [], endCuts: [], draftOrder: [], summary: "" };

  // R-60: bonus per la stagione successiva dalla classifica finale.
  if (s.rankBonus.length !== n) errors.push(`I bonus di classifica (R-60) sono ${s.rankBonus.length} ma le squadre ${n}: correggi league_settings.`);
  const rankingOk = isPermutation(choices.ranking, input.teams.map((t) => t.id));
  if (!rankingOk) errors.push("Completa la classifica: ogni squadra in una sola posizione.");
  else plan.teams = choices.ranking.map((teamId, i) => ({ teamId, rank: i + 1, bonus: s.rankBonus[i] ?? 0, taxEur: input.teams.find((t) => t.id === teamId)?.taxEur ?? 0 }));

  // R-32: le prime scelte escono dalla lottery tra le ultime N, le altre vanno in ordine inverso di classifica.
  const lotteryN = s.lotteryTeams;
  let order: string[] = [];
  if (!Number.isInteger(lotteryN) || lotteryN < 1 || lotteryN > n) errors.push(`lottery_teams non valido (${lotteryN}).`);
  else if (rankingOk) {
    const bottom = choices.ranking.slice(n - lotteryN);
    if (!isPermutation(choices.lottery, bottom)) errors.push(`Lottery: indica le ${lotteryN} squadre dal ${n - lotteryN + 1}° al ${n}° posto, ognuna una volta.`);
    else order = [...choices.lottery, ...choices.ranking.slice(0, n - lotteryN).reverse()];
  }
  if (order.length > 0) {
    const draftPicks = input.picks.filter((p) => p.year === newYear);
    let missing = 0;
    let unowned = 0;
    for (let round = 1; round <= s.draftRounds; round++) {
      order.forEach((original, pos) => {
        const pick = draftPicks.find((p) => p.round === round && p.originalTeamId === original);
        if (!pick) missing++;
        else if (!pick.currentTeamId) unowned++;
        else {
          plan.draftOrder.push({
            pickNo: (round - 1) * n + pos + 1,
            round,
            teamId: pick.currentTeamId,
            originalTeamId: original,
            note: pick.currentTeamId === original ? "" : `Da ${teamName(original)}`,
          });
        }
      });
    }
    if (missing) errors.push(`Mancano ${missing} pick del draft ${newYear}.`);
    if (unowned) errors.push(`${unowned} pick del draft ${newYear} senza proprietario: assegnale in Pick.`);
    const toConfirm = draftPicks.filter((p) => p.toConfirm).length;
    if (toConfirm) warnings.push(`${toConfirm} pick del draft ${newYear} hanno la proprietà da confermare: l'ordine usa il proprietario attuale.`);
  }

  // R-23 / R-24 / R-26: i contratti in scadenza escono dalla rosa, gli altri passano alla stagione nuova con un anno in meno.
  const noYears = input.contracts.filter((c) => c.years === null);
  if (noYears.length) errors.push(`${noYears.length} contratti senza durata (${names(noYears)}): fissala in Rose.`);
  const options = new Set(optionContracts(input.contracts).map((c) => c.id));
  if (choices.exercised.some((id) => !options.has(id))) errors.push("Una team option scelta non è più valida: ricarica la pagina.");
  const exercised = new Set(choices.exercised);
  for (const c of input.contracts) {
    if (c.years === null) continue;
    if (c.years > 1) {
      plan.carryContracts.push({ id: c.id, version: c.version, years: c.years - 1, teamOption: c.teamOption, restriction: c.restriction });
    } else if (c.teamOption && exercised.has(c.id)) {
      // R-23: con l'option riscattata il giocatore diventa unrestricted a fine contratto.
      plan.carryContracts.push({ id: c.id, version: c.version, years: 1, teamOption: false, restriction: "unrestricted" });
    } else {
      // R-23: mezza stagione → unrestricted; 1/2/3 stagioni → restricted, salvo il secondo contratto dopo un pareggio (R-24).
      const restricted = expiresRestricted(c.years, c.restriction);
      plan.expireContracts.push({ id: c.id, version: c.version, teamId: c.teamId, name: c.name, restricted });
    }
  }

  // R-42: la quota di un taglio si paga fino a fine contratto. I tagli ancora in asta vanno risolti prima.
  const pending = input.cuts.filter((c) => c.status === "pending");
  if (pending.length) errors.push(`${pending.length} tagli ancora in attesa dell'asta dei tagliati (${names(pending)}): chiudili in Rose.`);
  for (const c of input.cuts.filter((x) => x.status === "cut")) {
    if (c.years === null) warnings.push(`${c.name}: taglio senza durata, la quota termina con la stagione.`);
    if (c.years !== null && c.years > 1) plan.carryCuts.push({ id: c.id, version: c.version, years: c.years - 1 });
    else plan.endCuts.push({ id: c.id, version: c.version });
  }

  // R-12: dopo la chiusura /admin/quote lavora sulla stagione nuova, quindi la tassa non pagata si perde di vista.
  for (const t of input.teams) {
    if (t.taxEur > 0 && !t.taxPaid) warnings.push(`${t.name} deve ${fmtEuro(t.taxEur)} € di luxury tax non segnati come pagati: dopo la chiusura non si tracciano più in Quote.`);
  }

  if (errors.length === 0) {
    const restrictedN = plan.expireContracts.filter((c) => c.restricted).length;
    plan.summary =
      `Stagione ${input.seasonYear} chiusa. Classifica: ${plan.teams.map((t) => `${t.rank}° ${teamName(t.teamId)}`).join(", ")}. ` +
      `Contratti: ${plan.carryContracts.length} passano al ${newYear}, ${plan.expireContracts.length} scadono (${restrictedN} restricted).`;
  }
  return plan;
}
