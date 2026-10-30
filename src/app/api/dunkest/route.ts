import { runDunkestGamesSync } from "@/lib/dunkest-games-sync";
import { runDunkestLeagueSync } from "@/lib/dunkest-league-sync";
import { runDunkestSync } from "@/lib/dunkest-sync";
import { createClient } from "@/lib/supabase/server";
import { announceTrades } from "@/lib/telegram";

/**
 * Cron giornaliero di Vercel (vercel.json, `0 8 * * *` UTC = 9:00 italiane in ora solare): aggiorna punteggio, partite giocate e
 * infortuni da Dunkest (issue #68), poi classifica, calendario e formazioni della lega (issue #72, con DUNKEST_TOKEN). Vercel
 * manda CRON_SECRET come Bearer; lo stesso valore, girato alle RPC, è il segreto del job (hash in `private.job_secrets`,
 * migrazione 20261027025827). Senza CRON_SECRET non parte: qui il segreto è obbligatorio.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET non impostato", { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorizzato", { status: 401 });
  }
  const db = await createClient();
  // Parti indipendenti: un token scaduto non ferma statistiche e infortuni.
  const stats = await runDunkestSync(db, secret);
  const league = await runDunkestLeagueSync(db, secret, process.env.DUNKEST_TOKEN);
  if (stats.ok) console.log(`[dunkest] ${stats.stats} statistiche, ${stats.injuries} infortuni, ${stats.links} nuovi collegamenti`);
  else console.error(`[dunkest] aggiornamento non riuscito: ${stats.error}`);
  if (league.ok) console.log(`[dunkest] lega: classifica ${league.standings}, scontri ${league.matches}, formazioni ${league.lineups}${league.report.full ? " (calendario completo)" : ""}`);
  else console.error(`[dunkest] lega non aggiornata (${league.code}): ${league.error}`);
  // Proposte di scambio oltre la scadenza (Fase 7.2): le RPC le trattano già come scadute, qui si marcano nel registro.
  // Non cambia l'esito del cron.
  const expired = await db.rpc("trade_proposals_expire", { p_secret: secret });
  if (expired.error) console.error(`[scambi] proposte scadute non marcate: ${expired.error.message}`);
  else if (expired.data) console.log(`[scambi] ${expired.data} proposte scadute`);
  // Scambi eseguiti non ancora annunciati su Telegram (Fase 7.5): di solito li manda l'action subito, qui si riprovano quelli
  // falliti. Non cambia l'esito del cron.
  const announced = await announceTrades(db, secret);
  if (!announced.skipped) {
    if (announced.sent) console.log(`[telegram] ${announced.sent} scambi annunciati`);
    if (announced.errors.length) console.error(`[telegram] ${announced.errors.join("; ")}`);
  }
  // Partite NBA per giorno e giornate fantasy: per ultime, perché il primo recupero è il giro più lungo e, se sfora i 60 secondi, deve
  // saltare solo questo passo (scadenze e Telegram sono già fatte). Dopo statistiche (giocatori collegati) e lega (giornata in corso).
  const games = await runDunkestGamesSync(db, secret);
  if (games.ok) console.log(`[dunkest] partite: ${games.days} giorni letti, ${games.games} partite, ${games.weeks} righe di giornata${games.skipped.length ? `; da riprovare: ${games.skipped.join("; ")}` : ""}`);
  else console.error(`[dunkest] partite non aggiornate: ${games.error}`);
  return Response.json({ stats, league, games }, { status: stats.ok && league.ok && games.ok ? 200 : 502 });
}
