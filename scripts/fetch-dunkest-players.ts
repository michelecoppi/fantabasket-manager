// Uso: npx tsx scripts/fetch-dunkest-players.ts
// Scarica da Dunkest tutti i giocatori che hanno giocato in almeno una delle ultime stagioni e scrive
// scripts/data/dunkest-players.json (snapshot letto da import-xlsx per collegare i nomi delle rose). Vedi docs/IMPORT.md.
import { mkdirSync, writeFileSync } from "node:fs";

// season_id Dunkest, dalla più recente: 2026-27, 2025-26, 2024-25. Vince la stagione più recente.
const SEASONS = [29, 25, 19];
const POS = { G: "G", F: "A", C: "C" } as const; // Dunkest usa G/F/C, il foglio G/A/C
// il listone (Foglio3, quindi la colonna players.nba_team) scrive "Los Angeles Clippers"
const TEAM_NAMES: Record<string, string> = { "LA Clippers": "Los Angeles Clippers" };

interface ApiRow {
  id: string;
  first_name: string;
  last_name: string;
  team_name: string;
  position: keyof typeof POS;
}

async function fetchSeason(id: number): Promise<ApiRow[]> {
  const q =
    `season_id=${id}&mode=nba&stats_type=avg&date_from=2000-01-01&date_to=2100-01-01` +
    `&positions[]=1&positions[]=2&positions[]=3&player_search=&min_cr=0&max_cr=35&sort_by=pdk&sort_order=desc`;
  const res = await fetch(`https://www.dunkest.com/api/stats/table?${q}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Dunkest stagione ${id}: HTTP ${res.status}`);
  const rows = (await res.json()) as ApiRow[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Dunkest stagione ${id}: risposta vuota o inattesa`);
  return rows;
}

async function main() {
  const byId = new Map<string, { firstName: string; lastName: string; pos: string; nbaTeam: string; season: number }>();
  for (const season of SEASONS) {
    const rows = await fetchSeason(season);
    console.log(`stagione ${season}: ${rows.length} giocatori`);
    for (const r of rows) {
      if (byId.has(r.id)) continue; // già presente da una stagione più recente
      byId.set(r.id, { firstName: r.first_name, lastName: r.last_name, pos: POS[r.position], nbaTeam: TEAM_NAMES[r.team_name] ?? r.team_name, season });
    }
  }
  const players = [...byId.values()].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync("scripts/data/dunkest-players.json", JSON.stringify(players, null, 1) + "\n");
  console.log(`scritti ${players.length} giocatori in scripts/data/dunkest-players.json`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
