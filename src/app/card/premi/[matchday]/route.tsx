import { AwardsCardImage } from "@/components/card-premi";
import { matchdayAwards } from "@/lib/awards";
import { cardImage, cardParam, cardText } from "@/lib/card-response";
import { awardsCardModel } from "@/lib/cards";
import { loadLeague, loadLeagueDunkest, loadLineups } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

/** Card dei premi di una giornata (PNG 1200×630): /card/premi/4. Stessi premi di /classifica?vista=premi, dietro il login. */
export async function GET(request: Request, ctx: RouteContext<"/card/premi/[matchday]">) {
  const matchday = cardParam((await ctx.params).matchday);
  if (matchday < 1) return cardText("Giornata non valida.", 400);

  const [league, view] = await Promise.all([loadLeague(), loadLeagueDunkest()]);
  const day = view.matchdays.find((d) => d.matchday === matchday && d.state !== "upcoming");
  if (!day) return cardText("Questa giornata non ha ancora punti.", 404);

  const awards = matchdayAwards(day.matches, await loadLineups(day.matches.map((m) => m.id)));
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams = new Map(league.teams.map((t) => [t.team.id, { name: t.team.name, color: colors.get(t.team.id) ?? "#1d47b5" }]));
  const model = awardsCardModel({ matchday, provisional: day.state === "latest", awards, teams });
  if (!model) return cardText("Questa giornata non ha ancora premi.", 404);

  return cardImage((logo) => <AwardsCardImage model={model} logo={logo} />, request, `premi-giornata-${matchday}.png`);
}
