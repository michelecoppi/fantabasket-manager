import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { fmt, POS_LABEL } from "@/lib/format";
import { loadLeague, loadPlayers } from "@/lib/league-server";
import { filterPlayers, parseFilters } from "@/lib/players";

const MAX_ROWS = 100;
const control = "w-full rounded border border-line bg-surface px-3 py-2 text-base";

export default async function PlayersPage(props: PageProps<"/giocatori">) {
  const filters = parseFilters(await props.searchParams);
  const [players, league] = await Promise.all([loadPlayers(), loadLeague()]);
  const nbaTeams = [...new Set(players.map((p) => p.nbaTeam).filter((t): t is string => !!t))].sort();
  const rows = filterPlayers(players, filters);
  const shown = rows.slice(0, MAX_ROWS);
  const free = players.filter((p) => !p.ownerTeamId).length;

  return (
    <>
      <PageTitle sub={`${players.length} giocatori nel listone Dunkest · ${free} liberi`}>Giocatori</PageTitle>

      <Card className="p-3">
        <form className="grid grid-cols-2 gap-2 sm:grid-cols-6" action="/giocatori">
          <input name="q" defaultValue={filters.q} placeholder="Cerca per nome" className={`${control} col-span-2`} />
          <select name="ruolo" defaultValue={filters.pos} className={control} aria-label="Ruolo">
            <option value="">Tutti i ruoli</option>
            {(["G", "A", "C"] as const).map((p) => <option key={p} value={p}>{POS_LABEL[p]}</option>)}
          </select>
          <select name="nba" defaultValue={filters.nbaTeam} className={control} aria-label="Squadra NBA">
            <option value="">Tutte le NBA</option>
            {nbaTeams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select name="stato" defaultValue={filters.owner} className={control} aria-label="Stato">
            <option value="all">Liberi e occupati</option>
            <option value="free">Solo liberi</option>
            <option value="taken">Solo occupati</option>
          </select>
          <select name="ordina" defaultValue={filters.sort} className={control} aria-label="Ordina per">
            <option value="credits">Per crediti</option>
            <option value="name">Per nome</option>
          </select>
          <button className="font-display col-span-2 rounded bg-brand-red px-3 py-2 text-lg font-bold text-white sm:col-span-5">Filtra</button>
          <Link href="/giocatori" className="font-display col-span-2 rounded border border-line px-3 py-2 text-center text-lg font-bold sm:col-span-1">Azzera</Link>
        </form>
      </Card>

      <p className="mt-4 mb-2 text-sm text-muted">
        {rows.length} risultati{rows.length > MAX_ROWS && ` · mostrati i primi ${MAX_ROWS}, restringi i filtri`}
      </p>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nessun giocatore con questi filtri.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="font-display w-6 text-center text-xl font-bold text-brand-blue">{p.pos ?? "?"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted">{p.nbaTeam ?? "NBA n.d."}</span>
              </span>
              {p.ownerTeamId ? (
                <Link href={`/squadre/${p.ownerTeamId}`}>
                  <Badge tone="accent">{league.teamNames.get(p.ownerTeamId) ?? "?"}</Badge>
                </Link>
              ) : p.cutByTeamId ? (
                <Badge tone="warn" title={`Tagliato da ${league.teamNames.get(p.cutByTeamId) ?? "?"}`}>tagliato</Badge>
              ) : (
                <Badge tone="good">libero</Badge>
              )}
              <span className="font-display w-12 text-right text-2xl font-bold tabular-nums">{p.credits === null ? "–" : fmt(p.credits)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
