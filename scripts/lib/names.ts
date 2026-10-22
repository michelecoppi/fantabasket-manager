// Parsing dei testi del foglio Excel: nomi contratto, alias squadra, normalizzazione. Vedi docs/DATA-MODEL.md.

const TEAM_NAMES = [
  "Assago Farmers",
  "CUS Cosenza",
  "Bol Bollerz",
  "Dame Time",
  "Atlanto Non Vinco",
  "Spaccinos",
  "OKCC",
  "San Antonio",
] as const;
export type TeamName = (typeof TEAM_NAMES)[number];

/** Ordine delle squadre nei blocchi del foglio (AMEDEO, LUGIU, GABBY, DAMIANO, SCUTI, SERDE, CC, ENTONY). */
export const SHEET_TEAM_ORDER: TeamName[] = [...TEAM_NAMES];

const ALIASES: Record<string, TeamName> = {
  amedeo: "Assago Farmers",
  farmers: "Assago Farmers",
  asf: "Assago Farmers",
  lugiu: "CUS Cosenza",
  cus: "CUS Cosenza",
  cosenza: "CUS Cosenza",
  gabby: "Bol Bollerz",
  bol: "Bol Bollerz",
  bollerz: "Bol Bollerz",
  damiano: "Dame Time",
  dame: "Dame Time",
  scuti: "Atlanto Non Vinco",
  atlanto: "Atlanto Non Vinco",
  serde: "Spaccinos",
  spacc: "Spaccinos",
  spaccinos: "Spaccinos",
  cc: "OKCC",
  okcc: "OKCC",
  thunders: "OKCC",
  cckers: "OKCC",
  entony: "San Antonio",
  antonio: "San Antonio",
  spurs: "San Antonio",
  stant: "San Antonio",
  sanantonio: "San Antonio",
};

export const lettersOnly = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Restituisce la squadra per un alias del foglio, o null se sconosciuto (es. "ChS"). */
export function resolveTeam(raw: string | null | undefined): TeamName | null {
  if (!raw) return null;
  const key = lettersOnly(raw);
  if (ALIASES[key]) return ALIASES[key];
  const exact = TEAM_NAMES.find((t) => lettersOnly(t) === key);
  return exact ?? null;
}

export interface ParsedContractName {
  years: number | null;
  teamOption: boolean;
  name: string;
  restriction: "unrestricted" | null; // sigla `u`
  rookie: boolean; // sigla `r`: contratto rookie
  position: "G" | "A" | "C" | null;
  /** numero finale (solo nei tagliati: stipendio originale) */
  trailingNumber: number | null;
}

/** "1+1 F.Wagner u" → anni 1, option, "F.Wagner", unrestricted. `r` = rookie, `u` = unrestricted. */
export function parseContractName(raw: string, opts: { trailingNumber?: boolean } = {}): ParsedContractName {
  let s = raw.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  let years: number | null = null;
  let teamOption = false;
  const head = /^(\d+(?:\.\d)?)(\+1)?\s+(.*)$/.exec(s);
  if (head) {
    years = Number(head[1]);
    teamOption = Boolean(head[2]);
    s = head[3];
  }
  let position: ParsedContractName["position"] = null;
  const pos = /\s*\(([GAC])\)\s*/.exec(s);
  if (pos) {
    position = pos[1] as "G" | "A" | "C";
    s = s.replace(pos[0], " ").trim();
  }
  let trailingNumber: number | null = null;
  if (opts.trailingNumber) {
    const t = /\s+(\d+(?:\.\d)?)$/.exec(s);
    if (t) {
      trailingNumber = Number(t[1]);
      s = s.slice(0, t.index).trim();
    }
  }
  let restriction: ParsedContractName["restriction"] = null;
  let rookie = false;
  const flag = /\s+([ur])$/i.exec(s);
  if (flag) {
    if (flag[1].toLowerCase() === "u") restriction = "unrestricted";
    else rookie = true;
    s = s.slice(0, flag.index).trim();
  }
  return { years, teamOption, name: s, restriction, rookie, position, trailingNumber };
}

/** "Ja.Williams" → { prefix: "ja", last: "williams" }; "Murphy III" → { prefix: "", last: "murphyiii" }. */
export function splitShortName(name: string): { prefix: string; last: string } {
  const dot = /^([A-Za-z]{1,4})\.\s*(.+)$/.exec(name.trim());
  if (dot) return { prefix: lettersOnly(dot[1]), last: lettersOnly(dot[2]) };
  return { prefix: "", last: lettersOnly(name) };
}

export interface ParsedTalent {
  name: string;
  draftYear: number | null;
  notes: string | null;
}

/** "Sorber 25 26?" → Sorber, 2025, note "26?" ; "Zikarsky25" → Zikarsky, 2025. */
export function parseTalentName(raw: string): ParsedTalent {
  const s = raw.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s*(\d{2})(.*)$/.exec(s);
  if (!m) return { name: s, draftYear: null, notes: null };
  const notes = m[3].trim();
  return { name: m[1].trim(), draftYear: 2000 + Number(m[2]), notes: notes || null };
}

/** "2026.09" → "2026-09-01" */
export function parseSheetDate(v: number | string): string | null {
  const m = /^(\d{4})\.(\d{1,2})$/.exec(String(v).trim());
  if (!m) return null;
  // il foglio salva i mesi come decimali: 2026.1 significa ottobre (2026.10), non gennaio
  const month = m[2].length === 1 ? Number(m[2]) * 10 : Number(m[2]);
  return `${m[1]}-${String(month).padStart(2, "0")}-01`;
}

export function positionFromRole(role: string | null | undefined): "G" | "A" | "C" | null {
  const r = (role ?? "").trim().toUpperCase();
  if (r === "G" || r === "A" || r === "C") return r;
  if (r.startsWith("GUARD")) return "G";
  if (r.startsWith("FORWARD")) return "A";
  if (r.startsWith("CENTER")) return "C";
  return null;
}
