import { PageTitle } from "@/components/ui";
import { loadLeague, loadPlayers } from "@/lib/league-server";
import { simTeams } from "@/lib/sim-teams";
import { SignDesk, type TalentOption } from "./desk";

export default async function AdminSignPage() {
  const [league, players] = await Promise.all([loadLeague(), loadPlayers()]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const talents: TalentOption[] = league.teams.flatMap((t) =>
    t.talents.map((x) => ({
      id: x.id,
      teamId: t.team.id,
      name: x.display_name,
      draftYear: x.draft_year,
      credits: x.entry_credits === null ? null : Number(x.entry_credits),
      player: x.player_id === null ? null : (byId.get(x.player_id) ?? null),
    })),
  );
  return (
    <>
      <PageTitle icon="pen" eyebrow="Area admin" sub="Un giocatore libero o un talento entra in una rosa. Sforare il cap o restare sotto i minimi di rosa è solo un avviso; superare i massimi di rosa o andare sotto il minimo d'asta (R-25) blocca la firma.">
        Firma un contratto
      </PageTitle>
      <SignDesk teams={simTeams(league)} free={players.filter((p) => !p.ownerTeamId && !p.talentTeamId)} talents={talents} settings={league.settings} />
    </>
  );
}
