import { PageTitle } from "@/components/ui";
import { pickYearAllowed } from "@/lib/cap";
import { loadLeague, loadVersions } from "@/lib/league-server";
import { PickDesk, type DeskPick } from "./desk";

export default async function AdminPickPage() {
  const [league, versions] = await Promise.all([loadLeague(), loadVersions()]);
  const picks: DeskPick[] = league.picks.map((p) => ({
    id: p.id,
    version: versions.picks[p.id] ?? 0,
    year: p.year,
    round: p.round,
    originalTeamId: p.original_team_id,
    currentTeamId: p.current_team_id,
    toConfirm: p.to_confirm,
    note: p.note ?? "",
  }));
  const existing = new Set(picks.map((p) => p.year));
  const { seasonYear, settings } = league;
  const openable = Array.from({ length: settings.pickHorizonYears }, (_, i) => seasonYear + 1 + i).filter((y) => !existing.has(y) && pickYearAllowed(y, seasonYear, settings));
  return (
    <>
      <PageTitle sub="Correggi il proprietario delle pick o chiudi i dubbi «da confermare». Si possono possedere solo le pick dei prossimi draft (R-34); ogni squadra ne tiene al massimo 2 per giro (R-33, avviso).">
        Gestione pick
      </PageTitle>
      <PickDesk
        picks={picks}
        teams={league.teams.map((t) => ({ id: t.team.id, name: t.team.name }))}
        seasonYear={seasonYear}
        openable={openable}
        horizon={league.settings.pickHorizonYears}
        rounds={league.settings.draftRounds}
        maxPerRound={league.settings.maxPicksPerRound}
      />
    </>
  );
}
