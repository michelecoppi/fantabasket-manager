"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { loadSearchIndex } from "@/app/(lega)/actions";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { BallLoader } from "@/components/icons";
import { PosChip } from "@/components/ui";
import { fmt } from "@/lib/format";
import { searchLeague, type SearchHit, type SearchIndex } from "@/lib/search";
import { teamColors } from "@/lib/team-colors";

const SEARCH_ID = "ricerca";

/** Lente nell'header: apre la ricerca. */
export function SearchButton() {
  return (
    <button
      type="button"
      popoverTarget={SEARCH_ID}
      aria-label="Cerca un giocatore o una squadra"
      title="Cerca"
      className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/8 hover:text-white"
    >
      <Icon name="search" size={19} />
    </button>
  );
}

const hrefOf = (h: SearchHit) => (h.kind === "team" ? `/squadre/${h.team.id}` : `/giocatori/${h.player.id}`);

/**
 * Ricerca globale: squadre (anche dal proprietario) e giocatori del listone. Foglio che scende dall'alto su telefono, così la
 * tastiera non lo copre; da 640 px finestra centrata come le altre. L'indice arriva dal server alla prima apertura.
 */
export function SearchSheet() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      input.current?.focus();
      input.current?.select();
      if (!index) {
        setFailed(false);
        loadSearchIndex().then(setIndex, () => setFailed(true));
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, [index]);

  const hits = useMemo(() => (index ? searchLeague(index, q) : []), [index, q]);
  const colors = useMemo(() => teamColors(index?.teams.map((t) => t.id) ?? []), [index]);
  const teamName = (id: string) => index?.teams.find((t) => t.id === id)?.name ?? "";
  const close = () => ref.current?.hidePopover();
  const onPick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey) return;
    close();
  };

  return (
    <div ref={ref} id={SEARCH_ID} popover="auto" role="dialog" aria-label="Cerca" className="sheet sheet-top">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) {
            close();
            router.push(hrefOf(hits[0]));
          }
        }}
        className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-surface px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 sm:pt-3"
      >
        <span className="relative min-w-0 flex-1">
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            type="search"
            enterKeyHint="go"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Giocatore, squadra o proprietario"
            aria-label="Giocatore, squadra o proprietario"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 w-full rounded-lg border border-line bg-surface-subtle/60 pr-3 pl-10 text-base outline-none transition-[border-color,box-shadow] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15"
          />
        </span>
        <button
          type="button"
          popoverTarget={SEARCH_ID}
          popoverTargetAction="hide"
          className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-bold text-brand-blue"
        >
          Chiudi
        </button>
      </form>

      <div className="px-2 py-2" aria-live="polite">
        {failed ? (
          <p className="px-3 py-6 text-center text-sm text-muted">La ricerca non si carica. Riprova tra poco.</p>
        ) : !index ? (
          <div className="grid place-items-center py-8">
            <BallLoader />
          </div>
        ) : q.trim() === "" ? (
          <p className="px-3 py-6 text-center text-sm text-muted">Scrivi un nome: squadre, proprietari e tutti i giocatori del listone.</p>
        ) : hits.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">Nessun risultato per «{q.trim()}».</p>
        ) : (
          <ul>
            {hits.map((h) => (
              <li key={h.kind === "team" ? `t-${h.team.id}` : `p-${h.player.id}`}>
                <Link href={hrefOf(h)} onClick={onPick} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-subtle">
                  {h.kind === "team" ? (
                    <>
                      <TeamCrest name={h.team.name} color={colors.get(h.team.id) ?? "#555"} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="font-display block truncate text-xl leading-none font-extrabold">{h.team.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">Squadra · {h.team.owner}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <PosChip pos={h.player.pos} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{h.player.name}</span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                          <span className="shrink-0">{h.player.nbaTeam ?? "NBA n.d."}</span>
                          {h.player.ownerTeamId ? (
                            <>
                              <span aria-hidden>·</span>
                              <TeamCrest name={teamName(h.player.ownerTeamId)} color={colors.get(h.player.ownerTeamId) ?? "#555"} size="xs" />
                              <span className="truncate">{teamName(h.player.ownerTeamId)}</span>
                            </>
                          ) : (
                            <span>· senza squadra</span>
                          )}
                        </span>
                      </span>
                      {h.player.credits !== null && <span className="font-display tnum shrink-0 text-xl leading-none font-black">{fmt(h.player.credits)}</span>}
                    </>
                  )}
                  <Icon name="chevron" size={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
