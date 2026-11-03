import type { PlaygroundTeam, RosterPick } from "@/lib/auction-playground";
import { teamSide } from "@/lib/league";
import { loadDunkest, loadLeague, loadPlayers, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";
import { AuctionPlayground, type FreeAgentRow } from "./playground";

/**
 * Playground dell'asta (issue #104): sala d'asta con le squadre e il listone veri, avversari simulati, niente si salva.
 * Serve a far provare alla lega il funzionamento proposto (turni, rilanci, cronometro, tagliati e restricted) prima di costruire
 * l'asta vera in tempo reale.
 */
export default async function AuctionPage() {
  const [league, players, profile, dunkest] = await Promise.all([loadLeague(), loadPlayers(), loadProfile(), loadDunkest()]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const pdk = (id: number) => (dunkest.available ? (dunkest.stats.get(id)?.pdk ?? null) : null);

  const teams: PlaygroundTeam[] = league.teams.map((t) => ({ id: t.team.id, name: t.team.name, color: colors.get(t.team.id) ?? "#1d47b5", side: teamSide(t) }));
  const rostered: RosterPick[] = league.teams.flatMap((t) =>
    [...t.starters, ...t.reserves].map((p) => ({
      playerId: p.playerId,
      contractId: p.id,
      teamId: t.team.id,
      name: p.name,
      pos: p.pos,
      nbaTeam: p.nbaTeam,
      salary: p.salary,
      pdk: pdk(p.playerId),
    })),
  );
  // Liberi: nel listone con crediti, senza contratto né diritti da talento (R-35).
  const free: FreeAgentRow[] = players
    .filter((p) => p.credits !== null && p.credits > 0 && !p.ownerTeamId && !p.talentTeamId)
    .sort((a, b) => (b.credits ?? 0) - (a.credits ?? 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      pos: p.pos,
      nbaTeam: p.nbaTeam,
      credits: p.credits ?? 0,
      pdk: pdk(p.id),
      lastContract: p.lastContract,
      restrictedTeamId: p.restrictedTeamId,
    }));

  return <AuctionPlayground teams={teams} rostered={rostered} free={free} settings={league.settings} myTeamId={profile?.team_id ?? null} seasonYear={league.seasonYear} />;
}
