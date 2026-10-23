// Riepilogo di verifica dell'import: confronta quanto letto con i totali scritti nel foglio.
import { DEFAULT_SETTINGS, rosterWarnings, teamFinance } from "../../src/lib/cap";
import type { ImportData, PlayerRef } from "./parse";
import { SHEET_TEAM_ORDER, lettersOnly } from "./names";

const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

/**
 * Nomi dei giocatori che compaiono in più contratti. L'import li collegherebbe allo stesso `players.id`
 * (stessa chiave di import-xlsx.ts) e violerebbe unique (season_id, player_id), migrazione 0003.
 */
export function duplicateContractPlayers(contracts: { player: PlayerRef }[]): string[] {
  const byKey = new Map<string, string[]>();
  for (const { player: r } of contracts) {
    const c = r.catalog;
    const key = c
      ? `${lettersOnly(c.firstName)}|${lettersOnly(c.lastName)}|${lettersOnly(c.nbaTeam ?? "")}`
      : `|${lettersOnly(r.rawName)}|`;
    byKey.set(key, [...(byKey.get(key) ?? []), r.rawName]);
  }
  return [...byKey.values()].filter((names) => names.length > 1).map((names) => names[0]);
}

// season_id Dunkest → stagione. Per chi non ha ancora giocato nel 2026-27 la squadra NBA è quella dell'ultima stagione giocata.
const SEASON_LABEL: Record<number, string> = { 29: "2026-27", 25: "2025-26", 19: "2024-25" };
function describe(r: PlayerRef): string {
  const c = r.catalog;
  const stale = c?.season && c.season !== 29 ? `, squadra del ${SEASON_LABEL[c.season] ?? c.season}` : "";
  return `${c?.firstName} ${c?.lastName} (${c?.nbaTeam}, ${c?.pos ?? "?"}${stale})`;
}

export function buildReport(d: ImportData): { text: string; problems: number } {
  const lines: string[] = [];
  let problems = d.warnings.length;
  const p = (s = "") => lines.push(s);

  p("== Letto dal foglio ==");
  p(
    `giocatori listone ${d.catalog.length} · contratti ${d.contracts.length} (titolari ${count(d.contracts, (c) => c.slot === "starter")}, riserve ${count(d.contracts, (c) => c.slot === "reserve")})`,
  );
  const noYears = d.contracts.filter((c) => c.years === null);
  if (noYears.length) p(`senza durata (da fissare): ${noYears.length}: ${noYears.map((c) => c.player.rawName).join(", ")}`);
  p(`tagliati ${d.cuts.length} · talenti ${d.talents.length} · pick ${d.picks.length} · rookie draft ${d.rookieDraft.length} · ultimi contratti ${d.lastContracts.length}`);

  p("\n== Quadratura con i totali del foglio (monte ingaggi, spazio salariale, spazio riserve) ==");
  for (const st of d.stats) {
    const roster = d.contracts.filter((c) => c.team === st.team).map((c) => ({ position: c.role, slot: c.slot, salary: c.salary }));
    const cuts = d.cuts.filter((c) => c.team === st.team).map((c) => ({ salary: c.paidSalary }));
    const f = teamFinance(roster, cuts, st.bonus, DEFAULT_SETTINGS);
    // cella senza risultato in cache (formula mai ricalcolata, es. Assago "80-SUM(D18:D23)"): non confrontabile
    const same = (mine: number, sheet: number) => Number.isNaN(sheet) || mine === sheet;
    const ok = same(f.payroll, st.monte) && same(f.capSpace, st.spazio) && same(f.reserveSpace, st.spazioRiserve);
    if (!ok) problems++;
    p(
      `${ok ? "OK " : "KO "} ${st.team.padEnd(18)} monte ${f.payroll}/${st.monte}  spazio ${f.capSpace}/${st.spazio}  riserve ${f.reserveSpace}/${Number.isNaN(st.spazioRiserve) ? "n/d" : st.spazioRiserve}`,
    );
    for (const w of rosterWarnings(roster, DEFAULT_SETTINGS)) p(`      avviso rosa: ${w}`);
  }

  p("\n== Collegamento ai giocatori del listone ==");
  const refs: { where: string; ref: PlayerRef }[] = [
    ...d.contracts.map((c) => ({ where: `contratto ${c.team}`, ref: c.player })),
    ...d.cuts.map((c) => ({ where: `taglio ${c.team}`, ref: c.player })),
    ...d.lastContracts.map((c) => ({ where: `ultimo contratto ${c.team}`, ref: c.player })),
  ];
  const kinds = ["owner", "salary", "alias", "pool", "ambiguous", "none"] as const;
  p(kinds.map((k) => `${k}: ${count(refs, (r) => r.ref.match === k)}`).join(" · "));
  // `pool` = cognome unico nello snapshot Dunkest: da controllare a occhio (manca chi non ha giocato), vedi matchPlayer
  const pooled = refs.filter((r) => r.ref.match === "pool");
  if (pooled.length) {
    p("Collegati per cognome (da controllare):");
    for (const u of pooled) p(`  ${u.ref.rawName} → ${describe(u.ref)}  (${u.where})`);
  }
  const roleDiff = refs.filter((r) => (r.ref.match === "pool" || r.ref.match === "alias") && r.ref.catalog?.pos && r.ref.pos !== r.ref.catalog.pos);
  if (roleDiff.length) {
    p("Ruolo del foglio diverso da Dunkest (resta quello del foglio):");
    for (const u of roleDiff) p(`  ${u.ref.rawName}: foglio ${u.ref.pos}, Dunkest ${u.ref.catalog?.pos}  (${u.where})`);
  }
  const unmatched = refs.filter((r) => r.ref.match === "none" || r.ref.match === "ambiguous");
  if (unmatched.length) {
    p("Da verificare (verranno creati come giocatori provvisori):");
    for (const u of unmatched) p(`  [${u.ref.match}] ${u.ref.rawName}  (${u.where})`);
  }
  const dups = duplicateContractPlayers(d.contracts);
  if (dups.length) {
    problems += dups.length;
    p("Giocatori con più di un contratto (stesso giocatore nel database, violerebbe unique (season_id, player_id)):");
    for (const n of dups) p(`  ${n}`);
  }

  p("\n== Pick ==");
  const swapped = d.picks.filter((x) => x.current && x.current !== x.original);
  p(`ruotate: ${swapped.length}`);
  for (const s of swapped) p(`  ${s.year} giro ${s.round}: ${s.original} → ${s.current}  (${s.rawStatus})`);
  const toConfirm = d.picks.filter((x) => x.toConfirm);
  if (toConfirm.length) {
    p("Da confermare (importate con to_confirm = true):");
    for (const u of toConfirm) p(`  ${u.year} giro ${u.round} di ${u.original}: ${u.current ?? "proprietario sconosciuto"}  (foglio: ${u.rawStatus})`);
  }
  const unknown = d.picks.filter((x) => !x.current && !x.toConfirm);
  if (unknown.length) {
    problems += unknown.length;
    p("Alias squadra non riconosciuti:");
    for (const u of unknown) p(`  ${u.year} giro ${u.round} di ${u.original}: "${u.rawStatus}"`);
  }

  // controllo incrociato 2026: proprietari per giro secondo Foglio1 vs ordine del rookie draft (Foglio2)
  p("\n== Controllo incrociato draft 2026 (Foglio1 pick ↔ Foglio2 ordine) ==");
  const draftPicksLeft = d.picks.some((x) => x.year === 2026);
  if (!draftPicksLeft) p("saltato: Foglio1 non ha più pick 2026 (draft già fatto)");
  for (let round = 1; draftPicksLeft && round <= 5; round++) {
    const fromPicks = d.picks.filter((x) => x.year === 2026 && x.round === round).map((x) => x.current ?? `?${x.rawStatus}`).sort();
    const fromDraft = d.rookieDraft.slice((round - 1) * 8, round * 8).map((x) => x.team).sort();
    const same = fromPicks.join("|") === fromDraft.join("|");
    const pending = d.picks.some((x) => x.year === 2026 && x.round === round && x.toConfirm);
    if (!same && !pending) problems++;
    p(`giro ${round}: ${same ? "coincide" : pending ? "diverso, ma include pick da confermare" : "DIVERSO"}`);
    if (!same) {
      p(`   Foglio1: ${fromPicks.join(", ")}`);
      p(`   Foglio2: ${fromDraft.join(", ")}`);
    }
  }

  if (d.warnings.length) {
    p("\n== Avvisi di lettura ==");
    for (const w of d.warnings) p(`  ${w}`);
  }
  p(`\nTeam in ordine: ${SHEET_TEAM_ORDER.join(", ")}`);
  return { text: lines.join("\n"), problems };
}
