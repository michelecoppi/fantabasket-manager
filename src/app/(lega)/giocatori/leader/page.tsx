import Link from "next/link";
import { ChipLinks, ViewSwitch } from "@/components/chips";
import { DunkestSource } from "@/components/dunkest";
import { LeaderList, leaderOwners } from "@/components/leaders";
import { Empty, PageTitle, Scoreboard } from "@/components/ui";
import { fmt, fmtDay } from "@/lib/format";
import { loadDunkest, loadGameDays, loadLeague, loadLeagueDunkest, loadNightLeaders, loadProfile, loadWeekLeaders } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

const SHOWN = 25;

/**
 * Leader NBA come su Dunkest: i migliori della notte (un giorno di gioco, date americane) e della giornata fantasy (somma dei
 * round della settimana Dunkest, che per la lega è la giornata). Ogni riga dice anche chi ha il giocatore nella lega.
 * `?vista=giornata`, `?giorno=AAAA-MM-GG`, `?giornata=N`.
 */
export default async function LeadersPage(props: PageProps<"/giocatori/leader">) {
  const sp = await props.searchParams;
  const view = sp.vista === "giornata" ? "week" : "night";
  const [league, profile, dunkest, days, leagueView] = await Promise.all([loadLeague(), loadProfile(), loadDunkest(), loadGameDays(), loadLeagueDunkest()]);

  const colors = teamColors(league.teams.map((t) => t.team.id));
  const owners = leaderOwners(league.teams, colors);

  const date = days.find((d) => d.date === sp.giorno)?.date ?? days[0]?.date ?? null;
  const weeks = leagueView.matchdays.filter((d) => d.state !== "upcoming").map((d) => d.matchday);
  const week = weeks.find((w) => String(w) === sp.giornata) ?? leagueView.latest;
  const rows = view === "night" ? (date ? await loadNightLeaders(date, SHOWN) : []) : week !== null ? await loadWeekLeaders(week, SHOWN) : [];

  const href = (q: Record<string, string>) => `/giocatori/leader?${new URLSearchParams(q)}`;
  const top = rows[0];

  return (
    <>
      <PageTitle
        icon="trending-up"
        eyebrow="NBA · Dunkest"
        sub="I migliori per punteggio Dunkest, con la squadra della lega che li ha in rosa. Le date sono quelle americane: la notte italiana del 30 è il 29."
        aside={top && <Scoreboard items={[{ label: "Migliore", value: fmt(top.pdk), tone: "gold" }, { label: top.name, value: top.teamCode }]} />}
      >
        Leader
      </PageTitle>

      <div className="mb-5">
        <ViewSwitch
          label="Vista"
          options={[
            { href: "/giocatori", label: "Listone", hint: "tutti i giocatori, filtri e crediti", icon: "jersey", active: false },
            { href: "/giocatori?vista=affari", label: "Affari e flop", hint: "stipendio contro rendimento", icon: "trending-up", active: false },
            { href: "/giocatori/leader", label: "Leader", hint: "migliori della notte e della giornata", icon: "flame", active: true },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <ChipLinks
          label="Classifica"
          options={[
            { href: "/giocatori/leader", label: "Della notte", active: view === "night" },
            { href: href({ vista: "giornata" }), label: "Della giornata", active: view === "week" },
          ]}
        />
        {view === "night" ? (
          <ChipLinks label="Giorno" options={days.map((d) => ({ href: href({ giorno: d.date }), label: fmtDay(d.date), active: d.date === date, count: d.players }))} />
        ) : (
          <ChipLinks label="Giornata" options={[...weeks].reverse().map((w) => ({ href: href({ vista: "giornata", giornata: String(w) }), label: `G${w}`, active: w === week }))} />
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title={view === "night" ? "Nessuna partita letta" : "Giornata non ancora letta"} icon="chart">
          {view === "night"
            ? "I dati arrivano dal job delle 9: dopo il primo aggiornamento qui compaiono i migliori dell'ultima notte."
            : "I totali della giornata arrivano dal job delle 9, insieme alle partite."}
        </Empty>
      ) : (
        <LeaderList rows={rows} owners={owners} myTeamId={profile?.team_id ?? null} kind={view} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DunkestSource dunkest={dunkest} />
        <span className="text-xs text-muted">
          {view === "night" && date ? `Notte del ${fmtDay(date)}` : view === "week" && week !== null ? `Giornata ${week} della lega, somma dei round` : ""} · aggiornati ogni mattina
          {" · "}
          <Link href="/giocatori" className="font-semibold text-brand-blue hover:underline">
            torna al listone
          </Link>
        </span>
      </div>
    </>
  );
}
