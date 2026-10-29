"use client";

import { useRef, useState, type ReactNode } from "react";
import { CapLine } from "@/components/cap-line";
import { Callout } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { edgeMask, useScrollEdges } from "@/components/use-scroll-edges";
import { Badge, Empty, PosChip, StatChange } from "@/components/ui";
import { evaluateTrade, type LeagueSettings, type TradeEvaluation, type TradeImpact } from "@/lib/cap";
import { fmt } from "@/lib/format";
import { teamColors } from "@/lib/team-colors";
import {
  addTeam,
  draftKey,
  draftMoves,
  emptyDraft,
  removeTeam,
  setArrivalSlot,
  setDestination,
  togglePick,
  togglePlayer,
  toParties,
  type ArrivalSlot,
  type DraftMove,
  type SimTeam,
  type TradeDraft,
} from "@/lib/trade-draft";

export type { SimTeam };

/** Ciò che la trade machine passa a chi la usa (il desk admin ci aggiunge l'ufficializzazione). */
export interface TradeContext {
  draft: TradeDraft;
  moves: DraftMove[];
  ev: TradeEvaluation;
  /** firma della bozza: cambia a ogni modifica */
  draftId: string;
  name: (id: string) => string;
  reset: () => void;
}

/** Colonne da quando c'è spazio per tutte le squadre affiancate; sotto, una linguetta per squadra. Classi intere per Tailwind. */
const LAYOUT = {
  1: { tabs: "hidden", grid: "", panel: "" },
  2: { tabs: "md:hidden", grid: "md:grid-cols-2", panel: "md:block" },
  3: { tabs: "lg:hidden", grid: "lg:grid-cols-3", panel: "lg:block" },
  4: { tabs: "xl:hidden", grid: "xl:grid-cols-4", panel: "xl:block" },
} as const;
const RESULT_GRID = { 1: "", 2: "md:grid-cols-2", 3: "md:grid-cols-2 xl:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4" } as const;
const span = (n: number) => Math.min(Math.max(n, 1), 4) as 1 | 2 | 3 | 4;

const tint = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`;

/**
 * Trade machine (R-55..R-57): scambi tra due o più squadre, fino a `tradeMaxTeams`. Ogni giocatore o pick ceduto va a una
 * squadra precisa (con due squadre è l'altra) e può arrivare come titolare o riserva. Le regole sono tutte in `evaluateTrade`.
 */
export function TradeMachine({
  teams,
  settings,
  myTeamId,
  children,
}: {
  teams: SimTeam[];
  settings: LeagueSettings;
  myTeamId?: string | null;
  children?: (ctx: TradeContext) => ReactNode;
}) {
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const initial = () => {
    const first = sorted.find((t) => t.id === myTeamId) ?? sorted[0];
    const second = sorted.find((t) => t.id !== first?.id);
    return emptyDraft([first, second].flatMap((t) => (t ? [t.id] : [])));
  };
  const [draft, setDraft] = useState<TradeDraft>(initial);
  const [active, setActive] = useState<string>(() => initial().teams[0] ?? "");

  const colors = teamColors(teams.map((t) => t.id));
  const color = (id: string) => colors.get(id) ?? "#555";
  const byId = new Map(teams.map((t) => [t.id, t]));
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const inTrade = draft.teams.flatMap((id) => byId.get(id) ?? []);
  const shown = inTrade.some((t) => t.id === active) ? active : (inTrade[0]?.id ?? "");

  const moves = draftMoves(teams, draft);
  const ev = evaluateTrade(toParties(teams, draft), settings);
  const draftId = draftKey(draft);
  const layout = LAYOUT[span(inTrade.length)];
  const reset = () => setDraft((d) => emptyDraft(d.teams));

  const toggleTeam = (id: string) => {
    if (draft.teams.includes(id)) {
      setDraft(removeTeam(draft, id));
      if (shown === id) setActive(draft.teams.find((t) => t !== id) ?? "");
    } else {
      setDraft(addTeam(draft, id, settings.tradeMaxTeams));
      setActive(id);
    }
  };

  return (
    <>
      <TeamStrip teams={sorted} chosen={draft.teams} max={settings.tradeMaxTeams} color={color} mine={myTeamId} onToggle={toggleTeam} />

      <div className="mt-3">
        {inTrade.length > 1 && (
          <div role="tablist" aria-label="Squadra da mostrare" className={`mb-3 grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-line bg-surface p-1 ${layout.tabs}`}>
            {inTrade.map((t) => {
              const on = t.id === shown;
              const out = moves.filter((m) => m.from === t.id).length;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(t.id)}
                  className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 transition-[background-color,color] sm:min-h-12 sm:flex-row sm:gap-1.5 sm:px-2 ${
                    on ? "bg-brand-blue text-white shadow-md dark:bg-gold dark:text-nav" : "text-muted hover:bg-surface-subtle hover:text-foreground"
                  }`}
                >
                  <TeamCrest name={t.name} color={color(t.id)} size="xs" mine={t.id === myTeamId} />
                  <span className="font-display max-w-full min-w-0 truncate text-[0.8125rem] leading-none font-extrabold sm:pr-5 sm:text-lg">{t.name}</span>
                  {out > 0 && (
                    <span
                      className="tnum absolute top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.6875rem] font-bold text-white sm:top-1/2 sm:right-2 sm:-translate-y-1/2"
                      style={{ background: color(t.id) }}
                    >
                      {out}
                      <span className="sr-only"> in uscita</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {inTrade.length === 0 ? (
          <Empty title="Scegli le squadre" icon="swap">
            Tocca almeno due squadre qui sopra per iniziare lo scambio.
          </Empty>
        ) : (
          <div className={`grid gap-3 ${layout.grid}`}>
            {inTrade.map((t) => (
              <TeamPanel
                key={t.id}
                team={t}
                draft={draft}
                others={inTrade.filter((o) => o.id !== t.id)}
                color={color}
                mine={t.id === myTeamId}
                className={t.id === shown ? "" : `hidden ${layout.panel}`}
                onChange={setDraft}
              />
            ))}
          </div>
        )}
        {inTrade.length === 1 && <p className="mt-3 text-sm font-semibold text-muted">Aggiungi almeno un&apos;altra squadra per scambiare.</p>}

        {moves.length > 0 && <TradeDock teams={inTrade} moves={moves} ev={ev} color={color} />}
      </div>

      <TradeOutcome teams={inTrade} moves={moves} ev={ev} color={color} name={name} onReset={reset} />
      {children?.({ draft, moves, ev, draftId, name, reset })}
    </>
  );
}

/** Le squadre della lega come chip da accendere: un tocco aggiunge o toglie una squadra dallo scambio. */
function TeamStrip({
  teams,
  chosen,
  max,
  color,
  mine,
  onToggle,
}: {
  teams: SimTeam[];
  chosen: string[];
  max: number;
  color: (id: string) => string;
  mine?: string | null;
  onToggle: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mask = edgeMask(useScrollEdges(ref));
  const full = chosen.length >= max;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface py-1.5 pr-1.5 pl-3">
      <span className="shrink-0 text-center leading-none">
        <span className="eyebrow block text-muted">Squadre</span>
        <span className="font-display tnum text-xl font-black">
          {chosen.length}
          <span className="text-muted">/{max}</span>
        </span>
      </span>
      <div ref={ref} role="group" aria-label={`Squadre nello scambio, al massimo ${max}`} style={{ maskImage: mask }} className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5">
        {teams.map((t) => {
          const on = chosen.includes(t.id);
          const locked = !on && full;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              disabled={locked}
              title={locked ? `Al massimo ${max} squadre in uno scambio` : on ? `Togli ${t.name}` : `Aggiungi ${t.name}`}
              onClick={() => onToggle(t.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-1.5 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,opacity] ${
                on ? "text-foreground" : "border-line border-dashed text-foreground/75 hover:border-foreground/40"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              style={on ? { background: tint(color(t.id), 14), borderColor: tint(color(t.id), 55) } : undefined}
            >
              <TeamCrest name={t.name} color={color(t.id)} size="xs" mine={t.id === mine} className={on ? "" : "opacity-70 saturate-50"} />
              <span className="max-w-[9rem] truncate">{t.name}</span>
              <Icon name={on ? "x" : "plus"} size={14} strokeWidth={2.6} className={on ? "text-muted" : "text-muted/70"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Rosa e pick di una squadra: si tocca ciò che cede, poi (con più squadre) a chi va e come arriva. */
function TeamPanel({
  team,
  draft,
  others,
  color,
  mine,
  className,
  onChange,
}: {
  team: SimTeam;
  draft: TradeDraft;
  others: SimTeam[];
  color: (id: string) => string;
  mine: boolean;
  className: string;
  onChange: (d: TradeDraft) => void;
}) {
  const c = color(team.id);
  const gone = team.players.filter((p) => draft.players.get(p.id)?.from === team.id);
  const gonePicks = team.picks.filter((p) => draft.picks.get(p.id)?.from === team.id);
  const groups = [
    { label: "Titolari", players: team.players.filter((p) => p.slot === "starter") },
    { label: "Riserve", players: team.players.filter((p) => p.slot === "reserve") },
  ].filter((g) => g.players.length > 0);
  const canGive = others.length > 0;

  return (
    <section aria-label={`${team.name}: cosa cede`} className={`overflow-hidden rounded-2xl border border-line bg-surface ${className}`}>
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${tint(c, 16)}, transparent)` }}>
        <TeamCrest name={team.name} color={c} size="sm" mine={mine} />
        <h3 className="font-display min-w-0 flex-1 truncate text-xl leading-none font-black">{team.name}</h3>
        <div className="shrink-0 text-right leading-none">
          <div className="font-display tnum text-xl font-black">{fmt(gone.reduce((n, p) => n + p.salary, 0))}</div>
          <div className="eyebrow mt-0.5 whitespace-nowrap text-muted">
            cede {gone.length} gioc · {gonePicks.length} pick
          </div>
        </div>
      </header>

      <div className="max-h-[min(30rem,62vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="eyebrow sticky top-0 z-[1] flex justify-between border-b border-line bg-surface/95 px-3 py-1.5 text-muted backdrop-blur-sm">
              <span>
                {g.label} · {g.players.length}
              </span>
              <span className="tnum">{fmt(g.players.reduce((n, p) => n + p.salary, 0))}</span>
            </div>
            <ul className="space-y-0.5 p-1">
              {g.players.map((p) => {
                const move = draft.players.get(p.id);
                const on = move?.from === team.id;
                return (
                  <li key={p.id}>
                    <label
                      className={`relative flex min-h-11 items-center gap-2.5 rounded-xl border border-transparent px-2 py-1 transition-[background-color,border-color] ${
                        canGive ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                      } ${on ? "" : "hover:bg-surface-subtle"}`}
                      style={on ? { background: tint(c, 13), borderColor: tint(c, 45) } : undefined}
                    >
                      <input type="checkbox" className="peer sr-only" checked={on} disabled={!canGive} onChange={() => onChange(togglePlayer(draft, team.id, p.id))} />
                      <PosChip pos={p.pos} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <span className="font-display tnum text-lg leading-none font-black">{fmt(p.salary)}</span>
                      <Tick on={on} color={c} />
                    </label>
                    {on && move && p.slot !== "talent" && (
                      <MoveControls
                        others={others}
                        to={move.to}
                        color={color}
                        onTo={(to) => onChange(setDestination(draft, "players", p.id, to))}
                        slot={{ current: p.slot, value: move.slot ?? p.slot, onChange: (s) => onChange(setArrivalSlot(draft, p.id, s, p.slot)) }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {groups.length === 0 && <p className="px-3 py-4 text-sm text-muted">Nessun giocatore sotto contratto.</p>}

        {team.picks.length > 0 && (
          <div className="border-t border-line px-3 pt-2 pb-3">
            <h4 className="eyebrow mb-2 flex items-center gap-1.5 text-muted">
              <Icon name="ticket" size={14} />
              Pick · {team.picks.length}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {team.picks.map((p) => {
                const on = draft.picks.get(p.id)?.from === team.id;
                return (
                  <label
                    key={p.id}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-[background-color,border-color,color] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold ${
                      on ? "border-transparent text-white" : "border-dashed border-line hover:border-foreground/40"
                    } ${canGive ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                    style={on ? { background: c } : undefined}
                  >
                    <input type="checkbox" className="sr-only" checked={on} disabled={!canGive} onChange={() => onChange(togglePick(draft, team.id, p.id))} />
                    {on && <Icon name="check" size={13} strokeWidth={3} />}
                    {p.label}
                  </label>
                );
              })}
            </div>
            {others.length > 1 && gonePicks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-dashed border-line pt-2">
                {gonePicks.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {p.year} · {p.round}° giro
                    </span>
                    <MoveControls others={others} to={draft.picks.get(p.id)?.to ?? ""} color={color} onTo={(to) => onChange(setDestination(draft, "picks", p.id, to))} inline />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Casella di selezione disegnata (il checkbox vero è nascosto ma resta per tastiera e lettori di schermo). */
function Tick({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,transform] peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-focus-visible:ring-offset-2 ${
        on ? "scale-110 border-transparent text-white" : "border-line text-transparent"
      }`}
      style={on ? { background: color } : undefined}
    >
      <Icon name="check" size={14} strokeWidth={3} />
    </span>
  );
}

const SLOT_LABEL = { starter: "Titolare", reserve: "Riserva" } as const;

/**
 * Sotto un bene ceduto: a quale squadra va (solo con tre o più squadre: gli stemmi delle altre) e, per i giocatori, come arriva.
 * Scegliere lo slot che il giocatore ha già equivale a non scegliere (docs/OPEN-QUESTIONS.md).
 */
function MoveControls({
  others,
  to,
  color,
  onTo,
  slot,
  inline = false,
}: {
  others: SimTeam[];
  to: string;
  color: (id: string) => string;
  onTo: (id: string) => void;
  slot?: { current: ArrivalSlot | "talent"; value: ArrivalSlot | "talent"; onChange: (s: ArrivalSlot | null) => void };
  inline?: boolean;
}) {
  const target = others.find((o) => o.id === to);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs ${inline ? "" : "pr-1 pb-2 pl-11"}`}>
      {others.length > 1 && (
        <div role="group" aria-label="Va a" className="flex min-w-0 items-center gap-1">
          <Icon name="arrow-right" size={14} strokeWidth={2.4} className="shrink-0 text-muted" />
          {others.map((o) => {
            const on = o.id === to;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                aria-label={`Va a ${o.name}`}
                title={`Va a ${o.name}`}
                onClick={() => onTo(o.id)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 transition-[background-color,border-color,opacity] ${on ? "" : "border-transparent opacity-45 hover:opacity-100"}`}
                style={on ? { borderColor: color(o.id), background: tint(color(o.id), 16) } : undefined}
              >
                <TeamCrest name={o.name} color={color(o.id)} size="xs" />
              </button>
            );
          })}
          {!inline && target && <span className="ml-0.5 max-w-[8rem] truncate font-semibold">{target.name}</span>}
        </div>
      )}
      {slot && slot.current !== "talent" && (
        <div role="group" aria-label="Arriva come" className="flex items-center gap-1.5">
          <span className="text-muted">{others.length > 1 ? "come" : "Arriva come"}</span>
          <span className="inline-flex rounded-lg border border-line p-0.5">
            {(["starter", "reserve"] as const).map((s) => {
              const on = slot.value === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => slot.onChange(s === slot.current ? null : s)}
                  className={`min-h-8 rounded-md px-2.5 font-semibold transition-[background-color,color] ${on ? "bg-brand-blue text-white dark:bg-gold dark:text-nav" : "text-muted hover:text-foreground"}`}
                >
                  {SLOT_LABEL[s]}
                </button>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

type Verdict = { tone: "good" | "warn" | "bad"; icon: "check" | "alert" | "flame"; label: string };
function verdict(ev: TradeEvaluation): Verdict {
  if (ev.errors.length) return { tone: "bad", icon: "alert", label: ev.errors.length === 1 ? "1 blocco" : `${ev.errors.length} blocchi` };
  if (ev.capBreakers.length) return { tone: "bad", icon: "flame", label: "serve eccezione" };
  if (ev.warnings.length) return { tone: "warn", icon: "alert", label: "in regola, con avvisi" };
  return { tone: "good", icon: "check", label: "in regola" };
}

/** Barra che segue lo scorrimento della rosa: chi è nello scambio, quanti movimenti, esito, salto al riepilogo. */
function TradeDock({ teams, moves, ev, color }: { teams: SimTeam[]; moves: DraftMove[]; ev: TradeEvaluation; color: (id: string) => string }) {
  const v = verdict(ev);
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-3 lg:bottom-4">
      <a
        href="#esito"
        className="pop flex min-h-12 items-center gap-3 chrome rounded-2xl border border-white/10 py-1.5 pr-2 pl-3 shadow-[0_10px_30px_rgb(6_10_20/0.2)] backdrop-blur-md dark:shadow-[0_10px_30px_rgb(6_10_20/0.35)]"
      >
        <span className="flex shrink-0 -space-x-2" aria-hidden>
          {teams.map((t) => (
            <TeamCrest key={t.id} name={t.name} color={color(t.id)} size="xs" />
          ))}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="font-display tnum block truncate text-lg leading-none font-extrabold">
            {moves.length} {moves.length === 1 ? "movimento" : "movimenti"}
          </span>
          <span className={`block truncate text-[0.6875rem] font-bold tracking-wide uppercase ${v.tone === "good" ? "text-arena-good" : v.tone === "warn" ? "text-arena-warn" : "text-arena-bad"}`}>
            {v.label}
          </span>
        </span>
        <span className="font-display inline-flex min-h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-base font-extrabold">
          Esito
          <Icon name="chevron" size={16} strokeWidth={2.6} className="rotate-90" />
        </span>
      </a>
    </div>
  );
}

/** Esito per squadra: cosa riceve (e da chi), monte ingaggi, spazio e riserve prima → dopo, poi blocchi e avvisi. */
function TradeOutcome({
  teams,
  moves,
  ev,
  color,
  name,
  onReset,
}: {
  teams: SimTeam[];
  moves: DraftMove[];
  ev: TradeEvaluation;
  color: (id: string) => string;
  name: (id: string) => string;
  onReset: () => void;
}) {
  const v = verdict(ev);
  return (
    <section id="esito" aria-labelledby="esito-title" className="mt-10 scroll-mt-24">
      <div className="mb-3 flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-blue/10 text-brand-blue dark:bg-nav dark:text-gold">
          <Icon name="coins" size={17} strokeWidth={2} />
        </span>
        <h2 id="esito-title" className="font-display text-3xl leading-none font-extrabold">
          Esito
        </h2>
        {moves.length > 0 && (
          <Badge tone={v.tone} icon={v.icon}>
            {v.label}
          </Badge>
        )}
        <span aria-hidden className="hidden h-px flex-1 bg-linear-to-r from-line to-transparent sm:block" />
        {moves.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            title="Svuota lo scambio"
            className="ml-auto inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted hover:text-foreground sm:ml-0"
          >
            <Icon name="refresh" size={15} />
            <span className="sr-only sm:not-sr-only">Svuota</span>
          </button>
        )}
      </div>
      {moves.length === 0 ? (
        <Empty title="Prepara lo scambio" icon="swap">
          Tocca giocatori o pick da cedere: qui vedi subito chi riceve cosa e l&apos;effetto su cap e riserve di ogni squadra.
        </Empty>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <div className={`grid gap-3 ${RESULT_GRID[span(teams.length)]}`}>
            {teams.map((t, i) => (
              <TeamResult
                key={t.id}
                team={t}
                impact={ev.impacts[i]}
                incoming={moves.filter((m) => m.to === t.id)}
                outgoing={moves.filter((m) => m.from === t.id)}
                color={color}
                name={name}
              />
            ))}
          </div>
          {ev.errors.length > 0 && (
            <Callout tone="bad" title="Scambio non registrabile">
              <ul className="list-disc pl-5">
                {ev.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          )}
          {ev.warnings.length > 0 && (
            <Callout tone="warn" title="Da controllare (non bloccano)">
              <ul className="list-disc pl-5">
                {ev.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
        </div>
      )}
    </section>
  );
}

function TeamResult({
  team,
  impact,
  incoming,
  outgoing,
  color,
  name,
}: {
  team: SimTeam;
  impact: TradeImpact | undefined;
  incoming: DraftMove[];
  outgoing: DraftMove[];
  color: (id: string) => string;
  name: (id: string) => string;
}) {
  if (!impact) return null;
  const r = impact;
  const c = color(team.id);
  const outSalary = outgoing.reduce((n, m) => n + (m.salary ?? 0), 0);
  return (
    <article className={`pop relative flex flex-col overflow-hidden rounded-2xl border bg-surface ${r.breaksCap ? "border-danger/60" : "border-line"}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: r.breaksCap ? "var(--danger)" : c }} />
      <header className="flex items-center gap-2.5 px-3 pt-3.5">
        <TeamCrest name={team.name} color={c} size="sm" />
        <h3 className="font-display min-w-0 flex-1 truncate text-xl leading-none font-black">{team.name}</h3>
        {r.breaksCap ? (
          <Badge tone="bad" icon="alert">
            eccezione
          </Badge>
        ) : r.after.overCap ? (
          <Badge tone="warn" icon="flame">
            sopra cap
          </Badge>
        ) : (
          <Badge tone="good" icon="check">
            ok cap
          </Badge>
        )}
      </header>

      <div className="mt-2 flex-1 px-3">
        <h4 className="eyebrow text-muted">Riceve</h4>
        {incoming.length === 0 ? (
          <p className="py-1 text-sm text-muted">Niente</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {incoming.map((m) => (
              <li key={`${m.kind}-${m.id}`} className="flex min-h-9 items-center gap-2 py-1">
                {m.kind === "contract" ? (
                  <PosChip pos={m.pos ?? null} />
                ) : (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted">
                    <Icon name="ticket" size={15} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.label}</span>
                  {m.slot && <span className="block text-[0.6875rem] leading-tight font-semibold text-brand-blue">come {m.slot === "starter" ? "titolare" : "riserva"}</span>}
                </span>
                {m.salary !== undefined && <span className="font-display tnum text-base leading-none font-black">{fmt(m.salary)}</span>}
                <span className="shrink-0" title={`Da ${name(m.from)}`}>
                  <TeamCrest name={name(m.from)} color={color(m.from)} size="xs" />
                  <span className="sr-only">da {name(m.from)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted">
          Cede{" "}
          {outgoing.length === 0 ? (
            "niente"
          ) : (
            <>
              {outgoing.filter((m) => m.kind === "contract").length} gioc. · {outgoing.filter((m) => m.kind === "pick").length} pick
              {outSalary > 0 && <span className="tnum"> ({fmt(outSalary)} cr)</span>}
            </>
          )}
        </p>
      </div>

      <div className="mt-3 border-t border-line bg-surface-subtle/50 px-3 pt-2.5 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <StatChange compact label="Monte" before={r.before.payroll} after={r.after.payroll} />
          <StatChange compact label="Spazio" before={r.before.capSpace} after={r.after.capSpace} worseWhenLower bad={r.after.overCap} />
          <StatChange compact label="Riserve" before={r.before.reserveSpace} after={r.after.reserveSpace} worseWhenLower bad={r.after.reserveSpace < 0} />
        </div>
        <div className="mt-2.5">
          <CapLine payroll={r.after.payroll} cap={r.after.effectiveCap} floor={r.after.floor} compact />
        </div>
        {(r.after.belowFloor || r.warnings.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {r.after.belowFloor && (
              <Badge tone="warn" title="Il floor non blocca lo scambio (R-57)">
                sotto floor ({fmt(r.after.floor)})
              </Badge>
            )}
            {r.warnings.map((w) => (
              <Badge key={w} title="Composizione della rosa dopo lo scambio">
                {w}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
