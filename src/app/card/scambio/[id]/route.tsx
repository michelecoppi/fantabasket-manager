import { TradeCardImage } from "@/components/card-scambio";
import { cardImage, cardParam, cardText } from "@/lib/card-response";
import { loadDunkest, loadLeague } from "@/lib/league-server";
import { createClient } from "@/lib/supabase/server";
import { teamColors } from "@/lib/team-colors";
import { tradeCardModel, type TradedPlayer } from "@/lib/trade-card";
import { parseTrade } from "@/lib/trades";

/**
 * Card di uno scambio eseguito (PNG 1200×630): /card/scambio/12, con l'id di `trades`. Dietro il login; solo gli scambi approvati
 * (le proposte restano private) e con il dettaglio (gli scambi importati dal foglio non l'hanno).
 */
export async function GET(request: Request, ctx: RouteContext<"/card/scambio/[id]">) {
  const id = cardParam((await ctx.params).id);
  if (id < 1) return cardText("Scambio non valido.", 400);

  const db = await createClient();
  const [league, dunkest, trades] = await Promise.all([
    loadLeague(),
    loadDunkest(),
    db.from("trades").select("id,created_at,status,payload,cap_override_reason").eq("status", "approved"),
  ]);
  if (trades.error) return cardText("Gli scambi non si leggono in questo momento.", 500);
  const rows = trades.data ?? [];
  const row = rows.find((r) => r.id === id);
  if (!row) return cardText("Scambio non trovato.", 404);

  // Scambi di ogni squadra (questo compreso): servono alle battute sulla squadra «seriale» e sul «primo scambio».
  const tradesPerTeam = new Map<string, number>();
  for (const r of rows) for (const t of parseTrade(r.payload).teams) tradesPerTeam.set(t, (tradesPerTeam.get(t) ?? 0) + 1);

  const colors = teamColors(league.teams.map((t) => t.team.id));
  const players = new Map<number, TradedPlayer>();
  for (const t of league.teams) {
    for (const p of [...t.starters, ...t.reserves]) {
      players.set(p.id, { playerId: p.playerId, name: p.name, pos: p.pos, salary: p.salary, yearsLeft: p.yearsLeft, rookie: p.rookie });
    }
  }
  const model = tradeCardModel({
    trade: { id: row.id, createdAt: row.created_at, capOverrideReason: row.cap_override_reason, view: parseTrade(row.payload) },
    teams: new Map(league.teams.map((t) => [t.team.id, { name: t.team.name, color: colors.get(t.team.id) ?? "#1d47b5" }])),
    tradesPerTeam,
    players,
    picks: new Map(league.picks.map((p) => [p.id, { year: p.year, round: p.round, originalTeamName: league.teamNames.get(p.original_team_id) ?? "?" }])),
    dunkest: { stats: (playerId) => dunkest.stats.get(playerId), injured: (playerId) => dunkest.injuries.has(playerId) },
  });
  if (!model) return cardText("Questo scambio non ha il dettaglio di giocatori e pick: non si può disegnare la card.", 404);

  return cardImage((logo) => <TradeCardImage model={model} logo={logo} />, request, `scambio-${id}.png`);
}
