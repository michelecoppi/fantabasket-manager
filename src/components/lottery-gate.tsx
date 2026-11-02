import { LotteryReveal, type LotteryData } from "@/components/draft-lottery";
import { lotteryBoard } from "@/lib/draft-lottery";
import { loadLeague, loadLottery } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

/** Dati della rivelazione e dell'ordine del sorteggio, con nomi, colori e proprietari attuali delle pick. */
export async function loadLotteryData(): Promise<{ data: LotteryData; seen: boolean } | null> {
  const lottery = await loadLottery().catch(() => null);
  if (!lottery) return null;
  const league = await loadLeague();
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const picks = league.picks.map((p) => ({ year: p.year, round: p.round, originalTeamId: p.original_team_id, currentTeamId: p.current_team_id }));
  return {
    seen: lottery.seen,
    data: {
      record: lottery.record,
      board: lotteryBoard(lottery.record, picks, league.settings.draftRounds),
      teams: league.teams.map((t) => ({ id: t.team.id, name: t.team.name, color: colors.get(t.team.id) ?? "#555" })),
      rounds: league.settings.draftRounds,
    },
  };
}

/** Nel layout: al primo accesso dopo l'estrazione la rivelazione si apre da sola, una volta per utente (issue #103). */
export async function LotteryGate() {
  const lottery = await loadLotteryData();
  if (!lottery || lottery.seen) return null;
  return <LotteryReveal data={lottery.data} auto />;
}
