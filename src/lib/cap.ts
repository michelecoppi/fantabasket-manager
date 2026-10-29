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
  /** R-26: durata massima di un contratto rookie (anno in corso incluso), team option compresa */
  rookieMaxYears: number;
  /** R-25: il minimo d'asta di un ex-contratto è questa frazione dell'ultimo stipendio (0.5 = metà) */
  lastContractMinFraction: number;
  /** R-25: mesi di validità del minimo dopo la data dell'ultimo contratto (12 = 1 anno) */
  lastContractValidMonths: number;
  /** R-33: massimo di pick per giro per squadra (ASSUNZIONE: contate per anno di draft) */
  maxPicksPerRound: number;
  /** R-56: squadre al massimo in uno scambio (decisione di lega, non nel regolamento: docs/OPEN-QUESTIONS.md) */
  tradeMaxTeams: number;
  /** Ore entro cui le squadre rispondono a una proposta di scambio (decisione dell'utente 2026-10-29, non nel regolamento) */
  tradeProposalHours: number;
  /** R-34: le pick diventano di proprietà solo questi anni prima del draft */
  pickHorizonYears: number;
  /** R-31: giri del draft */
  draftRounds: number;
  /** R-60: bonus/malus di crediti per la stagione successiva, dal 1° all'ultimo in classifica */
  rankBonus: number[];
  /** R-32: le prime scelte del draft si estraggono tra le ultime N squadre della classifica */
  lotteryTeams: number;
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

/** Una squadra di uno scambio, con ciò che cede (id contratto / id pick) e a chi. */
export interface TradeParty {
  /** id della squadra: è il valore delle destinazioni in `gives.to` */
  id: string;
  name: string;
  side: TradeSide;
  picks: PickInfo[];
  /**
   * `slots`: slot con cui un giocatore ceduto entra nella squadra che lo riceve; senza voce mantiene quello che aveva
   * (docs/OPEN-QUESTIONS.md). Solo titolare o riserva: la squadra talenti si gestisce a parte.
   * `to`: squadra che riceve ogni giocatore (`contracts`) e ogni pick (`picks`) ceduto; con due squadre si può omettere.
   */
  gives: {
    contracts: ReadonlySet<number>;
    picks: ReadonlySet<number>;
    slots?: ReadonlyMap<number, Slot>;
    to?: { contracts?: ReadonlyMap<number, string>; picks?: ReadonlyMap<number, string> };
  };
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
  /** nello stesso ordine delle squadre passate */
  impacts: TradeImpact[];
  /** impediscono di registrare lo scambio */
  errors: string[];
  /** da mostrare ma non bloccanti */
  warnings: string[];
  /** squadre che con lo scambio sforano il cap: serve l'eccezione del moderatore con motivazione (R-57) */
  capBreakers: string[];
}

/** Slot con cui il giocatore `id` ceduto da `giver` arriva a destinazione; uno slot non ammesso finisce in `errors`. */
function arrivalSlot(giver: TradeParty, id: number, current: Slot, errors: string[]): Slot {
  const chosen = giver.gives.slots?.get(id);
  if (!chosen || chosen === current) return current;
  if (current === "talent" || chosen === "talent") {
    errors.push(`${giver.name}: la squadra talenti non si cambia in uno scambio.`);
    return current;
  }
  return chosen;
}

/**
 * Valutazione completa di uno scambio tra due o più squadre (R-56), condivisa da simulatore (sola lettura) e server action
 * (che poi chiama la RPC). Ogni giocatore o pick ceduto va a una sola squadra (`gives.to`; con due squadre è l'altra).
 * R-57 (cap) è bloccante a meno di eccezione del moderatore; i massimi di rosa (R-01..R-03) bloccano come per firma e modifica,
 * e così il numero massimo di squadre (`tradeMaxTeams`). Minimi di rosa, floor, budget riserve (se peggiora) e limite di pick per giro (R-33)
 * avvisano soltanto.
 */
export function evaluateTrade(parties: readonly TradeParty[], s: LeagueSettings): TradeEvaluation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(parties.map((p) => p.id));
  if (parties.length < 2) errors.push("Servono almeno due squadre.");
  if (parties.length > s.tradeMaxTeams) errors.push(`Al massimo ${s.tradeMaxTeams} squadre in uno scambio.`);
  if (ids.size !== parties.length) errors.push("Una squadra compare due volte nello scambio.");

  /** Squadra che riceve un giocatore/pick ceduto da `giver`; null (con errore) se manca o non è nello scambio. */
  const destination = (giver: TradeParty, kind: "contracts" | "picks", id: number): string | null => {
    const to = giver.gives.to?.[kind]?.get(id) ?? (parties.length === 2 ? parties.find((p) => p !== giver)?.id : undefined);
    const what = kind === "contracts" ? "un giocatore" : "una pick";
    if (!to) errors.push(`${giver.name}: manca la squadra che riceve ${what}.`);
    else if (to === giver.id || !ids.has(to)) errors.push(`${giver.name}: ${what} va a una squadra che non è nello scambio.`);
    else return to;
    return null;
  };

  // Chi riceve cosa, con lo slot di arrivo dei giocatori.
  const incoming = new Map(parties.map((p) => [p.id, { roster: [] as RosterEntry[], picks: [] as PickInfo[] }]));
  for (const giver of parties) {
    const owned = new Set(giver.side.roster.map((r) => r.id));
    for (const id of giver.gives.contracts) if (!owned.has(id)) errors.push(`Un giocatore ceduto non appartiene a ${giver.name}.`);
    const ownedPicks = new Set(giver.picks.map((p) => p.id));
    for (const id of giver.gives.picks) if (!ownedPicks.has(id)) errors.push(`Una pick ceduta non appartiene a ${giver.name}.`);
    // slot di arrivo indicato per un giocatore che non viene ceduto: dati incoerenti, non si applicano in silenzio
    for (const id of giver.gives.slots?.keys() ?? []) {
      if (!giver.gives.contracts.has(id)) errors.push(`${giver.name}: slot indicato per un giocatore che non cede.`);
    }
    for (const r of giver.side.roster) {
      if (!giver.gives.contracts.has(r.id)) continue;
      const to = destination(giver, "contracts", r.id);
      if (to) incoming.get(to)?.roster.push({ position: r.position, slot: arrivalSlot(giver, r.id, r.slot, errors), salary: r.salary });
    }
    for (const p of giver.picks) {
      if (!giver.gives.picks.has(p.id)) continue;
      const to = destination(giver, "picks", p.id);
      if (to) incoming.get(to)?.picks.push(p);
    }
  }

  const giveCount = (p: TradeParty) => p.gives.contracts.size + p.gives.picks.size;
  const impacts = parties.map((me) => {
    const got = incoming.get(me.id) ?? { roster: [], picks: [] };
    const impact = tradeImpact(me.side, me.gives.contracts, got.roster, s);
    const rosterAfter = [...me.side.roster.filter((r) => !me.gives.contracts.has(r.id)), ...got.roster];
    errors.push(...rosterLimitErrors(me.side.roster, rosterAfter, s).map((error) => `${me.name}: ${error}`));
    warnings.push(...pickLimitWarnings(me.name, [...me.picks.filter((p) => !me.gives.picks.has(p.id)), ...got.picks], s));
    if (me.picks.some((x) => me.gives.picks.has(x.id) && x.toConfirm)) warnings.push(`${me.name} cede una pick con proprietà da confermare.`);
    if (impact.after.reserveSpace < 0 && impact.after.reserveSpace < impact.before.reserveSpace) {
      warnings.push(`${me.name}: riserve oltre il budget di ${s.reserveBudget} (R-03).`);
    }
    return { impact, involved: giveCount(me) + got.roster.length + got.picks.length > 0 };
  });

  if (parties.reduce((n, p) => n + giveCount(p), 0) === 0) errors.push("Lo scambio è vuoto.");
  else for (const [i, p] of parties.entries()) if (!impacts[i].involved) errors.push(`${p.name}: non cede e non riceve nulla.`);

  return {
    impacts: impacts.map((x) => x.impact),
    errors: [...new Set(errors)],
    warnings,
    capBreakers: parties.filter((_, i) => impacts[i].impact.breaksCap).map((p) => p.name),
  };
}

export interface ContractTerms {
  slot: Slot;
  /** null = durata ancora da fissare (R-51: si sceglie dopo l'asta) */
  years: number | null;
  teamOption: boolean;
  salary: number;
  /** R-26: contratto rookie, con durata massima `rookieMaxYears` */
  isRookie?: boolean;
}

/** R-42: quota pagata per un taglio = 1/3 dello stipendio arrotondato allo 0.5 più vicino (5 → 1.5, 10 → 3.5). */
export function cutShare(salary: number): number {
  return Math.round((salary / 3) * 2) / 2;
}

/** Ultimo contratto di un giocatore (riga più recente di `last_contracts`): stipendio e data `YYYY-MM-DD`. */
export interface LastContract {
  salary: number;
  on: string;
  /** R-23: diritto di pareggio ancora aperto (l'ultima riga è restricted e non è stata consumata da una firma). */
  restricted?: boolean;
}

/**
 * R-24: un giocatore con diritto restricted aperto, alla firma successiva (qualunque squadra), ha un contratto unrestricted e il
 * diritto si consuma: niente due prelazioni consecutive. Lo applica anche il trigger `contracts_consume_right`; qui serve ad avvisare
 * l'admin e a non dipendere dal checkbox. ASSUNZIONE confermata dall'utente (docs/OPEN-QUESTIONS.md).
 */
export function signingRestriction(last: LastContract | null, manualUnrestricted: boolean): { unrestricted: boolean; consumesRight: boolean } {
  const consumesRight = last?.restricted === true;
  return { unrestricted: consumesRight || manualUnrestricted, consumesRight };
}

export interface AuctionFloor {
  lastSalary: number;
  /** Stipendio minimo ammesso, arrotondato per eccesso al decimo (gli stipendi hanno al massimo un decimale). */
  minimum: number;
  /** Primo giorno in cui il minimo non vale più (`YYYY-MM-DD`). */
  expiresOn: string;
}

/** Aggiunge `months` mesi a una data `YYYY-MM-DD` (UTC; il giorno si ferma a fine mese: 31/08 + 6 mesi = 28/02). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + Math.round(months);
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

/**
 * R-25: minimo d'asta di un ex-contratto = frazione (metà) dell'ultimo stipendio, valido per `lastContractValidMonths` mesi
 * dalla data dell'ultimo contratto. `today` è `YYYY-MM-DD`. Restituisce null se non c'è un ultimo contratto o il vincolo è scaduto.
 * ASSUNZIONI (docs/OPEN-QUESTIONS.md): il minimo cade il giorno dell'anniversario (escluso); i quarti di credito si arrotondano per eccesso.
 */
export function auctionFloor(last: LastContract | null, today: string, s: LeagueSettings): AuctionFloor | null {
  if (!last) return null;
  const expiresOn = addMonths(last.on, s.lastContractValidMonths);
  if (today >= expiresOn) return null;
  const exact = Math.round(last.salary * s.lastContractMinFraction * 1000) / 1000;
  return { lastSalary: last.salary, minimum: Math.ceil(Math.round(exact * 100) / 10) / 10, expiresOn };
}

/** R-25: errore bloccante se l'offerta è sotto il minimo (la metà esatta è accettata). */
export function auctionFloorErrors(salary: number, floor: AuctionFloor | null): string[] {
  if (!floor || !Number.isFinite(salary) || salary >= floor.minimum) return [];
  return [`Sotto il minimo d'asta (R-25): ultimo stipendio ${floor.lastSalary}, minimo ${floor.minimum} fino al ${floor.expiresOn}.`];
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
  // R-26: con la team option la durata totale è years + 1 (come in teamOptionAllowed).
  if (t.isRookie && t.years !== null && t.years + (t.teamOption ? 1 : 0) > s.rookieMaxYears) {
    out.push(`Un contratto rookie dura al massimo ${s.rookieMaxYears} stagioni, team option compresa (R-26).`);
  }
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
  const startersTotal = s.starters.G + s.starters.A + s.starters.C;
  if (starters.length !== startersTotal) out.push(`Titolari: ${starters.length}/${startersTotal}`);
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
  rookieMaxYears: 2,
  lastContractMinFraction: 0.5,
  lastContractValidMonths: 12,
  maxPicksPerRound: 2,
  tradeMaxTeams: 4,
  tradeProposalHours: 24,
  pickHorizonYears: 3,
  draftRounds: 5,
  rankBonus: [5, 4, 3, 2, 0, -1, -2, -3],
  lotteryTeams: 4,
};
