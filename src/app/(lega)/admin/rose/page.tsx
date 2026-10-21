import { PageTitle } from "@/components/ui";
import { loadLeague, loadVersions } from "@/lib/league-server";
import { RoseDesk, type RoseTeam } from "./desk";

export default async function AdminRosterPage() {
  const [league, versions] = await Promise.all([loadLeague(), loadVersions()]);
  const teams: RoseTeam[] = league.teams.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    bonus: t.bonus,
    cuts: t.cuts.map((c) => ({ name: c.name, paid: c.paid })),
    players: [...t.starters, ...t.reserves].map((p) => ({
      id: p.id,
      version: versions.contracts[p.id] ?? 0,
      name: p.name,
      pos: p.pos,
      slot: p.slot,
      salary: p.salary,
      years: p.yearsLeft,
      teamOption: p.teamOption,
      rookie: p.rookie,
      unrestricted: p.restriction === "unrestricted",
    })),
  }));
  return (
    <>
      <PageTitle sub="Completa la durata dei contratti, cambia titolare/riserva o taglia un giocatore (paga un terzo dello stipendio, R-42).">
        Rose e contratti
      </PageTitle>
      <RoseDesk teams={teams} settings={league.settings} />
    </>
  );
}
