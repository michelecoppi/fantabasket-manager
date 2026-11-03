"use client";

import { useMemo, useState, useTransition } from "react";
import { requestSlotSwap, withdrawSlotSwap } from "@/app/(lega)/squadre/[id]/actions";
import { CapLine } from "@/components/cap-line";
import { Button, Callout } from "@/components/controls";
import { Badge, PosChip, StatChange } from "@/components/ui";
import { evaluateSlotSwap, type LeagueSettings, type Position, type TradeSide } from "@/lib/cap";
import { fmt, fmtDateTime, POS_LABEL } from "@/lib/format";
import type { SlotSwapLine, SwapSlot } from "@/lib/slot-swap";

export interface SwapPlayer {
  /** id del contratto */
  id: number;
  name: string;
  pos: Position | null;
  slot: SwapSlot;
  salary: number;
}

/** Richiesta da mostrare al proprietario: quella in attesa, o l'ultima decisa. */
export interface OwnSwap {
  id: number;
  version: number;
  status: "pending" | "approved" | "declined" | "withdrawn";
  at: string;
  note: string | null;
  up: SlotSwapLine[];
  down: SlotSwapLine[];
}

type Notice = { ok: boolean; text: string } | null;

/**
 * Cambio titolari ↔ riserve chiesto dal proprietario (R-04), nella pagina della sua squadra. Si tocca chi passa alle riserve e chi
 * sale titolare; l'esito (ruolo per ruolo, budget riserve, cap e luxury tax) è `evaluateSlotSwap`, lo stesso che ricontrollano
 * l'action e l'admin all'approvazione. `open` null = stato della finestra non letto.
 */
export function SlotSwapPanel({
  teamId,
  players,
  side,
  settings,
  open,
  pending,
  last,
}: {
  teamId: string;
  players: SwapPlayer[];
  side: TradeSide;
  settings: LeagueSettings;
  open: boolean | null;
  pending: OwnSwap | null;
  last: OwnSwap | null;
}) {
  const [moves, setMoves] = useState<Map<number, SwapSlot>>(new Map());
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, start] = useTransition();
  const ev = useMemo(() => evaluateSlotSwap(side, moves, settings), [side, moves, settings]);

  const toggle = (p: SwapPlayer) =>
    setMoves((m) => {
      const next = new Map(m);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p.slot === "starter" ? "reserve" : "starter");
      return next;
    });

  const send = () =>
    start(async () => {
      const r = await requestSlotSwap({ teamId, moves: [...moves].map(([id, slot]) => ({ id, slot })) });
      setNotice(r.ok ? { ok: true, text: [r.message, ...r.warnings].join(" ") } : { ok: false, text: r.error });
      if (r.ok) setMoves(new Map());
    });
  const withdraw = (s: OwnSwap) =>
    start(async () => {
      const r = await withdrawSlotSwap({ id: s.id, version: s.version });
      setNotice(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });

  const noticeBar = notice && (
    <div className="mb-4" role="status">
      <Callout tone={notice.ok ? "good" : "bad"} title={notice.ok ? "Fatto" : "Non riuscito"}>
        {notice.text}
      </Callout>
    </div>
  );

  if (pending) {
    return (
      <div>
        {noticeBar}
        <article className="rounded-2xl border border-gold/50 bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="accent" icon="hourglass">
              In attesa dell&apos;admin
            </Badge>
            <span className="text-xs text-muted">inviata il {fmtDateTime(pending.at)}</span>
          </div>
          <SwapLines up={pending.up} down={pending.down} />
          <p className="mt-3 text-sm text-muted">Un admin fa il cambio su Dunkest e poi lo approva qui: allora la rosa cambia e il bot lo annuncia.</p>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" icon="x" pending={busy} onClick={() => withdraw(pending)}>
              Ritira la richiesta
            </Button>
          </div>
        </article>
      </div>
    );
  }

  const lastLine = last && <LastSwap s={last} />;

  if (open !== true) {
    return (
      <div className="space-y-3">
        {noticeBar}
        <Callout tone="info" title={open === null ? "Stato dei cambi non disponibile" : "Cambi chiusi"}>
          {open === null
            ? "Non riesco a leggere se i cambi sono aperti: aggiorna la pagina."
            : "Il regolamento (R-04) li prevede in date stabilite: quando un admin apre la finestra, da qui chiedi chi sale titolare e chi passa alla squadra riserve."}
        </Callout>
        {lastLine}
      </div>
    );
  }

  const positions = ["G", "A", "C"] as const;
  const { before, after } = ev.impact;
  const chosen = moves.size > 0;
  return (
    <div>
      {noticeBar}
      <p className="mb-4 text-sm text-muted">
        Tocca chi passa alle riserve e chi sale titolare, <strong className="font-semibold text-foreground">ruolo per ruolo</strong> (R-04). Le riserve devono stare nel
        budget di {fmt(settings.reserveBudget)}; sopra il cap si paga la luxury tax, fino a {fmt(ev.payrollLimit)}.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {positions.map((pos) => {
          const group = [...players.filter((p) => p.pos === pos && p.slot === "starter"), ...players.filter((p) => p.pos === pos && p.slot === "reserve")];
          return (
            <div key={pos} className="min-w-0">
              <h3 className="eyebrow mb-1.5 text-muted">{POS_LABEL[pos]}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {group.map((p, i) => {
                  const to = moves.get(p.id);
                  const firstReserve = p.slot === "reserve" && group[i - 1]?.slot !== "reserve";
                  return (
                    <li key={p.id}>
                      {firstReserve && <div className="eyebrow border-b border-line bg-surface-subtle px-3 py-1 text-muted">Squadra riserve</div>}
                      <button
                        type="button"
                        aria-pressed={!!to}
                        onClick={() => toggle(p)}
                        className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                          to === "starter" ? "bg-success/10" : to === "reserve" ? "bg-warning/10" : "hover:bg-surface-subtle/60"
                        }`}
                      >
                        <PosChip pos={p.pos} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{p.name}</span>
                          <span className={`block text-[0.6875rem] font-bold tracking-wide uppercase ${to === "starter" ? "text-success" : to === "reserve" ? "text-warning" : "text-muted"}`}>
                            {to === "starter" ? "▲ sale titolare" : to === "reserve" ? "▼ passa alle riserve" : p.slot === "starter" ? "titolare" : "riserva"}
                          </span>
                        </span>
                        <span className="font-display tnum text-xl leading-none font-extrabold">{fmt(p.salary)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-3 gap-3">
          <StatChange compact label="Monte" before={before.payroll} after={after.payroll} bad={after.overCap} />
          <StatChange compact label="Spazio cap" before={before.capSpace} after={after.capSpace} worseWhenLower bad={after.capSpace < 0} />
          <StatChange compact label="Riserve" before={before.reserveSpace} after={after.reserveSpace} worseWhenLower bad={after.reserveSpace < 0} />
        </div>
        <div className="mt-3">
          <CapLine payroll={after.payroll} cap={after.effectiveCap} floor={after.floor} compact />
        </div>
        {chosen && ev.unbalanced.length > 0 && (
          <div className="mt-3">
            <Callout tone="info" title="Completa il cambio">
              Per ogni ruolo salgono tanti titolari quanti ne scendono (R-04).{" "}
              {ev.unbalanced.map((u) => `${POS_LABEL[u.pos]}: ${u.up} ${u.up === 1 ? "sale" : "salgono"}, ${u.down} ${u.down === 1 ? "scende" : "scendono"}.`).join(" ")}
            </Callout>
          </div>
        )}
        {chosen && ev.unbalanced.length === 0 && ev.errors.length > 0 && (
          <div className="mt-3">
            <Callout tone="bad" title="Così non si può">
              <ul className="space-y-1">
                {ev.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          </div>
        )}
        {chosen && ev.errors.length === 0 && ev.warnings.length > 0 && (
          <div className="mt-3">
            <Callout tone="warn" title="Attenzione: luxury tax">
              {ev.warnings.join(" ")}
            </Callout>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {chosen && (
            <Button variant="ghost" onClick={() => setMoves(new Map())} disabled={busy}>
              Azzera
            </Button>
          )}
          <Button icon="swap" pending={busy} disabled={!chosen || ev.errors.length > 0} onClick={send}>
            Invia richiesta
          </Button>
        </div>
      </div>
      {lastLine && <div className="mt-4">{lastLine}</div>}
    </div>
  );
}

/** Chi sale e chi scende, come la carta di allineamento in /admin/dunkest. */
export function SwapLines({ up, down }: { up: SlotSwapLine[]; down: SlotSwapLine[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          ["Salgono titolari", "up", up],
          ["Passano alle riserve", "down", down],
        ] as const
      ).map(([title, tone, items]) => (
        <div key={tone} className="min-w-0">
          <h4 className={`eyebrow mb-1.5 flex items-center gap-1.5 ${tone === "up" ? "text-success" : "text-muted"}`}>
            <span aria-hidden>{tone === "up" ? "▲" : "▼"}</span>
            {title}
          </h4>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((c) => (
              <li key={c.id} className="flex min-h-11 items-center gap-2.5 px-3 py-1.5">
                <PosChip pos={c.pos} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                <span className="font-display tnum text-xl leading-none font-extrabold">{c.salary === null ? "–" : fmt(c.salary)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LastSwap({ s }: { s: OwnSwap }) {
  const what = s.status === "approved" ? "approvato" : s.status === "declined" ? "respinto" : "ritirato";
  return (
    <p className="text-sm text-muted">
      Ultimo cambio chiesto: <span className={`font-semibold ${s.status === "declined" ? "text-danger" : s.status === "approved" ? "text-success" : "text-foreground"}`}>{what}</span> il{" "}
      {fmtDateTime(s.at)}
      {s.note && <> · «{s.note}»</>}
    </p>
  );
}
