// Uso:
//   npx tsx scripts/import-xlsx.ts                 → solo report, non tocca il database
//   npx tsx --env-file=.env.local scripts/import-xlsx.ts --apply   → riscrive su Supabase la stagione indicata (default 2026; --season=AAAA), in una transazione sola
// Le altre stagioni non vengono toccate (vedi docs/IMPORT.md).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbook, type ImportData, type PoolPlayer } from "./lib/parse";
import { buildImportPayload, payloadErrors } from "./lib/payload";
import { buildReport } from "./lib/report";

const file = process.argv.find((a) => a.endsWith(".xlsx")) ?? "Dunkest.xlsx";
const apply = process.argv.includes("--apply");
const seasonArg = process.argv.find((a) => a.startsWith("--season="))?.slice("--season=".length);
const season = seasonArg ? Number(seasonArg) : 2026;
if (!Number.isInteger(season)) throw new Error(`--season non valido: ${seasonArg}`);

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

async function write(d: ImportData) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(new URL(url).origin, key, { auth: { persistSession: false } });

  const payload = buildImportPayload(d, season);
  const errors = payloadErrors(payload);
  if (errors.length) throw new Error(`Payload non valido, nessuna scrittura:\n- ${errors.join("\n- ")}`);

  // Una sola chiamata = una sola transazione (migrazione 20261026230000): se fallisce, il database resta com'era.
  const { data, error } = await db.rpc("import_replace_season", { p_payload: payload });
  if (error) throw new Error(`import_replace_season (nessuna modifica applicata): ${error.message}`);
  console.log(`Import della stagione ${season} completato:`, JSON.stringify(data));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
