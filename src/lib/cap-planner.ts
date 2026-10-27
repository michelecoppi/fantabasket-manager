// Planner del cap su più stagioni (issue #46, P3-03): impegni dei contratti e quote dei tagli stagione per stagione,
// con scenari dichiarati (team option, tagli in asta, piazzamento ipotetico). Puro e testato: non scrive nulla
// e non aggiunge regole, legge quelle di cap.ts / season-close.ts e i parametri di league_settings.
// Ipotesi del planner in docs/OPEN-QUESTIONS.md (sezione "Planner del cap").
import { salaryFloor, type LeagueSettings, type Position } from "./cap";
import { endSeason } from "./expiring";
import type { RosterPlayer, TeamView } from "./league";
import { expiresRestricted } from "./season-close";

/** I dati di squadra che servono al planner (serializzabili, passano a un componente client). */
export type PlannerTeam = Pick<TeamView, "starters" | "reserves" | "cuts" | "bonus">;

export interface PlanScenario {
  /** id dei contratti con la team option esercitata (R-22): un anno in più allo stesso stipendio */
  exercised: number[];
  /** ASSUNZIONE R-41/R-42: un tagliato preso da un'altra squadra all'asta non pesa più sull'ex proprietario */
  pendingCutsTaken: boolean;
  /** piazzamento ipotetico, uguale ogni anno: bonus R-60 sul cap delle stagioni future; null = cap base */
  rank: number | null;
}
export const BASE_SCENARIO: PlanScenario = { exercised: [], pendingCutsTaken: false, rank: null };

/**
 * Una stagione di un contratto o di un taglio:
 * full = sotto contratto, half = mezza stagione, option = team option esercitata, option-off = option non esercitata,
 * unknown = durata da fissare, taken = taglio preso all'asta (scenario), null = libero.
 */
export type PlanCell = "full" | "half" | "option" | "option-off" | "unknown" | "taken" | null;

export interface PlanRow {
  /** id del contratto, o del taglio se `kind` = "cut" */
  id: number;
  kind: "starter" | "reserve" | "cut";
  name: string;
  pos: Position | null;
  /** stipendio, o quota pagata per i tagli (R-42) */
  salary: number;
  label: string;
  rookie: boolean;
  /** contratto con team option ancora da decidere */
  hasOption: boolean;
  /** taglio in attesa dell'asta dei tagliati */
  pending: boolean;
  /** una voce per stagione del piano */
  cells: PlanCell[];
  /** ultima stagione sotto contratto e come esce (R-23); null per i tagli e le durate da fissare */
  exit: { year: number; restricted: boolean } | null;
}

export interface PlanSeason {
  year: number;
  /** 0 = stagione corrente: la situazione di oggi, senza scenari */
  offset: number;
  /** cap della stagione: reale oggi, poi cap base (+ bonus del piazzamento ipotetico) */
  cap: number;
  capKind: "actual" | "base" | "hypothetical";
  /** R-60: cap possibile tra l'ultimo e il primo posto in classifica (solo stagioni future) */
  capRange: [number, number] | null;
  floor: number;
  /** stipendi dei titolari sotto contratto (nominali) */
  starters: number;
  /** titolari con la team option esercitata nello scenario */
  options: number;
  /** quote dei tagliati (R-42) */
  cuts: number;
  /** stagioni future: stipendi e quote con durata da fissare, fuori dal totale perché non si sa se ci saranno */
  unknown: number;
  /** titolari + option + tagli: come il monte ingaggi di cap.ts */
  payroll: number;
  space: number;
  /** titolari sotto contratto (con option) e posti da riempire per arrivare a R-01/R-02 */
  starterCount: number;
  openSlots: number;
  reserves: number;
  reserveSpace: number;
}

export interface CapPlan {
  seasons: PlanSeason[];
  rows: PlanRow[];
  /** contratti con team option ancora da decidere */
  optionIds: number[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
/** stagioni coperte (stagione corrente = 0), senza option */
const span = (years: number) => Math.max(Math.ceil(years), 1);

/** Stagioni del piano: almeno la durata massima di un contratto (R-20/R-22), di più se un contratto o un taglio va oltre. */
export function planYears(team: PlannerTeam, currentYear: number, s: LeagueSettings): number[] {
  const ends = [
    ...[...team.starters, ...team.reserves].map((p) => (p.yearsLeft === null ? 1 : span(p.yearsLeft) + (p.teamOption ? 1 : 0))),
    ...team.cuts.map((c) => (c.yearsLeft === null ? 1 : span(c.yearsLeft))),
  ];
  const n = Math.max(s.contractMaxYears, ...ends);
  return Array.from({ length: n }, (_, i) => currentYear + i);
}

function contractRow(p: RosterPlayer, n: number, currentYear: number, exercised: Set<number>): PlanRow {
  const base: Omit<PlanRow, "cells" | "exit"> = {
    id: p.id,
    kind: p.slot,
    name: p.name,
    pos: p.pos,
    salary: p.salary,
    label: p.contractLabel,
    rookie: p.rookie,
    hasOption: p.teamOption && p.yearsLeft !== null,
    pending: false,
  };
  if (p.yearsLeft === null) return { ...base, cells: Array.from({ length: n }, (_, k) => (k === 0 ? "full" : "unknown")), exit: null };
  const years = p.yearsLeft;
  const last = span(years) - 1;
  const on = p.teamOption && exercised.has(p.id);
  const cells = Array.from({ length: n }, (_, k): PlanCell => {
    if (k < last) return "full";
    if (k === last) return years === 0.5 ? "half" : "full";
    if (k === last + 1 && p.teamOption) return on ? "option" : "option-off";
    return null;
  });
  // R-23: con l'option riscattata esce unrestricted un anno dopo.
  const exit = on ? { year: endSeason(currentYear, years) + 1, restricted: false } : { year: endSeason(currentYear, years), restricted: expiresRestricted(years, p.restriction) };
  return { ...base, cells, exit };
}

function cutRow(c: PlannerTeam["cuts"][number], n: number, taken: boolean): PlanRow {
  const last = c.yearsLeft === null ? null : span(c.yearsLeft) - 1;
  const cells = Array.from({ length: n }, (_, k): PlanCell => {
    if (k === 0) return "full"; // oggi la quota conta comunque, anche in asta (ASSUNZIONE R-42)
    if (last === null) return "unknown";
    if (k > last) return null;
    return taken ? "taken" : "full";
  });
  return { id: c.id, kind: "cut", name: c.name, pos: c.pos, salary: c.paid, label: "", rookie: false, hasOption: false, pending: c.status === "pending", cells, exit: null };
}

/**
 * Impegni della squadra per stagione nello scenario dato.
 * La stagione corrente riproduce `teamFinance` (monte ingaggi di oggi, bonus reale); le future partono dal cap base
 * di league_settings, perché bonus e parametri delle stagioni nuove non sono ancora noti.
 */
export function capPlan(team: PlannerTeam, currentYear: number, s: LeagueSettings, scenario: PlanScenario = BASE_SCENARIO): CapPlan {
  const years = planYears(team, currentYear, s);
  const n = years.length;
  const exercised = new Set(scenario.exercised);
  const rows = [
    ...team.starters.map((p) => contractRow(p, n, currentYear, exercised)),
    ...team.reserves.map((p) => contractRow(p, n, currentYear, exercised)),
    ...team.cuts.map((c) => cutRow(c, n, scenario.pendingCutsTaken && c.status === "pending")),
  ];
  const bonusMin = Math.min(...s.rankBonus);
  const bonusMax = Math.max(...s.rankBonus);
  const hypothetical = scenario.rank === null ? null : (s.rankBonus[scenario.rank - 1] ?? null);
  const startersNeeded = s.starters.G + s.starters.A + s.starters.C;

  const seasons = years.map<PlanSeason>((year, k) => {
    const sum = (kind: PlanRow["kind"], cells: PlanCell[]) => round1(rows.filter((r) => r.kind === kind && cells.includes(r.cells[k])).reduce((t, r) => t + r.salary, 0));
    const count = (kind: PlanRow["kind"], cells: PlanCell[]) => rows.filter((r) => r.kind === kind && cells.includes(r.cells[k])).length;
    const starters = sum("starter", ["full", "half"]);
    const options = sum("starter", ["option"]);
    const cuts = sum("cut", ["full"]);
    const unknown = round1(sum("starter", ["unknown"]) + sum("cut", ["unknown"]));
    const payroll = round1(starters + options + cuts);
    const cap = k === 0 ? s.cap + team.bonus : s.cap + (hypothetical ?? 0);
    const starterCount = count("starter", ["full", "half", "option"]);
    const reserves = sum("reserve", ["full", "half", "option"]);
    return {
      year,
      offset: k,
      cap,
      capKind: k === 0 ? "actual" : hypothetical === null ? "base" : "hypothetical",
      capRange: k === 0 ? null : [s.cap + bonusMin, s.cap + bonusMax],
      floor: salaryFloor(s),
      starters,
      options,
      cuts,
      unknown,
      payroll,
      space: round1(cap - payroll),
      starterCount,
      openSlots: Math.max(0, startersNeeded - starterCount),
      reserves,
      reserveSpace: round1(s.reserveBudget - reserves),
    };
  });
  return { seasons, rows, optionIds: rows.filter((r) => r.hasOption).map((r) => r.id) };
}

/** Crediti medi per ogni posto da titolare ancora da riempire; null se la rosa è completa. */
export function perOpenSlot(season: PlanSeason): number | null {
  return season.openSlots > 0 ? round1(season.space / season.openSlots) : null;
}
