// Calcoli di cap, spazio salariale e luxury tax. Regole in docs/REGOLAMENTO.md (R-xx).
// Nessun valore di regolamento è hardcodato nella logica: arriva da LeagueSettings (tabella league_settings).

export type Position = "G" | "A" | "C";
export type Slot = "starter" | "reserve" | "talent";

export interface LeagueSettings {
  /** R-10: salary cap base (X) */
  cap: number;
  /** R-52: budget della squadra riserve (Z) */
  reserveBudget: number;
  /** R-13: il floor è cap - cap / floorDivisor (5 → 200) */
  floorDivisor: number;
  /** R-12: crediti sforati per ogni euro di luxury tax */
  taxCreditsPerEuro: number;
  /** R-12: massimo di crediti sforati tassabili */
  taxMaxOver: number;
  /** R-01 / R-02 / R-03 */
  starters: Record<Position, number>;
  reserveMin: number;
  reserveMax: number;
  reserveMaxPerPosition: number;
}

export interface RosterEntry {
  position: Position;
  slot: Slot;
  salary: number;
}

/** Giocatore tagliato: `salary` è già la quota pagata (1/3 dello stipendio, R-42), come nel foglio. */
export interface CutEntry {
  salary: number;
}

export interface TeamFinance {
  /** cap base + bonus/malus campionato (R-11) */
  effectiveCap: number;
  /** titolari + quote dei tagliati (verificato sul foglio) */
  payroll: number;
  /** effectiveCap - payroll; negativo = sforato */
  capSpace: number;
  reserveSpace: number;
  overCap: boolean;
  belowFloor: boolean;
  floor: number;
  luxuryTaxEur: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function salaryFloor(s: LeagueSettings): number {
  return s.cap - s.cap / s.floorDivisor;
}

/** R-12. ASSUNZIONE: la soglia è il cap effettivo (cap + bonus), vedi docs/OPEN-QUESTIONS.md. */
export function luxuryTaxEur(payroll: number, effectiveCap: number, s: LeagueSettings): number {
  const over = Math.min(Math.max(payroll - effectiveCap, 0), s.taxMaxOver);
  return over / s.taxCreditsPerEuro;
}

export function teamFinance(
  roster: RosterEntry[],
  cuts: CutEntry[],
  bonus: number,
  s: LeagueSettings,
): TeamFinance {
  const sum = (xs: { salary: number }[]) => xs.reduce((t, x) => t + x.salary, 0);
  const payroll = round1(sum(roster.filter((r) => r.slot === "starter")) + sum(cuts));
  const effectiveCap = s.cap + bonus;
  const capSpace = round1(effectiveCap - payroll);
  const reserveSpace = round1(s.reserveBudget - sum(roster.filter((r) => r.slot === "reserve")));
  const floor = salaryFloor(s);
  return {
    effectiveCap,
    payroll,
    capSpace,
    reserveSpace,
    overCap: capSpace < 0,
    belowFloor: payroll < floor,
    floor,
    luxuryTaxEur: luxuryTaxEur(payroll, effectiveCap, s),
  };
}

/** Controlli di composizione (R-01..R-03). Restituisce avvisi, non blocca: in estate la rosa può essere incompleta. */
export function rosterWarnings(roster: RosterEntry[], s: LeagueSettings): string[] {
  const out: string[] = [];
  const starters = roster.filter((r) => r.slot === "starter");
  const reserves = roster.filter((r) => r.slot === "reserve");
  for (const pos of ["G", "A", "C"] as const) {
    const n = starters.filter((r) => r.position === pos).length;
    if (n !== s.starters[pos]) out.push(`Titolari ${pos}: ${n}/${s.starters[pos]}`);
    const rn = reserves.filter((r) => r.position === pos).length;
    if (rn > s.reserveMaxPerPosition) out.push(`Riserve ${pos}: ${rn} (max ${s.reserveMaxPerPosition})`);
  }
  if (reserves.length < s.reserveMin) out.push(`Riserve: ${reserves.length} (min ${s.reserveMin})`);
  if (reserves.length > s.reserveMax) out.push(`Riserve: ${reserves.length} (max ${s.reserveMax})`);
  return out;
}

/** R-60: bonus/malus crediti per posizione finale (1°..8°). */
export const DEFAULT_RANK_BONUS = [5, 4, 3, 2, 0, -1, -2, -3] as const;

/** Valori del regolamento 28/09/2024; in produzione vengono letti da league_settings. */
export const DEFAULT_SETTINGS: LeagueSettings = {
  cap: 250,
  reserveBudget: 80,
  floorDivisor: 5,
  taxCreditsPerEuro: 4,
  taxMaxOver: 20,
  starters: { G: 5, A: 5, C: 3 },
  reserveMin: 3,
  reserveMax: 6,
  reserveMaxPerPosition: 3,
};
