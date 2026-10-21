// Legge Dunkest.xlsx e restituisce dati strutturati + avvisi. Nessuna scrittura: vedi scripts/import-xlsx.ts.
import ExcelJS from "exceljs";
import { PICKS_TO_CONFIRM, PICK_OVERRIDES } from "./overrides";
import {
  SHEET_TEAM_ORDER,
  lettersOnly,
  parseContractName,
  parseSheetDate,
  parseTalentName,
  positionFromRole,
  resolveTeam,
  splitShortName,
  type TeamName,
} from "./names";

type Pos = "G" | "A" | "C";

export interface CatalogPlayer {
  firstName: string;
  lastName: string;
  pos: Pos | null;
  nbaTeam: string | null;
  credits: number | null;
  owner: TeamName | null; // colonna "Restricted" del foglio 3: contiene il proprietario attuale
}

export type MatchKind = "owner" | "unique" | "salary" | "none" | "ambiguous";
export interface PlayerRef {
  rawName: string;
  catalog: CatalogPlayer | null;
  match: MatchKind;
  pos: Pos | null;
}

export interface ContractRow {
  team: TeamName;
  slot: "starter" | "reserve";
  role: Pos;
  years: number;
  teamOption: boolean;
  restriction: "restricted" | "unrestricted" | null;
  salary: number;
  player: PlayerRef;
}
export interface CutRow {
  team: TeamName;
  role: Pos | null;
  years: number | null;
  teamOption: boolean;
  originalSalary: number | null;
  paidSalary: number;
  player: PlayerRef;
}
export interface TalentRow {
  team: TeamName;
  role: Pos | null;
  displayName: string;
  draftYear: number | null;
  notes: string | null;
  credits: number | null;
}
export interface PickRow {
  year: number;
  round: number;
  original: TeamName;
  current: TeamName | null;
  rawStatus: string;
  toConfirm: boolean;
}
export interface RookieDraftRow {
  pickNo: number;
  team: TeamName;
  lastName: string;
  firstName: string;
  nbaTeam: string;
  note: string | null;
}
export interface LastContractRow {
  date: string;
  team: TeamName;
  salary: number;
  restriction: "restricted" | "unrestricted" | null;
  pos: Pos | null;
  player: PlayerRef;
}
export interface SheetStats {
  team: TeamName;
  monte: number;
  spazio: number;
  spazioRiserve: number;
  bonus: number;
  sforato: boolean;
  quotaPagata: boolean;
}

export interface ImportData {
  catalog: CatalogPlayer[];
  contracts: ContractRow[];
  cuts: CutRow[];
  talents: TalentRow[];
  picks: PickRow[];
  rookieDraft: RookieDraftRow[];
  lastContracts: LastContractRow[];
  stats: SheetStats[];
  warnings: string[];
}

function cellValue(ws: ExcelJS.Worksheet, row: number, col: number): string | number | null {
  const v = ws.getCell(row, col).value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.replace(/ /g, " ").trim();
    return t === "" ? null : t;
  }
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim() || null;
    if (o.result !== undefined) return o.result as string | number;
    if (o.text) return o.text;
  }
  return null;
}
const str = (ws: ExcelJS.Worksheet, r: number, c: number) => {
  const v = cellValue(ws, r, c);
  return v === null ? null : String(v);
};
const num = (ws: ExcelJS.Worksheet, r: number, c: number) => {
  const v = cellValue(ws, r, c);
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function readCatalog(ws: ExcelJS.Worksheet): CatalogPlayer[] {
  const out: CatalogPlayer[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const first = str(ws, r, 1);
    const last = str(ws, r, 2);
    if (!first && !last) continue;
    out.push({
      firstName: first ?? "",
      lastName: last ?? "",
      pos: positionFromRole(str(ws, r, 3)),
      nbaTeam: str(ws, r, 4),
      credits: num(ws, r, 5),
      owner: resolveTeam(str(ws, r, 6)),
    });
  }
  return out;
}

/** Collega il nome breve del foglio ("F.Wagner") al listone Dunkest, usando proprietario e stipendio per i casi dubbi. */
export function matchPlayer(
  rawName: string,
  team: TeamName | null,
  salary: number | null,
  catalog: CatalogPlayer[],
  pos: Pos | null,
): PlayerRef {
  const { prefix, last } = splitShortName(rawName);
  const cands = catalog.filter(
    (p) => lettersOnly(p.lastName) === last && (prefix === "" || lettersOnly(p.firstName).startsWith(prefix)),
  );
  const done = (catalogPlayer: CatalogPlayer | null, match: MatchKind): PlayerRef => ({
    rawName,
    catalog: catalogPlayer,
    match,
    pos: pos ?? catalogPlayer?.pos ?? null,
  });
  if (cands.length === 0) return done(null, "none");
  const mine = team ? cands.filter((p) => p.owner === team) : [];
  if (mine.length === 1) return done(mine[0], "owner");
  if (cands.length === 1) return done(cands[0], "unique");
  const pool = mine.length > 1 ? mine : cands;
  const bySalary = salary === null ? [] : pool.filter((p) => p.credits === salary);
  if (bySalary.length === 1) return done(bySalary[0], "salary");
  return done(null, "ambiguous");
}

export async function parseWorkbook(path: string): Promise<ImportData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const f1 = wb.getWorksheet("Foglio1");
  const f2 = wb.getWorksheet("Foglio2");
  const f3 = wb.getWorksheet("Foglio3");
  if (!f1 || !f2 || !f3) throw new Error("Servono i fogli Foglio1, Foglio2, Foglio3");

  const warnings: string[] = [];
  const catalog = readCatalog(f3);
  const base = (k: number) => 2 + 3 * k; // colonna B, E, H, ... per ciascuna delle 8 squadre

  // ---- titolari (righe 4-16) e riserve (18-23)
  const contracts: ContractRow[] = [];
  SHEET_TEAM_ORDER.forEach((team, k) => {
    const c = base(k);
    const ranges: ["starter" | "reserve", number, number][] = [
      ["starter", 4, 16],
      ["reserve", 18, 23],
    ];
    for (const [slot, from, to] of ranges) {
      for (let r = from; r <= to; r++) {
        const raw = str(f1, r, c + 1);
        if (!raw) continue;
        const role = positionFromRole(str(f1, r, c));
        const salary = num(f1, r, c + 2);
        const p = parseContractName(raw);
        if (!role || salary === null || p.years === null) {
          warnings.push(`${team} riga ${r}: contratto non leggibile (${raw})`);
          continue;
        }
        contracts.push({
          team,
          slot,
          role,
          years: p.years,
          teamOption: p.teamOption,
          restriction: p.restriction,
          salary,
          player: matchPlayer(p.name, team, salary, catalog, role),
        });
      }
    }
  });

  // ---- tagliati (57-69) e talenti (74-88)
  const cuts: CutRow[] = [];
  const talents: TalentRow[] = [];
  SHEET_TEAM_ORDER.forEach((team, k) => {
    const c = base(k);
    for (let r = 57; r <= 69; r++) {
      const raw = str(f1, r, c + 1);
      if (!raw) continue;
      const paid = num(f1, r, c + 2);
      const p = parseContractName(raw, { trailingNumber: true });
      if (paid === null) {
        warnings.push(`${team} tagliato riga ${r}: stipendio mancante (${raw})`);
        continue;
      }
      const role = positionFromRole(str(f1, r, c));
      cuts.push({
        team,
        role,
        years: p.years,
        teamOption: p.teamOption,
        originalSalary: p.trailingNumber,
        paidSalary: paid,
        player: matchPlayer(p.name, team, p.trailingNumber, catalog, role),
      });
    }
    for (let r = 74; r <= 88; r++) {
      const raw = str(f1, r, c + 1);
      if (!raw) continue;
      const t = parseTalentName(raw);
      talents.push({
        team,
        role: positionFromRole(str(f1, r, c)),
        displayName: t.name,
        draftYear: t.draftYear,
        notes: t.notes,
        credits: num(f1, r, c + 2),
      });
    }
  });

  // ---- pick: due blocchi di 4 proprietari (intestazioni righe 33 e 42; giri 35-39 e 44-48)
  const picks: PickRow[] = [];
  const pickBlocks = [
    { header: 33, yearRow: 34, firstRound: 35, owners: SHEET_TEAM_ORDER.slice(0, 4) },
    { header: 42, yearRow: 43, firstRound: 44, owners: SHEET_TEAM_ORDER.slice(4, 8) },
  ];
  for (const b of pickBlocks) {
    b.owners.forEach((owner, i) => {
      const oc = 2 + 6 * i;
      const label = str(f1, b.header, oc);
      if (!label || resolveTeam(label) !== owner) {
        warnings.push(`Pick: intestazione attesa ${owner} in riga ${b.header}, trovato ${label}`);
      }
      for (let y = 0; y < 3; y++) {
        const yc = oc + 2 * y;
        const ym = /(\d{4})/.exec(str(f1, b.yearRow, yc) ?? "");
        if (!ym) continue;
        for (let round = 1; round <= 5; round++) {
          const status = str(f1, b.firstRound + round - 1, yc + 1);
          if (!status) continue;
          const swap = /^S\((.+)\)$/i.exec(status);
          const override = PICK_OVERRIDES[`${ym[1]}-${round}-${owner}`];
          const current = override ?? (swap ? resolveTeam(swap[1]) : status.toUpperCase() === "T" ? owner : null);
          const toConfirm = PICKS_TO_CONFIRM.has(`${ym[1]}-${round}-${owner}`);
          if (!current && !toConfirm) warnings.push(`Pick ${ym[1]} giro ${round} di ${owner}: stato non riconosciuto "${status}"`);
          picks.push({ year: Number(ym[1]), round, original: owner, current, rawStatus: status, toConfirm });
        }
      }
    });
  }

  // ---- ordine rookie draft (Foglio2)
  const rookieDraft: RookieDraftRow[] = [];
  for (let r = 1; r <= f2.rowCount; r++) {
    const t = resolveTeam(str(f2, r, 1));
    const last = str(f2, r, 2);
    if (!t || !last) continue;
    rookieDraft.push({
      pickNo: rookieDraft.length + 1,
      team: t,
      lastName: last,
      firstName: str(f2, r, 4) ?? "",
      nbaTeam: str(f2, r, 5) ?? "",
      note: str(f2, r, 6),
    });
  }

  // ---- ultimo contratto (colonne AC-AF, righe 4+)
  const lastContracts: LastContractRow[] = [];
  let date: string | null = null;
  let lastTeam: TeamName | null = null;
  for (let r = 4; r <= f1.rowCount; r++) {
    const d = cellValue(f1, r, 29);
    if (d !== null) {
      date = parseSheetDate(d) ?? date;
      lastTeam = null; // nuovo gruppo di date: la squadra si eredita solo dentro lo stesso gruppo
    }
    const raw = str(f1, r, 30);
    const sal = num(f1, r, 31);
    // squadra vuota = stessa del gruppo (es. O.Toppin sotto Porter e Thor → San Antonio)
    const team: TeamName | null = resolveTeam(str(f1, r, 32)) ?? lastTeam;
    if (!raw || sal === null) continue;
    lastTeam = team;
    if (!team || !date) {
      warnings.push(`Ultimo contratto riga ${r}: squadra o data non riconosciuta (${raw})`);
      continue;
    }
    const p = parseContractName(raw);
    lastContracts.push({
      date,
      team,
      salary: sal,
      restriction: p.restriction,
      pos: p.position,
      player: matchPlayer(p.name, null, sal, catalog, p.position),
    });
  }

  // ---- riepilogo del foglio (righe 26-31, colonne D-K): serve a verificare i calcoli
  const stats: SheetStats[] = SHEET_TEAM_ORDER.map((team, k) => {
    const c = 4 + k;
    const yes = (v: string | null) => (v ?? "").toUpperCase().startsWith("S");
    return {
      team,
      monte: num(f1, 26, c) ?? NaN,
      spazio: num(f1, 27, c) ?? NaN,
      spazioRiserve: num(f1, 30, c) ?? NaN,
      bonus: num(f1, 31, c) ?? NaN,
      sforato: yes(str(f1, 28, c)),
      quotaPagata: yes(str(f1, 29, c)),
    };
  });

  return { catalog, contracts, cuts, talents, picks, rookieDraft, lastContracts, stats, warnings };
}
