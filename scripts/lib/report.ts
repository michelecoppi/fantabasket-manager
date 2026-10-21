// Riepilogo di verifica dell'import: confronta quanto letto con i totali scritti nel foglio.
import { DEFAULT_SETTINGS, rosterWarnings, teamFinance } from "../../src/lib/cap";
import type { ImportData, PlayerRef } from "./parse";
import { SHEET_TEAM_ORDER } from "./names";

const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

export function buildReport(d: ImportData): { text: string; problems: number } {
  const lines: string[] = [];
  let problems = d.warnings.length;
  const p = (s = "") => lines.push(s);

  p("== Letto dal foglio ==");
  p(
    `giocatori listone ${d.catalog.length} · contratti ${d.contracts.length} (titolari ${count(d.contracts, (c) => c.slot === "starter")}, riserve ${count(d.contracts, (c) => c.slot === "reserve")})`,
  );
  p(`tagliati ${d.cuts.length} · talenti ${d.talents.length} · pick ${d.picks.length} · rookie draft ${d.rookieDraft.length} · ultimi contratti ${d.lastContracts.length}`);

  p("\n== Quadratura con i totali del foglio (monte ingaggi, spazio salariale, spazio riserve) ==");
  for (const st of d.stats) {
    const roster = d.contracts.filter((c) => c.team === st.team).map((c) => ({ position: c.role, slot: c.slot, salary: c.salary }));
    const cuts = d.cuts.filter((c) => c.team === st.team).map((c) => ({ salary: c.paidSalary }));
    const f = teamFinance(roster, cuts, st.bonus, DEFAULT_SETTINGS);
    const ok = f.payroll === st.monte && f.capSpace === st.spazio && f.reserveSpace === st.spazioRiserve;
    if (!ok) problems++;
    p(
      `${ok ? "OK " : "KO "} ${st.team.padEnd(18)} monte ${f.payroll}/${st.monte}  spazio ${f.capSpace}/${st.spazio}  riserve ${f.reserveSpace}/${st.spazioRiserve}`,
    );
    for (const w of rosterWarnings(roster, DEFAULT_SETTINGS)) p(`      avviso rosa: ${w}`);
  }

  p("\n== Collegamento ai giocatori del listone ==");
  const refs: { where: string; ref: PlayerRef }[] = [
    ...d.contracts.map((c) => ({ where: `contratto ${c.team}`, ref: c.player })),
    ...d.cuts.map((c) => ({ where: `taglio ${c.team}`, ref: c.player })),
    ...d.lastContracts.map((c) => ({ where: `ultimo contratto ${c.team}`, ref: c.player })),
  ];
  const kinds = ["owner", "unique", "salary", "ambiguous", "none"] as const;
  p(kinds.map((k) => `${k}: ${count(refs, (r) => r.ref.match === k)}`).join(" · "));
  const unmatched = refs.filter((r) => r.ref.match === "none" || r.ref.match === "ambiguous");
  if (unmatched.length) {
    p("Da verificare (verranno creati come giocatori provvisori):");
    for (const u of unmatched) p(`  [${u.ref.match}] ${u.ref.rawName}  (${u.where})`);
  }

  p("\n== Pick ==");
  const swapped = d.picks.filter((x) => x.current && x.current !== x.original);
  p(`ruotate: ${swapped.length}`);
  for (const s of swapped) p(`  ${s.year} giro ${s.round}: ${s.original} → ${s.current}  (${s.rawStatus})`);
  const unknown = d.picks.filter((x) => !x.current);
  if (unknown.length) {
    problems += unknown.length;
    p("Alias squadra non riconosciuti:");
    for (const u of unknown) p(`  ${u.year} giro ${u.round} di ${u.original}: "${u.rawStatus}"`);
  }

  // controllo incrociato 2026: proprietari per giro secondo Foglio1 vs ordine del rookie draft (Foglio2)
  p("\n== Controllo incrociato draft 2026 (Foglio1 pick ↔ Foglio2 ordine) ==");
  for (let round = 1; round <= 5; round++) {
    const fromPicks = d.picks.filter((x) => x.year === 2026 && x.round === round).map((x) => x.current ?? `?${x.rawStatus}`).sort();
    const fromDraft = d.rookieDraft.slice((round - 1) * 8, round * 8).map((x) => x.team).sort();
    const same = fromPicks.join("|") === fromDraft.join("|");
    if (!same) problems++;
    p(`giro ${round}: ${same ? "coincide" : "DIVERSO"}`);
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
