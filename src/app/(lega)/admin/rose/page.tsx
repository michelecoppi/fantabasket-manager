import { PageTitle } from "@/components/ui";
import { loadLeague, loadSlotSwaps, loadSlotSwapWindow, loadVersions } from "@/lib/league-server";
import { evaluateSlotSwapItems, pendingSwaps, slotSwapLines } from "@/lib/slot-swap";
import { teamColors } from "@/lib/team-colors";
import { RoseDesk, type RoseTeam } from "./desk";
import { SlotSwapDesk, type QueuedSwap } from "./swaps";

export default async function AdminRosterPage() {
  const [league, versions, swaps, swapOpen] = await Promise.all([loadLeague(), loadVersions(), loadSlotSwaps(), loadSlotSwapWindow()]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  // Richieste di cambio titolari ↔ riserve (R-04), valutate sulla rosa di adesso come farà l'approvazione.
  const queue: QueuedSwap[] = [...pendingSwaps(swaps ?? [])]
    .reverse()
    .flatMap((r) => {
      const check = evaluateSlotSwapItems(league, r.teamId, r.items, versions);
      if (!check) return [];
      const { before, after } = check.ev.impact;
      return [
        {
          id: r.id,
          version: r.version,
          teamId: r.teamId,
          team: league.teamNames.get(r.teamId) ?? "?",
          color: colors.get(r.teamId) ?? "var(--muted)",
          createdAt: r.createdAt,
          ...slotSwapLines(league, r.teamId, r.items),
          stale: check.stale.length > 0,
          errors: check.ev.errors,
          warnings: check.ev.warnings,
          payroll: { before: before.payroll, after: after.payroll, overCap: after.overCap },
          reserveSpace: { before: before.reserveSpace, after: after.reserveSpace },
        },
      ];
    });
  const teams: RoseTeam[] = league.teams.map((t) => ({
    id: t.team.id,
    name: t.team.name,
    bonus: t.bonus,
    cuts: t.cuts.map((c) => ({
      id: c.id,
      version: versions.cuts[c.id] ?? 0,
      name: c.name,
      pos: c.pos,
      status: c.status,
      paid: c.paid,
      years: c.yearsLeft,
      teamOption: c.teamOption,
      originalSalary: c.originalSalary,
      originalSlot: c.originalSlot,
      originalIsRookie: c.originalIsRookie,
    })),
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
      <PageTitle icon="clipboard" eyebrow="Area admin" sub="Approva i cambi titolari/riserve chiesti dalle squadre (R-04), completa le durate, cambia titolare/riserva, taglia o rimuovi un contratto e chiudi i tagli dopo l'asta dei tagliati (R-41, R-42).">
        Rose e contratti
      </PageTitle>
      {swaps === null ? (
        <p className="mb-10 text-sm text-muted">Richieste di cambio titolari/riserve non disponibili al momento: aggiorna la pagina.</p>
      ) : (
        <SlotSwapDesk open={swapOpen} queue={queue} />
      )}
      <RoseDesk teams={teams} settings={league.settings} />
    </>
  );
}
