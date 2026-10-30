import { ChipLinks, ViewSwitch } from "@/components/chips";
import { DunkestSource, PlayerSheet } from "@/components/dunkest";
import { teamIndex } from "@/components/dunkest-league";
import { PlayerListing } from "@/components/player-listing";
import { Empty, PageTitle, Scoreboard } from "@/components/ui";
import { ValueList } from "@/components/value-board";
import type { DunkestView } from "@/lib/dunkest";
import type { LeagueView } from "@/lib/league";
import { loadDunkest, loadLeague, loadPlayers } from "@/lib/league-server";
import { parseFilters, playerStatus } from "@/lib/players";
import { teamColors } from "@/lib/team-colors";
import { VALUE_MIN_GAMES, valueBoard, valueContracts } from "@/lib/value";

/**
 * Seconda vista (Fase 6.2, `?vista=affari`): affari e flop, cioè posizione per stipendio contro posizione per punteggio
 * Dunkest dei giocatori a contratto, con filtro per squadra (`?squadra=<id>`). Ogni riga apre la scheda del giocatore.
 */
function DealsView({ league, dunkest, teamFilter }: { league: LeagueView; dunkest: DunkestView; teamFilter: string | null }) {
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams = teamIndex(league.teams, colors);
  if (!dunkest.available) {
    return (
      <Empty title="Dati non disponibili" icon="chart">
        Servono i punteggi Dunkest, che in questo momento non si leggono.
      </Empty>
    );
  }
  // la classifica si calcola su tutta la lega; il filtro sceglie solo quali righe mostrare
  const all = valueBoard(valueContracts(league.teams), dunkest.stats, { size: Infinity });
  const keep = (r: { teamId: string }) => !teamFilter || r.teamId === teamFilter;
  const deals = all.deals.filter(keep).slice(0, 10);
  const flops = all.flops.filter(keep).slice(0, 10);
  const shown = [...deals, ...flops];
  const href = (id: string | null) => (id ? `/giocatori?vista=affari&squadra=${id}` : "/giocatori?vista=affari");
  return (
    <>
      <div className="mb-4">
        <ChipLinks
          label="Squadra"
          options={[
            { href: href(null), label: "Tutte", active: !teamFilter },
            ...[...league.teams]
              .sort((a, b) => a.team.name.localeCompare(b.team.name, "it"))
              .map((t) => ({ href: href(t.team.id), label: t.team.name, active: teamFilter === t.team.id })),
          ]}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ValueList kind="deal" rows={deals} pool={all.pool} teams={teams} dunkest={dunkest} />
        <ValueList kind="flop" rows={flops} pool={all.pool} teams={teams} dunkest={dunkest} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DunkestSource dunkest={dunkest} />
        <span className="text-xs text-muted">
          {all.pool} giocatori a contratto con almeno {VALUE_MIN_GAMES} partite, messi in fila per stipendio e per PDK medio. Tacca vuota = posizione per stipendio,
          tacca piena = posizione per rendimento. A pari valore la posizione è condivisa.
        </span>
      </div>
      {shown.map((r) => (
        <PlayerSheet
          key={r.playerId}
          player={{ playerId: r.playerId, name: r.name, pos: r.pos, nbaTeam: r.nbaTeam, owner: { name: teams.get(r.teamId)?.name ?? "?", color: colors.get(r.teamId) ?? "#555" } }}
          dunkest={dunkest}
        />
      ))}
    </>
  );
}

export default async function PlayersPage(props: PageProps<"/giocatori">) {
  const sp = await props.searchParams;
  const view = sp.vista === "affari" ? "deals" : "list";
  const parsed = parseFilters(sp);
  const [listed, league, dunkest] = await Promise.all([loadPlayers(), loadLeague(), loadDunkest()]);
  // chi ha la riga ma 0 partite non ha un punteggio: senza questo, dal minore finirebbe in cima
  const players = dunkest.available ? listed.map((p) => ({ ...p, pdk: (dunkest.stats.get(p.id)?.gp ?? 0) > 0 ? dunkest.stats.get(p.id)!.pdk : null })) : listed;
  const nbaTeams = [...new Set(players.map((p) => p.nbaTeam).filter((t): t is string => !!t))].sort();
  const count = { free: 0, cut: 0, restricted: 0, taken: 0, talent: 0 };
  for (const p of players) count[playerStatus(p)]++;
  const colors = teamColors(league.teams.map((t) => t.team.id));

  return (
    <>
      <PageTitle
        icon="jersey"
        eyebrow="Listone Dunkest"
        sub="Tutti i giocatori con crediti, squadra NBA e proprietario nella lega. Filtra per ruolo, squadra o stato."
        aside={
          <Scoreboard
            items={[
              { label: "Giocatori", value: players.length },
              { label: "Senza contratto", value: count.free + count.cut + count.restricted, tone: "gold" },
              { label: "Liberi", value: count.free },
              { label: "Tagliati", value: count.cut },
              { label: "Restricted", value: count.restricted },
              { label: "In rosa", value: count.taken },
              { label: "Talenti", value: count.talent },
            ]}
          />
        }
      >
        Giocatori
      </PageTitle>

      <div className="mb-5">
        <ViewSwitch
          label="Vista"
          options={[
            { href: "/giocatori", label: "Listone", hint: "tutti i giocatori, filtri e crediti", icon: "jersey", active: view === "list" },
            { href: "/giocatori?vista=affari", label: "Affari e flop", hint: "stipendio contro rendimento", icon: "trending-up", active: view === "deals" },
            { href: "/giocatori/leader", label: "Leader", hint: "migliori della notte e della giornata", icon: "flame", active: false },
          ]}
        />
      </div>

      {view === "deals" ? (
        <DealsView league={league} dunkest={dunkest} teamFilter={typeof sp.squadra === "string" && league.teamNames.has(sp.squadra) ? sp.squadra : null} />
      ) : (
        <PlayerListing players={players} nbaTeams={nbaTeams} dunkest={dunkest} teamNames={league.teamNames} colors={colors} initial={parsed} />
      )}
    </>
  );
}
