import { MvpCardImage } from "@/components/card-mvp";
import { cardImage, cardParam, cardText } from "@/lib/card-response";
import { mvpCardModel } from "@/lib/cards";
import { loadLeague, loadLeagueDunkest, loadLineups } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

/*
 * Card MVP di una giornata (PNG 1200×630) da condividere: /card/mvp/4, /card/mvp/4?scarica=1 per farla scaricare. Sta dietro
 * `proxy.ts` come le pagine (serve il login) e legge con la RLS dell'utente. Nessun dato nuovo: premi e formazioni sono
 * quelli di /classifica?vista=premi.
 */
export async function GET(request: Request, ctx: RouteContext<"/card/mvp/[matchday]">) {
  const matchday = cardParam((await ctx.params).matchday);
  if (matchday < 1) return cardText("Giornata non valida.", 400);

  const [league, view] = await Promise.all([loadLeague(), loadLeagueDunkest()]);
  const day = view.matchdays.find((d) => d.matchday === matchday && d.state !== "upcoming");
  if (!day) return cardText("Questa giornata non ha ancora punti.", 404);

  const lineups = await loadLineups(day.matches.map((m) => m.id));
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams = new Map(league.teams.map((t) => [t.team.id, { name: t.team.name, color: colors.get(t.team.id) ?? "#1d47b5" }]));
  const model = mvpCardModel({ matchday, provisional: day.state === "latest", matches: day.matches, lineups, teams });
  if (!model) return cardText("Nessun MVP: di questa giornata non ci sono formazioni salvate.", 404);

  return cardImage((logo) => <MvpCardImage model={model} logo={logo} />, request, `mvp-giornata-${matchday}.png`);
}
