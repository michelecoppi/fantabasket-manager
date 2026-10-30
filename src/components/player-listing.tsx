"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TeamCrest } from "@/components/crest";
import { DunkestSource, InjuryChip, PdkCell, PlayerSheet, SheetTrigger, sheetId } from "@/components/dunkest";
import { PlayerFiltersBar } from "@/components/player-filters";
import { Badge, Empty, PosChip, stagger } from "@/components/ui";
import type { DunkestView } from "@/lib/dunkest";
import { fmt } from "@/lib/format";
import { DEFAULT_OWNER, DEFAULT_SORT, filterPlayers, filtersHref, naturalDir, PAGE_SIZE, parseFilters, type PlayerFilters, type PlayerListItem } from "@/lib/players";

const URL_DELAY_MS = 300;
// quanto prima del fondo scatta il caricamento delle righe successive
const LOAD_AHEAD = "600px";
// Con i dati Dunkest c'è una colonna in più (PDK) prima dei crediti.
const cols = (withPdk: boolean) =>
  `md:grid md:items-center md:gap-4 ${withPdk ? "md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,11rem)_minmax(9rem,12rem)_3.5rem_4.5rem]" : "md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(8rem,11rem)_minmax(9rem,12rem)_4.5rem]"}`;

const queryOf = (href: string) => href.split("?")[1] ?? "";
const recordOf = (qs: string) => {
  const sp = new URLSearchParams(qs);
  return Object.fromEntries([...new Set(sp.keys())].map((k) => [k, sp.getAll(k)]));
};

/**
 * Listone con filtri e ordinamento fatti nel browser: la pagina porta già tutti i giocatori, quindi un cambio non chiama il server.
 * Mostra 50 righe e ne aggiunge altre 50 quando si arriva in fondo. L'URL segue i filtri (`replaceState`, senza ricarica)
 * per poter condividere o riaprire la vista; le righe già caricate non vi compaiono.
 */
export function PlayerListing({
  players,
  nbaTeams,
  dunkest,
  teamNames,
  colors,
  initial,
}: {
  players: PlayerListItem[];
  nbaTeams: string[];
  dunkest: DunkestView;
  teamNames: Map<string, string>;
  colors: Map<string, string>;
  initial: PlayerFilters;
}) {
  const withPdk = dunkest.available;
  // senza dati Dunkest l'opzione PDK non c'è: si ricade sui crediti
  const fix = (f: PlayerFilters): PlayerFilters => (f.sort === "pdk" && !withPdk ? { ...f, sort: "credits" } : f);
  const urlQs = useSearchParams().toString();
  const [v, setV] = useState(() => fix(initial));
  // query che questo componente ha scritto nell'URL e di cui non ha ancora visto la risposta, e ultima query vista
  const [written, setWritten] = useState<string[]>([]);
  const [seen, setSeen] = useState(urlQs);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);

  // L'URL cambia per altra via (link Listone o Giocatori nel menu): la vista lo segue. Le nostre scritture no, altrimenti
  // un'eco in ritardo riscriverebbe il campo mentre si sta ancora digitando.
  if (urlQs !== seen) {
    setSeen(urlQs);
    const i = written.indexOf(urlQs);
    if (i >= 0) setWritten(written.slice(i + 1));
    else {
      setV(fix(parseFilters(recordOf(urlQs))));
      setLimit(PAGE_SIZE);
    }
  }

  const rows = filterPlayers(players, v);
  const shown = rows.slice(0, limit);
  const rest = rows.length - shown.length;
  const injuredCount = players.filter((p) => dunkest.injuries.has(p.id)).length;

  const href = filtersHref(v);
  useEffect(() => {
    const qs = queryOf(href);
    if (qs === urlQs) return;
    const t = setTimeout(() => {
      window.history.replaceState(null, "", href);
      setWritten((w) => [...w, qs]);
    }, URL_DELAY_MS);
    return () => clearTimeout(t);
  }, [href, urlQs]);

  // Il segnaposto in fondo, quando si avvicina alla vista, chiede le righe successive; dopo ogni caricamento l'effetto riparte
  // e, se il segnaposto è ancora vicino, ne chiede altre.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || rest <= 0) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE_SIZE), { rootMargin: LOAD_AHEAD });
    io.observe(el);
    return () => io.disconnect();
  }, [rest]);

  const change = (next: PlayerFilters) => {
    setV(next);
    setLimit(PAGE_SIZE);
  };
  const reset = () => {
    const sort = withPdk ? DEFAULT_SORT : "credits";
    change({ q: "", pos: [], nbaTeam: "", owner: DEFAULT_OWNER, sort, dir: naturalDir(sort) });
  };
  const teamName = (id: string) => teamNames.get(id) ?? "?";

  return (
    <>
      <div className="z-10 rounded-2xl border border-line bg-surface/90 p-3 shadow-[0_12px_30px_-24px_rgb(6_10_20/0.6)] backdrop-blur-md md:sticky md:top-[4.5rem] md:shadow-[0_-0.5rem_0_0_var(--background),0_12px_30px_-24px_rgb(6_10_20/0.6)]">
        <PlayerFiltersBar value={v} nbaTeams={nbaTeams} withPdk={withPdk} onChange={change} onReset={reset} />
      </div>

      <div className="mt-5 mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-semibold text-muted">
          {rows.length} risultati
          {rest > 0 && ` · ne mostro ${shown.length}`}
          {injuredCount > 0 && ` · ${injuredCount} infortunati nel listone`}
        </p>
        <DunkestSource dunkest={dunkest} />
      </div>

      {shown.length === 0 ? (
        <Empty title="Nessun giocatore" icon="search">
          Nessun giocatore con questi filtri.
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className={`eyebrow hidden border-b border-line bg-surface-subtle/60 px-4 py-2 text-muted ${cols(withPdk)}`}>
            <span>#</span>
            <span>Giocatore</span>
            <span>NBA</span>
            <span>Stato</span>
            {withPdk && (
              <span className={`text-right ${v.sort === "pdk" ? "text-brand-blue" : ""}`} title="Punteggio Dunkest medio a partita">
                PDK
              </span>
            )}
            <span className={`text-right ${v.sort === "credits" ? "text-brand-blue" : ""}`}>Crediti</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((p, i) => (
              <li key={p.id} className={`rise relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 sm:px-4 ${cols(withPdk)}`} style={stagger(i)}>
                {withPdk && <SheetTrigger id={sheetId(p.id)} name={p.name} />}
                <span className="tnum hidden text-sm font-semibold text-muted md:block">{i + 1}</span>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <PosChip pos={p.pos} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold">{p.name}</span>
                      {dunkest.injuries.has(p.id) && <InjuryChip injury={dunkest.injuries.get(p.id)!} />}
                    </span>
                    <span className="block truncate text-xs text-muted md:hidden">
                      {p.nbaTeam ?? "NBA n.d."}
                      {!p.ownerTeamId && !p.cutByTeamId && p.restrictedTeamId && ` · può pareggiare ${teamName(p.restrictedTeamId)}`}
                    </span>
                    {!p.ownerTeamId && !p.cutByTeamId && p.restrictedTeamId && (
                      <span className="hidden truncate text-xs text-muted md:block">può pareggiare {teamName(p.restrictedTeamId)}</span>
                    )}
                  </span>
                </span>
                <span className="hidden truncate text-sm font-semibold text-muted md:block">{p.nbaTeam ?? "n.d."}</span>
                <span className="min-w-0 shrink-0">
                  {p.ownerTeamId ? (
                    <Link href={`/squadre/${p.ownerTeamId}`} className="relative z-[2] inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2 text-sm font-semibold hover:underline">
                      <TeamCrest name={teamName(p.ownerTeamId)} color={colors.get(p.ownerTeamId) ?? "#555"} size="xs" />
                      <span className="hidden max-w-28 truncate sm:inline">{teamName(p.ownerTeamId)}</span>
                    </Link>
                  ) : p.talentTeamId ? (
                    <Link href={`/squadre/${p.talentTeamId}?vista=pick`} title={`Squadra talenti di ${teamName(p.talentTeamId)} (R-35)`} className="relative z-[2] inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2 text-sm font-semibold hover:underline">
                      <TeamCrest name={teamName(p.talentTeamId)} color={colors.get(p.talentTeamId) ?? "#555"} size="xs" />
                      <Badge tone="accent">talento</Badge>
                    </Link>
                  ) : p.cutByTeamId ? (
                    <Badge tone="warn" title={`Tagliato da ${teamName(p.cutByTeamId)}`}>
                      tagliato
                    </Badge>
                  ) : p.restrictedTeamId ? (
                    <Badge tone="warn" title="Restricted: il vecchio proprietario può pareggiare l'offerta più alta (R-23)">
                      restricted
                    </Badge>
                  ) : (
                    <Badge tone="good" icon="check">
                      libero
                    </Badge>
                  )}
                </span>
                {withPdk && (
                  <span className="flex shrink-0 justify-end">
                    <PdkCell stats={dunkest.stats.get(p.id)} role={p.pos ? dunkest.roles[p.pos] : dunkest.all} />
                  </span>
                )}
                <span className="font-display tnum w-12 shrink-0 text-right text-2xl leading-none font-black md:w-auto">{p.credits === null ? "–" : fmt(p.credits)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {withPdk &&
        shown.map((p) => (
          <PlayerSheet
            key={p.id}
            player={{
              playerId: p.id,
              name: p.name,
              pos: p.pos,
              nbaTeam: p.nbaTeam,
              owner: p.ownerTeamId ? { name: teamName(p.ownerTeamId), color: colors.get(p.ownerTeamId) ?? "#555" } : null,
            }}
            dunkest={dunkest}
          />
        ))}

      {rest > 0 && (
        <div ref={sentinel} className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            className="font-display inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-lg font-extrabold transition-colors hover:border-foreground/40"
          >
            Mostra altri {Math.min(PAGE_SIZE, rest)}
          </button>
        </div>
      )}
    </>
  );
}
