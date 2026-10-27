import { runDunkestSync } from "@/lib/dunkest-sync";
import { createClient } from "@/lib/supabase/server";

/**
 * Cron giornaliero di Vercel (vercel.json, `0 8 * * *` UTC = 9:00 italiane in ora solare): aggiorna punteggio, partite giocate e
 * infortuni da Dunkest (issue #68). Vercel manda CRON_SECRET come Bearer; lo stesso valore, girato alle RPC, è il segreto del job
 * (hash in `private.job_secrets`, migrazione 20261027025827). Senza CRON_SECRET non parte: qui il segreto è obbligatorio.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET non impostato", { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorizzato", { status: 401 });
  }
  const db = await createClient();
  const result = await runDunkestSync(db, secret);
  if (!result.ok) {
    console.error(`[dunkest] aggiornamento non riuscito: ${result.error}`);
    return Response.json(result, { status: 502 });
  }
  console.log(`[dunkest] ${result.stats} statistiche, ${result.injuries} infortuni, ${result.links} nuovi collegamenti`);
  return Response.json(result);
}
