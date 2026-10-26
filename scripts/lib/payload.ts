// Trasforma i dati parsati dal foglio nel payload della RPC `import_replace_season` (migrazione 20261026201951).
// Pura e senza rete: il payload è testabile e la scrittura vera avviene in una transazione sola lato Postgres.
import { lettersOnly } from "./names";
import type { ImportData, PlayerRef } from "./parse";

type PlayerKeyInput = { firstName: string; lastName: string; nbaTeam: string | null };

// Chiave del giocatore: la stessa logica con cui l'RPC unisce i duplicati (nome, cognome, squadra NBA ridotti a lettere).
export const playerKey = (p: PlayerKeyInput): string =>
  `${lettersOnly(p.firstName)}|${lettersOnly(p.lastName)}|${lettersOnly(p.nbaTeam ?? "")}`;

export const refKey = (r: PlayerRef): string =>
  r.catalog ? playerKey(r.catalog) : playerKey({ firstName: "", lastName: r.rawName, nbaTeam: null });

export interface ImportPayload {
  year: number;
  players: { ref: string; first_name: string; last_name: string; pos: string | null; nba_team: string | null; dunkest_credits: number | null }[];
  contracts: Record<string, unknown>[];
  cuts: Record<string, unknown>[];
  talents: Record<string, unknown>[];
  picks: Record<string, unknown>[];
  rookie_draft: Record<string, unknown>[];
  last_contracts: Record<string, unknown>[];
  team_season: Record<string, unknown>[];
}

export function buildImportPayload(d: ImportData, year: number): ImportPayload {
  // giocatori: listone + chi è in rosa e viene dallo snapshot Dunkest + provvisori per i nomi non trovati
  const players = new Map<string, ImportPayload["players"][number]>();
  const add = (ref: string, p: ImportPayload["players"][number]) => {
    if (!players.has(ref)) players.set(ref, p);
  };
  for (const p of d.catalog) {
    add(playerKey(p), { ref: playerKey(p), first_name: p.firstName, last_name: p.lastName, pos: p.pos, nba_team: p.nbaTeam, dunkest_credits: p.credits });
  }
  const refs = [...d.contracts.map((c) => c.player), ...d.cuts.map((c) => c.player), ...d.lastContracts.map((c) => c.player)];
  for (const r of refs) {
    const ref = refKey(r);
    if (r.catalog) {
      add(ref, { ref, first_name: r.catalog.firstName, last_name: r.catalog.lastName, pos: r.pos, nba_team: r.catalog.nbaTeam, dunkest_credits: null });
    } else {
      add(ref, { ref, first_name: "", last_name: r.rawName, pos: r.pos, nba_team: null, dunkest_credits: null });
    }
  }

  return {
    year,
    players: [...players.values()],
    contracts: d.contracts.map((c) => ({
      team: c.team,
      player: refKey(c.player),
      slot: c.slot,
      years_left: c.years,
      team_option: c.teamOption,
      salary: c.salary,
      restriction: c.restriction,
      is_rookie: c.rookie,
    })),
    cuts: d.cuts.map((c) => ({ team: c.team, player: refKey(c.player), paid_salary: c.paidSalary, years_left: c.years })),
    talents: d.talents.map((t) => ({ team: t.team, display_name: t.displayName, draft_year: t.draftYear, entry_credits: t.credits, notes: t.notes })),
    picks: d.picks.map((p) => ({
      year: p.year,
      round: p.round,
      original: p.original,
      current: p.current,
      to_confirm: p.toConfirm,
      note: p.current !== p.original ? p.rawStatus : null,
    })),
    rookie_draft: d.rookieDraft.map((r) => ({
      pick_no: r.pickNo,
      team: r.team,
      note: [`${r.firstName} ${r.lastName} (${r.nbaTeam})`, r.note].filter(Boolean).join(" - "),
    })),
    last_contracts: d.lastContracts.map((l) => ({ player: refKey(l.player), team: l.team, salary: l.salary, date: l.date })),
    team_season: d.stats.map((s) => ({ team: s.team, bonus: s.bonus, entry_fee_paid: s.quotaPagata })),
  };
}

// Controlli prima di toccare il database (oltre al report): errori che la RPC rifiuterebbe comunque, ma meglio saperlo subito.
export function payloadErrors(p: ImportPayload): string[] {
  const errors: string[] = [];
  const known = new Set(p.players.map((x) => x.ref));
  for (const [what, rows] of [["contratti", p.contracts], ["tagli", p.cuts], ["ultimi contratti", p.last_contracts]] as const) {
    const missing = rows.filter((r) => !known.has(String(r.player)));
    if (missing.length) errors.push(`${what}: ${missing.length} giocatori senza riga in players`);
  }
  if (p.contracts.length === 0) errors.push("nessun contratto nel foglio: import annullato (cancellerebbe la stagione)");
  if (p.team_season.length === 0) errors.push("nessuna squadra nel foglio");
  const teams = new Set(p.team_season.map((t) => t.team));
  for (const [what, rows] of [["contratti", p.contracts], ["tagli", p.cuts], ["talenti", p.talents], ["rookie draft", p.rookie_draft]] as const) {
    const unknown = rows.filter((r) => !teams.has(r.team));
    if (unknown.length) errors.push(`${what}: ${unknown.length} righe con squadra non presente nelle statistiche`);
  }
  return errors;
}
