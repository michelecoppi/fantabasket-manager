// Uso:
//   npx tsx scripts/import-xlsx.ts                 → solo report, non tocca il database
//   npx tsx --env-file=.env.local scripts/import-xlsx.ts --apply   → scrive su Supabase (cancella e riscrive i dati importati)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbook, type CatalogPlayer, type ImportData, type PlayerRef, type PoolPlayer } from "./lib/parse";
import { buildReport } from "./lib/report";
import { lettersOnly } from "./lib/names";

const file = process.argv.find((a) => a.endsWith(".xlsx")) ?? "Dunkest.xlsx";
const apply = process.argv.includes("--apply");
const season = 2026;

async function main() {
  const pool = JSON.parse(readFileSync("scripts/data/dunkest-players.json", "utf8")) as PoolPlayer[];
  const data = await parseWorkbook(file, pool);
  const { text, problems } = buildReport(data);
  console.log(text);
  console.log(`\nProblemi rilevati: ${problems}`);
  if (!apply) {
    console.log("Modalità report: nessuna scrittura. Usa --apply per importare.");
    return;
  }
  if (problems > 0 && !process.argv.includes("--force")) {
    console.error("Ci sono problemi: correggili (o usa --force sapendo cosa stai facendo). Import annullato.");
    process.exit(1);
  }
  await write(data);
}

const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

async function write(d: ImportData) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(new URL(url).origin, key, { auth: { persistSession: false } });

  const teams = must(await db.from("teams").select("id,name"), "teams");
  const teamId = new Map(teams.map((t) => [t.name as string, t.id as string]));
  const seasonRow = must(await db.from("seasons").select("id").eq("year", season).maybeSingle<{ id: number }>(), "season");
  if (!seasonRow) throw new Error(`Stagione ${season} non trovata: esegui seed.sql`);
  const seasonId = seasonRow.id;

  // svuota i dati importati (ordine: prima chi dipende da players)
  for (const t of ["contracts", "cuts", "talents", "last_contracts", "draft_picks", "rookie_draft", "team_season"]) {
    must(await db.from(t).delete().not(t === "rookie_draft" || t === "team_season" ? "season_id" : "id", "is", null), `delete ${t}`);
  }
  must(await db.from("players").delete().not("id", "is", null), "delete players");

  // giocatori: listone + provvisori per i nomi non trovati
  const key1 = (p: { firstName: string; lastName: string; nbaTeam: string | null }) =>
    `${lettersOnly(p.firstName)}|${lettersOnly(p.lastName)}|${lettersOnly(p.nbaTeam ?? "")}`;
  const rows = d.catalog.map((p) => ({
    first_name: p.firstName,
    last_name: p.lastName,
    pos: p.pos,
    nba_team: p.nbaTeam,
    dunkest_credits: p.credits,
  }));
  const placeholders = new Map<string, PlayerRef>();
  const allRefs = [
    ...d.contracts.map((c) => c.player),
    ...d.cuts.map((c) => c.player),
    ...d.lastContracts.map((c) => c.player),
  ];
  for (const r of allRefs) if (!r.catalog && !placeholders.has(r.rawName)) placeholders.set(r.rawName, r);
  // giocatori in rosa trovati nello snapshot Dunkest (non nel listone): nome, squadra NBA, ruolo del foglio
  const known = new Set(d.catalog.map(key1));
  for (const r of allRefs) {
    if (!r.catalog || known.has(key1(r.catalog))) continue;
    known.add(key1(r.catalog));
    rows.push({ first_name: r.catalog.firstName, last_name: r.catalog.lastName, pos: r.pos, nba_team: r.catalog.nbaTeam, dunkest_credits: null });
  }
  for (const [name, r] of placeholders) rows.push({ first_name: "", last_name: name, pos: r.pos, nba_team: null, dunkest_credits: null });

  const ids = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 400) {
    const inserted = must(await db.from("players").insert(rows.slice(i, i + 400)).select("id,first_name,last_name,nba_team"), "insert players");
    for (const p of inserted) {
      ids.set(key1({ firstName: p.first_name, lastName: p.last_name, nbaTeam: p.nba_team }), p.id as number);
    }
  }
  const playerId = (r: PlayerRef): number => {
    const c: CatalogPlayer | null = r.catalog;
    const id = c ? ids.get(key1(c)) : ids.get(key1({ firstName: "", lastName: r.rawName, nbaTeam: null }));
    if (!id) throw new Error(`Giocatore non trovato dopo l'insert: ${r.rawName}`);
    return id;
  };
  const tid = (n: string) => {
    const id = teamId.get(n);
    if (!id) throw new Error(`Squadra sconosciuta: ${n}`);
    return id;
  };

  must(
    await db.from("contracts").insert(
      d.contracts.map((c) => ({
        season_id: seasonId,
        team_id: tid(c.team),
        player_id: playerId(c.player),
        slot: c.slot,
        years_left: c.years,
        team_option: c.teamOption,
        salary: c.salary,
        restriction: c.restriction,
        is_rookie: c.rookie,
      })),
    ),
    "insert contracts",
  );
  if (d.cuts.length)
    must(
      await db.from("cuts").insert(
        d.cuts.map((c) => ({
          season_id: seasonId,
          team_id: tid(c.team),
          player_id: playerId(c.player),
          paid_salary: c.paidSalary,
          years_left: c.years,
        })),
      ),
      "insert cuts",
    );
  if (d.talents.length)
    must(
      await db.from("talents").insert(
        d.talents.map((t) => ({
          team_id: tid(t.team),
          display_name: t.displayName,
          draft_year: t.draftYear,
          entry_credits: t.credits,
          notes: t.notes,
        })),
      ),
      "insert talents",
    );
  must(
    await db.from("draft_picks").insert(
      d.picks.map((p) => ({
        year: p.year,
        round: p.round,
        original_team_id: tid(p.original),
        current_team_id: p.current ? tid(p.current) : null,
        to_confirm: p.toConfirm,
        note: p.current !== p.original ? p.rawStatus : null,
      })),
    ),
    "insert draft_picks",
  );
  must(
    await db.from("rookie_draft").insert(
      d.rookieDraft.map((r) => ({
        season_id: seasonId,
        pick_no: r.pickNo,
        team_id: tid(r.team),
        note: [`${r.firstName} ${r.lastName} (${r.nbaTeam})`, r.note].filter(Boolean).join(" - "),
      })),
    ),
    "insert rookie_draft",
  );
  if (d.lastContracts.length)
    must(
      await db.from("last_contracts").insert(
        d.lastContracts.map((l) => ({
          player_id: playerId(l.player),
          team_id: tid(l.team),
          salary: l.salary,
          last_contract_on: l.date,
        })),
      ),
      "insert last_contracts",
    );
  must(
    await db.from("team_season").insert(
      d.stats.map((s) => ({
        season_id: seasonId,
        team_id: tid(s.team),
        bonus: s.bonus,
        entry_fee_paid: s.quotaPagata,
      })),
    ),
    "insert team_season",
  );
  console.log("Import completato.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
