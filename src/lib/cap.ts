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
  /** R-20 / R-22: durata massima di un contratto, team option compresa */
  contractMaxYears: number;
  /** R-33: massimo di pick per giro per squadra (ASSUNZIONE: contate per anno di draft) */
  maxPicksPerRound: number;
  /** R-34: le pick diventano di proprietà solo questi anni prima del draft */
  pickHorizonYears: number;
  /** R-31: giri del draft */
  draftRounds: number;
}

export interface RosterEntry {
  /** null = ruolo sconosciuto (giocatore provvisorio): non conta per nessun ruolo */
  position: Position | null;
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

export interface TradeSide {
  /** `id` identifica il contratto, per poterlo mettere in uscita */
  roster: (RosterEntry & { id: number })[];
  cuts: CutEntry[];
  bonus: number;
}

export interface TradeImpact {
  before: TeamFinance;
  after: TeamFinance;
  /** R-57: lo scambio fa sforare il cap (o peggiora uno sforamento già in corso). Il floor non conta. */
  breaksCap: boolean;
  warnings: string[];
}

/**
 * Effetto di uno scambio sulla squadra: escono i contratti `outgoingIds`, entrano `incoming` (nello stesso slot che avevano).
 * Le pick non incidono sul cap. ASSUNZIONE (docs/OPEN-QUESTIONS.md): se la squadra è già sopra il cap, lo scambio è
 * ammesso solo se non aumenta il monte ingaggi.
 */
export function tradeImpact(side: TradeSide, outgoingIds: ReadonlySet<number>, incoming: RosterEntry[], s: LeagueSettings): TradeImpact {
  const before = teamFinance(side.roster, side.cuts, side.bonus, s);
  const roster = [...side.roster.filter((r) => !outgoingIds.has(r.id)), ...incoming];
  const after = teamFinance(roster, side.cuts, side.bonus, s);
  return {
    before,
    after,
    breaksCap: after.overCap && after.payroll > before.payroll,
    warnings: rosterWarnings(roster, s),
  };
}

export interface PickInfo {
  id: number;
  year: number;
  round: number;
  toConfirm: boolean;
}

/** Una delle due squadre di uno scambio, con ciò che cede (id contratto / id pick). */
export interface TradeParty {
  name: string;
  side: TradeSide;
  picks: PickInfo[];
  gives: { contracts: ReadonlySet<number>; picks: ReadonlySet<number> };
}

/** R-33: avvisi per le squadre che hanno più di `maxPicksPerRound` pick dello stesso giro e anno di draft. */
export function pickLimitWarnings(teamName: string, picks: Pick<PickInfo, "year" | "round">[], s: LeagueSettings): string[] {
  const perRound = new Map<string, number>();
  for (const p of picks) perRound.set(`${p.year}/${p.round}`, (perRound.get(`${p.year}/${p.round}`) ?? 0) + 1);
  const out: string[] = [];
  for (const [key, n] of perRound) {
    if (n > s.maxPicksPerRound) {
      const [year, round] = key.split("/");
      out.push(`${teamName}: ${n} pick del ${round}° giro ${year} (max ${s.maxPicksPerRound}, R-33)`);
    }
  }
  return out;
}

/** R-34: i draft di cui si possono possedere le pick sono quelli dei prossimi `pickHorizonYears` anni (a ottobre 2026: 2027-2029). */
export function pickYearAllowed(year: number, seasonYear: number, s: LeagueSettings): boolean {
  return Number.isInteger(year) && year > seasonYear && year <= seasonYear + s.pickHorizonYears;
}

export interface TradeEvaluation {
  /** nello stesso ordine di (a, b) */
  impacts: [TradeImpact, TradeImpact];
  /** impediscono di registrare lo scambio */
  errors: string[];
  /** da mostrare ma non bloccanti */
  warnings: string[];
  /** squadre che con lo scambio sforano il cap: serve l'eccezione del moderatore con motivazione (R-57) */
  capBreakers: string[];
}

/**
 * Valutazione completa di uno scambio, condivisa da simulatore (sola lettura) e server action (che poi chiama la RPC).
 * R-57 (cap) è bloccante a meno di eccezione del moderatore; composizione della rosa, floor e limite di pick per giro (R-33) avvisano soltanto.
 */
export function evaluateTrade(a: TradeParty, b: TradeParty, s: LeagueSettings): TradeEvaluation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parties = [
    { me: a, other: b },
    { me: b, other: a },
  ] as const;

  const impacts = parties.map(({ me, other }) => {
    const owned = new Set(me.side.roster.map((r) => r.id));
    for (const id of me.gives.contracts) if (!owned.has(id)) errors.push(`Un giocatore ceduto non appartiene a ${me.name}.`);
    const ownedPicks = new Set(me.picks.map((p) => p.id));
    for (const id of me.gives.picks) if (!ownedPicks.has(id)) errors.push(`Una pick ceduta non appartiene a ${me.name}.`);

    const incoming = other.side.roster.filter((r) => other.gives.contracts.has(r.id)).map(({ position, slot, salary }) => ({ position, slot, salary }));
    const impact = tradeImpact(me.side, me.gives.contracts, incoming, s);

    const picksAfter = [...me.picks.filter((p) => !me.gives.picks.has(p.id)), ...other.picks.filter((p) => other.gives.picks.has(p.id))];
    warnings.push(...pickLimitWarnings(me.name, picksAfter, s));
    return impact;
  }) as [TradeImpact, TradeImpact];

  const giveCount = (p: TradeParty) => p.gives.contracts.size + p.gives.picks.size;
  if (giveCount(a) + giveCount(b) === 0) errors.push("Lo scambio è vuoto.");
  for (const p of [a, b]) {
    if (p.picks.some((x) => p.gives.picks.has(x.id) && x.toConfirm)) warnings.push(`${p.name} cede una pick con proprietà da confermare.`);
  }

  return {
    impacts,
    errors: [...new Set(errors)],
    warnings,
    capBreakers: [a, b].filter((_, i) => impacts[i].breaksCap).map((p) => p.name),
  };
}

export interface ContractTerms {
  slot: Slot;
  /** null = durata ancora da fissare (R-51: si sceglie dopo l'asta) */
  years: number | null;
  teamOption: boolean;
  salary: number;
}

/** R-42: quota pagata per un taglio = 1/3 dello stipendio arrotondato allo 0.5 più vicino (5 → 1.5, 10 → 3.5). */
export function cutShare(salary: number): number {
  return Math.round((salary / 3) * 2) / 2;
}

/** R-20: durate ammesse alla firma = mezza stagione e gli interi fino al massimo di lega. */
export function contractDurations(s: LeagueSettings): number[] {
  return [0.5, ...Array.from({ length: Math.floor(s.contractMaxYears) }, (_, i) => i + 1)];
}

/** R-22: team option solo su contratti da 1 o 2 stagioni (durata totale con l'option entro il massimo). */
export function teamOptionAllowed(years: number | null, s: LeagueSettings): boolean {
  return years !== null && Number.isInteger(years) && years >= 1 && years + 1 <= s.contractMaxYears;
}

/** Errori bloccanti sui termini di un contratto (integrità dei dati, durate e option del regolamento). */
export function contractTermsErrors(t: ContractTerms, s: LeagueSettings): string[] {
  const out: string[] = [];
  if (t.slot === "talent") out.push("La squadra talenti si gestisce a parte.");
  if (!Number.isFinite(t.salary) || t.salary <= 0) out.push("Lo stipendio deve essere maggiore di zero.");
  else if (Math.round(t.salary * 10) / 10 !== t.salary) out.push("Lo stipendio ammette al massimo un decimale (mezzi crediti).");
  if (t.years !== null && !contractDurations(s).includes(t.years)) out.push(`Durata non ammessa (R-20): ${t.years}.`);
  if (t.teamOption && !teamOptionAllowed(t.years, s)) out.push("La team option è ammessa solo su contratti da 1 o 2 stagioni (R-22).");
  return out;
}

/**
 * Errori bloccanti sui massimi di rosa (R-01..R-03): titolari per ruolo e in tutto, riserve per ruolo e in tutto.
 * Blocca solo se l'operazione fa salire una categoria oltre il massimo: se la rosa era già oltre (dati importati dal foglio),
 * le modifiche che non peggiorano la situazione restano possibili. I minimi (13 titolari, 3 riserve...) sono solo avvisi,
 * perché in estate la rosa può essere incompleta (`rosterWarnings`).
 */
export function rosterLimitErrors(before: RosterEntry[], after: RosterEntry[], s: LeagueSettings): string[] {
  const count = (roster: RosterEntry[], slot: Slot, pos?: Position) => roster.filter((r) => r.slot === slot && (!pos || r.position === pos)).length;
  const out: string[] = [];
  const check = (label: string, slot: Slot, max: number, pos?: Position) => {
    const n = count(after, slot, pos);
    if (n > max && n > count(before, slot, pos)) out.push(`${label}: ${n} (max ${max}).`);
  };
  const startersMax = s.starters.G + s.starters.A + s.starters.C;
  check("Titolari", "starter", startersMax);
  check("Riserve", "reserve", s.reserveMax);
  for (const pos of ["G", "A", "C"] as const) {
    check(`Titolari ${pos}`, "starter", s.starters[pos], pos);
    check(`Riserve ${pos}`, "reserve", s.reserveMaxPerPosition, pos);
  }
  return out;
}

/**
 * Effetto di una firma sulla squadra. Il cap in firma avvisa soltanto (ASSUNZIONE, docs/OPEN-QUESTIONS.md):
 * nel foglio c'è già chi supera il cap dopo l'asta, quindi non è un blocco. I massimi di rosa invece bloccano.
 */
export function evaluateSigning(
  side: TradeSide,
  terms: ContractTerms & { position: Position | null },
  s: LeagueSettings,
): { errors: string[]; warnings: string[]; impact: TradeImpact } {
  const incoming = { position: terms.position, slot: terms.slot, salary: terms.salary };
  const impact = tradeImpact(side, new Set(), [incoming], s);
  const warnings = [...impact.warnings];
  if (terms.slot === "starter" && impact.after.overCap) warnings.unshift("Dopo la firma il monte ingaggi supera il cap (R-10).");
  if (terms.slot === "reserve" && impact.after.reserveSpace < 0) warnings.unshift("Dopo la firma le riserve superano il budget (R-03).");
  const errors = [...contractTermsErrors(terms, s), ...rosterLimitErrors(side.roster, [...side.roster, incoming], s)];
  return { errors, warnings, impact };
}

/** Effetto della modifica di un contratto esistente (`contractId` = id nella rosa di `side`): stessi controlli della firma. */
export function evaluateContractEdit(
  side: TradeSide,
  contractId: number,
  terms: ContractTerms & { position: Position | null },
  s: LeagueSettings,
): { errors: string[]; warnings: string[]; impact: TradeImpact } {
  const incoming = { position: terms.position, slot: terms.slot, salary: terms.salary };
  const impact = tradeImpact(side, new Set([contractId]), [incoming], s);
  const warnings = [...impact.warnings];
  if (terms.slot === "starter" && impact.after.overCap && !impact.before.overCap) warnings.unshift("Dopo la modifica il monte ingaggi supera il cap (R-10).");
  if (terms.slot === "reserve" && impact.after.reserveSpace < 0 && impact.before.reserveSpace >= 0) warnings.unshift("Dopo la modifica le riserve superano il budget (R-03).");
  const after = [...side.roster.filter((r) => r.id !== contractId), incoming];
  return { errors: [...contractTermsErrors(terms, s), ...rosterLimitErrors(side.roster, after, s)], warnings, impact };
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
  contractMaxYears: 3,
  maxPicksPerRound: 2,
  pickHorizonYears: 3,
  draftRounds: 5,
};
