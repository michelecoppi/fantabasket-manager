import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { Empty, PageTitle, Section } from "@/components/ui";
import { loadLeague } from "@/lib/league-server";
import { playerName } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { teamColors } from "@/lib/team-colors";
import { parseTrade, type TradeItem, type TradeSide } from "@/lib/trades";

const PAGE_SIZE = 20;
const when = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Rome" });
const STATUS: Record<string, string> = { proposed: "Proposto", approved: "Approvato", rejected: "Respinto" };

interface TradeRow {
  id: number;
  created_at: string;
  status: string;
  payload: unknown;
  approved_by: string | null;
  cap_override_reason: string | null;
}

export default async function TradeHistoryPage({ searchParams }: PageProps<"/storico-scambi">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(1, Number.parseInt(raw ?? "", 10) || 1);

  const league = await loadLeague();
  const db = await createClient();
  const { data, count, error } = await db
    .from("trades")
    .select("id,created_at,status,payload,approved_by,cap_override_reason", { count: "exact" })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as TradeRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const trades = rows.map((r) => ({ row: r, view: parseTrade(r.payload) }));

  // Gli scambi vecchi hanno solo gli id: i nomi si recuperano dai contratti, se esistono ancora.
  const missing = [...new Set(trades.flatMap(({ view }) => [view.aGives, view.bGives].flatMap((s) => s.contracts.filter((c) => !c.label).map((c) => c.id))))];
  const names = new Map<number, string>();
  if (missing.length) {
    const r = await db.from("contracts").select("id,players(first_name,last_name,pos,nba_team)").in("id", missing);
    for (const c of (r.data ?? []) as unknown as { id: number; players: Parameters<typeof playerName>[0] }[]) names.set(c.id, playerName(c.players));
  }
  const pickLabel = (id: number) => {
    const p = league.picks.find((x) => x.id === id);
    return p ? `Draft ${p.year} · ${p.round}° giro (${league.teamNames.get(p.original_team_id) ?? "?"})` : undefined;
  };
  const itemsOf = (s: TradeSide): string[] => [
    ...s.contracts.map((c: TradeItem) => {
      const name = c.label ?? names.get(c.id) ?? "Giocatore non più in archivio";
      return c.slot ? `${name} (arriva come ${c.slot === "starter" ? "titolare" : "riserva"})` : name;
    }),
    ...s.picks.map((p: TradeItem) => p.label ?? pickLabel(p.id) ?? "Pick non più in archivio"),
  ];

  const colors = teamColors(league.teams.map((t) => t.team.id));
  const team = (id: string | null) => {
    const name = id ? league.teamNames.get(id) : undefined;
    return { name: name ?? "Squadra sconosciuta", color: (id && colors.get(id)) || "#555" };
  };
  const href = (p: number) => (p > 1 ? `/storico-scambi?page=${p}` : "/storico-scambi");

  return (
    <>
      <PageTitle icon="swap" eyebrow="Mercato" sub="Gli scambi registrati dagli admin, dal più recente. Sola lettura.">
        Storico scambi
      </PageTitle>

      {error ? (
        <p className="text-sm text-muted">Storico non disponibile: {error.message}</p>
      ) : trades.length === 0 ? (
        <Empty title="Nessuno scambio registrato" icon="swap">
          Gli scambi compariranno qui appena un admin li registra.
        </Empty>
      ) : (
        <Section title="Scambi" icon="swap" aside={`${count ?? trades.length} in archivio`}>
          <ul className="space-y-3">
            {trades.map(({ row, view }) => {
              const a = team(view.teamA);
              const b = team(view.teamB);
              return (
                <li key={row.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <time dateTime={row.created_at} className="eyebrow text-muted">
                      {when.format(new Date(row.created_at))}
                    </time>
                    {row.status !== "approved" && <span className="text-xs font-semibold text-warning">{STATUS[row.status] ?? row.status}</span>}
                  </div>
                  {view.complete ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[
                        { t: a, other: b, gives: view.aGives, id: view.teamA },
                        { t: b, other: a, gives: view.bGives, id: view.teamB },
                      ].map(({ t, other, gives, id }) => {
                        const items = itemsOf(gives);
                        return (
                          <div key={id} className="min-w-0">
                            <Link href={id ? `/squadre/${id}` : "#"} className="flex min-h-11 items-center gap-2 font-semibold hover:underline">
                              <TeamCrest name={t.name} color={t.color} size="xs" />
                              <span className="truncate">{t.name}</span>
                              <span className="text-xs font-normal text-muted">cede a {other.name}</span>
                            </Link>
                            {items.length ? (
                              <ul className="mt-1 list-inside list-disc text-sm">
                                {items.map((it, i) => (
                                  <li key={i}>{it}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-sm text-muted">Niente</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Dettagli non disponibili: scambio importato o registrato senza elenco di giocatori e pick.</p>
                  )}
                  {(row.approved_by || row.cap_override_reason) && (
                    <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
                      {row.approved_by && <>Approvato da {row.approved_by}. </>}
                      {row.cap_override_reason && <>Eccezione cap: {row.cap_override_reason}</>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? <Link className="font-semibold text-brand-blue" href={href(page - 1)}>← Più recenti</Link> : <span />}
              <span className="text-muted">Pagina {page} di {pages}</span>
              {page < pages ? <Link className="font-semibold text-brand-blue" href={href(page + 1)}>Più vecchi →</Link> : <span />}
            </div>
          )}
        </Section>
      )}
    </>
  );
}
