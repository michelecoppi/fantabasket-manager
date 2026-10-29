"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Callout } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { Icon, type IconName } from "@/components/icons";
import { CapLine } from "@/components/cap-line";
import { verdict, type SimTeam } from "@/components/trade-parts";
import { Badge, PosChip, StatChange } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { evaluateTrade, type LeagueSettings, type TradeEvaluation } from "@/lib/cap";
import { fmt, fmtDateTime } from "@/lib/format";
import { teamColors } from "@/lib/team-colors";
import { draftFromMoves, staleMoves, toParties, type TradeMoveInput } from "@/lib/trade-draft";
import { awaitsAnswer, isOpen, timeLeft, type Proposal, type ProposalStatus } from "@/lib/trade-proposals";

const STATUS: Record<ProposalStatus, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "accent" | "gold"; icon: IconName }> = {
  pending: { label: "in attesa", tone: "accent", icon: "clock" },
  accepted: { label: "da approvare", tone: "gold", icon: "badge" },
  approved: { label: "eseguito", tone: "good", icon: "check" },
  rejected: { label: "rifiutata", tone: "bad", icon: "x" },
  declined: { label: "respinta", tone: "bad", icon: "x" },
  withdrawn: { label: "ritirata", tone: "neutral", icon: "arrow-left" },
  expired: { label: "scaduta", tone: "neutral", icon: "hourglass" },
  superseded: { label: "superata", tone: "warn", icon: "alert" },
};

/** Ciò che una carta passa ai suoi pulsanti: esito sulle rose di adesso e movimenti che non valgono più. */
export interface ProposalContext {
  ev: TradeEvaluation;
  stale: TradeMoveInput[];
}

/**
 * Una proposta di scambio (Fase 7): squadre, chi riceve cosa, risposte, messaggio e, finché è aperta, l'esito sulle rose di
 * adesso (`evaluateTrade`, non quello dell'invio) con un avviso se qualcosa è cambiato. I pulsanti li decide chi la mostra.
 */
export function ProposalCard({
  p,
  teams,
  settings,
  myTeamId,
  actions,
}: {
  p: Proposal;
  teams: SimTeam[];
  settings: LeagueSettings;
  myTeamId?: string | null;
  actions?: (ctx: ProposalContext) => ReactNode;
}) {
  const colors = teamColors(teams.map((t) => t.id));
  const color = (id: string) => colors.get(id) ?? "#555";
  const byId = new Map(teams.map((t) => [t.id, t]));
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const inTrade = p.teams.flatMap((id) => byId.get(id) ?? []);
  const open = isOpen(p);
  const stale = open ? staleMoves(teams, p.moves) : [];
  const draft = draftFromMoves(p.teams, p.moves);
  const ev = evaluateTrade(toParties(teams, draft), settings);
  const v = verdict(ev);
  const status = STATUS[p.status];
  const mine = awaitsAnswer(p, myTeamId);
  // dati di adesso (ruolo, stipendio) per i giocatori ancora in lega; l'etichetta resta quella dell'invio
  const players = new Map(teams.flatMap((t) => t.players.map((x) => [x.id, x] as const)));

  return (
    <article id={`p${p.id}`} className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-surface ${mine ? "border-gold/70" : "border-line"}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3.5">
        <span className="flex shrink-0 -space-x-2" aria-hidden>
          {p.teams.map((id) => (
            <TeamCrest key={id} name={name(id)} color={color(id)} size="sm" mine={id === myTeamId} />
          ))}
        </span>
        <h3 className="font-display min-w-0 flex-1 basis-40 text-xl leading-tight font-black">{p.teams.map(name).join(" ⇄ ")}</h3>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
          {p.status === "approved" && (p.dunkestDoneAt ? <Badge tone="good">fatto su Dunkest</Badge> : <Badge tone="warn">da fare su Dunkest</Badge>)}
        </span>
      </header>
      <p className="mt-1 px-4 text-xs text-muted">
        N. {p.id} · proposta da <span className="font-semibold text-foreground">{name(p.proposerTeamId)}</span> il {fmtDateTime(p.createdAt)}
        {p.parentId !== null && <> · controproposta della n. {p.parentId}</>}
        {p.msLeft !== null && (
          <span className="font-semibold text-warning">
            {" "}
            · <Icon name="clock" size={12} className="inline align-[-2px]" /> scade tra {timeLeft(p.msLeft)}
          </span>
        )}
        {!open && p.decidedAt && <> · chiusa il {fmtDateTime(p.decidedAt)}</>}
      </p>

      {p.message && <blockquote className="mx-4 mt-3 border-l-2 border-brand-blue/50 pl-3 text-sm whitespace-pre-line">{p.message}</blockquote>}

      <ul className={`mt-3 grid gap-x-4 gap-y-2 px-4 ${p.teams.length > 2 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
        {p.teams.map((id) => {
          const got = p.moves.filter((m) => m.to === id);
          return (
            <li key={id} className="min-w-0">
              <h4 className="eyebrow flex items-center gap-1.5 text-muted">
                <span className="truncate">{name(id)} riceve</span>
              </h4>
              {got.length === 0 ? (
                <p className="py-1 text-sm text-muted">Niente</p>
              ) : (
                <ul className="divide-y divide-line/70">
                  {got.map((m) => {
                    const now = m.kind === "contract" ? players.get(m.id) : undefined;
                    return (
                      <li key={`${m.kind}-${m.id}`} className="flex min-h-9 items-center gap-2 py-1">
                        {m.kind === "contract" ? (
                          <PosChip pos={now?.pos ?? null} />
                        ) : (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted">
                            <Icon name="ticket" size={15} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.label ?? now?.name ?? "?"}</span>
                          {m.slot && <span className="block text-[0.6875rem] leading-tight font-semibold text-brand-blue">come {m.slot === "starter" ? "titolare" : "riserva"}</span>}
                        </span>
                        {now && <span className="font-display tnum text-base leading-none font-black">{fmt(now.salary)}</span>}
                        <span className="shrink-0" title={`Da ${name(m.from)}`}>
                          <TeamCrest name={name(m.from)} color={color(m.from)} size="xs" />
                          <span className="sr-only">da {name(m.from)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Answers p={p} name={name} color={color} />

      <div className="mt-3 space-y-2 px-4 empty:hidden">
        {p.capReason && (
          <p className="text-sm">
            <span className="font-semibold">Richiesta di eccezione al cap (R-57):</span> {p.capReason}
          </p>
        )}
        {p.decisionNote && !open && (
          <p className="text-sm">
            <span className="font-semibold">{p.status === "declined" ? "Motivo:" : "Nota:"}</span> {p.decisionNote}
          </p>
        )}
        {stale.length > 0 && (
          <Callout tone="warn" title="Le rose sono cambiate dopo l'invio">
            {stale.length === 1 ? "Un giocatore o una pick" : `${stale.length} giocatori o pick`} non {stale.length === 1 ? "è" : "sono"} più dove {stale.length === 1 ? "era" : "erano"}{" "}
            (scambiati, tagliati o rinnovati): così la proposta non si può eseguire, va rifatta.
          </Callout>
        )}
      </div>

      {open && inTrade.length === p.teams.length && (
        <details className="group mx-4 mt-2 rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <Icon name="chevron" size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
            <span className="flex-1">Esito su cap e rose di adesso</span>
            <Badge tone={v.tone} icon={v.icon}>
              {v.label}
            </Badge>
          </summary>
          <div className="space-y-3 border-t border-line px-3 pb-3">
            <ImpactRows teams={inTrade} ev={ev} color={color} />
            {ev.errors.length > 0 && (
              <Callout tone="bad" title="Non si può eseguire">
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
        </details>
      )}

      {actions && <div className="mt-3 border-t border-line bg-surface-subtle/40 px-4 py-3 empty:hidden">{actions({ ev, stale })}</div>}
      {!actions && <div className="h-3" />}
    </article>
  );
}

/** Effetto per squadra in righe (niente carte dentro la carta): monte ingaggi, spazio e riserve dopo lo scambio, cap meter. */
function ImpactRows({ teams, ev, color }: { teams: SimTeam[]; ev: TradeEvaluation; color: (id: string) => string }) {
  return (
    <ul className="divide-y divide-line">
      {teams.map((t, i) => {
        const r = ev.impacts[i];
        if (!r) return null;
        return (
          <li key={t.id} className="grid gap-x-5 gap-y-2 py-3 lg:grid-cols-[minmax(0,15rem)_1fr]">
            <div className="flex min-w-0 items-center gap-2">
              <TeamCrest name={t.name} color={color(t.id)} size="xs" />
              <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
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
            </div>
            <div className="min-w-0">
              <div className="grid grid-cols-3 gap-2">
                <StatChange compact label="Monte" before={r.before.payroll} after={r.after.payroll} />
                <StatChange compact label="Spazio" before={r.before.capSpace} after={r.after.capSpace} worseWhenLower bad={r.after.overCap} />
                <StatChange compact label="Riserve" before={r.before.reserveSpace} after={r.after.reserveSpace} worseWhenLower bad={r.after.reserveSpace < 0} />
              </div>
              <div className="mt-2">
                <CapLine payroll={r.after.payroll} cap={r.after.effectiveCap} floor={r.after.floor} compact />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Una riga per controparte: ha accettato, ha rifiutato (con la nota) o deve ancora rispondere. */
function Answers({ p, name, color }: { p: Proposal; name: (id: string) => string; color: (id: string) => string }) {
  const others = p.teams.filter((id) => id !== p.proposerTeamId);
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5 px-4" aria-label="Risposte delle squadre">
      {others.map((id) => {
        const a = p.answers.find((x) => x.teamId === id);
        const state = a ? (a.answer === "accept" ? "ha accettato" : "ha rifiutato") : p.status === "pending" ? "deve rispondere" : "non ha risposto";
        const tone = a?.answer === "accept" ? "text-success" : a?.answer === "reject" ? "text-danger" : "text-muted";
        return (
          <li key={id} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-3 pl-1 text-xs">
            <TeamCrest name={name(id)} color={color(id)} size="xs" />
            <span className="truncate font-semibold">{name(id)}</span>
            <span className={`inline-flex shrink-0 items-center gap-0.5 font-bold ${tone}`}>
              <Icon name={a?.answer === "accept" ? "check" : a?.answer === "reject" ? "x" : "clock"} size={13} strokeWidth={2.6} />
              {state}
            </span>
            {a?.note && <span className="truncate text-muted">· «{a.note}»</span>}
          </li>
        );
      })}
    </ul>
  );
}

export type Notice = { ok: boolean; text: string };

/** Esegue un'action e riporta l'esito a chi mostra la lista (che resta montata quando la carta cambia gruppo). */
export function useRun(notify: (n: Notice) => void) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        notify({ ok: true, text: [r.message, ...(r.warnings.length ? [`Avvisi: ${r.warnings.join(" · ")}`] : [])].join(" ") });
        onOk?.();
      } else notify({ ok: false, text: r.error });
    });
  return { pending, run };
}

/** Avviso in cima alla lista con l'esito dell'ultima azione; si porta in vista, perché il pulsante può essere molto più in basso. */
export function NoticeBar({ notice }: { notice: Notice | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [notice]);
  if (!notice) return null;
  return (
    <div ref={ref} className="mb-4 scroll-mt-36" role="status">
      <Callout tone={notice.ok ? "good" : "bad"} title={notice.ok ? "Fatto" : "Non riuscito"}>
        {notice.text}
      </Callout>
    </div>
  );
}

/** Intestazione di gruppo nella lista delle proposte. */
export function GroupTitle({ children, count, icon }: { children: ReactNode; count: number; icon: IconName }) {
  return (
    <h2 className="font-display mt-8 mb-3 flex items-center gap-2.5 text-2xl leading-none font-extrabold first:mt-0">
      <Icon name={icon} size={20} className="text-brand-blue dark:text-gold" />
      {children}
      <span className="tnum rounded-full bg-surface-subtle px-2 py-0.5 text-sm font-bold text-muted">{count}</span>
    </h2>
  );
}

/** Stato locale di un pulsante a due tempi (tocca, poi conferma). */
export function useConfirm() {
  const [asking, setAsking] = useState<string | null>(null);
  return { asking, ask: (what: string) => setAsking(what), cancel: () => setAsking(null) };
}
