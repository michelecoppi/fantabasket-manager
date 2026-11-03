"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Field, inputClass } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { SwapLines } from "@/components/slot-swap-panel";
import { GroupTitle, NoticeBar, useConfirm, useRun, type Notice } from "@/components/trade-proposal";
import { Badge, Card, stagger } from "@/components/ui";
import { fmt, fmtDateTime } from "@/lib/format";
import type { SlotSwapLine } from "@/lib/slot-swap";
import { approveSlotSwap, declineSlotSwap, setSlotSwapWindow } from "../actions";

/** Una richiesta in attesa, già valutata dalla pagina sulla rosa di adesso (`evaluateSlotSwapItems`). */
export interface QueuedSwap {
  id: number;
  version: number;
  teamId: string;
  team: string;
  color: string;
  createdAt: string;
  up: SlotSwapLine[];
  down: SlotSwapLine[];
  /** un giocatore è cambiato dopo l'invio: va respinta */
  stale: boolean;
  errors: string[];
  warnings: string[];
  payroll: { before: number; after: number; overCap: boolean };
  reserveSpace: { before: number; after: number };
}

/**
 * Cambi titolari ↔ riserve chiesti dalle squadre (R-04): interruttore della finestra (la «data prestabilita») e richieste da
 * approvare. L'admin fa il cambio su Dunkest, poi «Approva e applica»: la rosa cambia qui e il bot lo annuncia.
 */
export function SlotSwapDesk({ open, queue }: { open: boolean | null; queue: QueuedSwap[] }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  return (
    <section id="cambi" aria-label="Cambi titolari e riserve" className="mb-10 scroll-mt-24">
      <WindowSwitch open={open} />
      <NoticeBar notice={notice} />
      <GroupTitle icon="swap" count={queue.length}>
        Cambi richiesti
      </GroupTitle>
      {queue.length === 0 ? (
        <p className="text-sm text-muted">{open ? "Nessuna richiesta in attesa: le squadre le mandano dalla pagina della propria rosa." : "Nessuna richiesta in attesa."}</p>
      ) : (
        <div className="space-y-3">
          {queue.map((q, i) => (
            <SwapCard key={q.id} q={q} i={i} notify={setNotice} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Interruttore della finestra dei cambi, come quello del mercato degli scambi. `open` null = stato non letto. */
function WindowSwitch({ open }: { open: boolean | null }) {
  const [value, setValue] = useState(open);
  const [outcome, setOutcome] = useState<Notice | null>(null);
  const [pending, start] = useTransition();
  const toggle = () => {
    if (value === null) return;
    const before = value;
    const next = !value;
    setValue(next);
    start(async () => {
      const r = await setSlotSwapWindow({ open: next });
      if (!r.ok) setValue(before);
      setOutcome(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });
  };
  return (
    <Card className="mb-6 space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl leading-none font-bold">Cambi titolari/riserve</h2>
            {value === null ? <Badge>non disponibile</Badge> : value ? <Badge tone="good" icon="check">aperti</Badge> : <Badge icon="lock">chiusi</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            R-04: nella data stabilita le squadre chiedono dalla loro pagina chi sale titolare e chi passa alla squadra riserve. Chiudendo, le richieste in attesa si ritirano.
          </p>
        </div>
        {value !== null && (
          <Button variant={value ? "secondary" : "gold"} icon={value ? "lock" : "swap"} pending={pending} onClick={toggle} className="shrink-0">
            {value ? "Chiudi i cambi" : "Apri i cambi"}
          </Button>
        )}
      </div>
      {value === null && <Callout tone="warn">Non riesco a leggere lo stato dei cambi: aggiorna la pagina. Se resta così, il database non ha ancora la migrazione dei cambi.</Callout>}
      {outcome && <Callout tone={outcome.ok ? "good" : "bad"}>{outcome.text}</Callout>}
    </Card>
  );
}

function SwapCard({ q, i, notify }: { q: QueuedSwap; i: number; notify: (n: Notice) => void }) {
  const { pending, run } = useRun(notify);
  const { asking, ask, cancel } = useConfirm();
  const [note, setNote] = useState("");
  const broken = q.stale || q.errors.length > 0;
  return (
    <article className={`rise rounded-2xl border bg-surface p-4 ${broken ? "border-danger/40" : q.warnings.length ? "border-warning/45" : "border-gold/50"}`} style={stagger(i)}>
      <div className="mb-3 flex items-center gap-3">
        <TeamCrest name={q.team} color={q.color} size="sm" />
        <div className="min-w-0 flex-1">
          <a href={`/squadre/${q.teamId}`} className="font-display block truncate text-2xl leading-none font-black hover:underline">
            {q.team}
          </a>
          <span className="text-xs text-muted">richiesta del {fmtDateTime(q.createdAt)}</span>
        </div>
        <span className="text-right text-xs text-muted">
          <span className="eyebrow block">Monte ingaggi</span>
          <span className="font-display tnum text-xl leading-none font-extrabold text-foreground">
            {fmt(q.payroll.before)} → <span className={q.payroll.overCap ? "text-danger" : ""}>{fmt(q.payroll.after)}</span>
          </span>
        </span>
      </div>
      <SwapLines up={q.up} down={q.down} />
      <p className="mt-2 text-xs text-muted">
        Budget riserve libero {fmt(q.reserveSpace.before)} → {fmt(q.reserveSpace.after)}
      </p>
      {(q.stale || q.errors.length > 0 || q.warnings.length > 0) && (
        <ul className="mt-2 space-y-1 text-sm">
          {[
            ...(q.stale ? [{ x: "Un giocatore è cambiato dopo la richiesta (scambio, taglio o modifica): respingila, la squadra ne manda una nuova.", bad: true }] : []),
            ...q.errors.map((x) => ({ x, bad: true })),
            ...q.warnings.map((x) => ({ x, bad: false })),
          ].map(({ x, bad }) => (
            <li key={x} className="flex gap-1.5">
              <Icon name="alert" size={15} strokeWidth={2.4} className={`mt-0.5 shrink-0 ${bad ? "text-danger" : "text-warning"}`} />
              {x}
            </li>
          ))}
        </ul>
      )}

      <div className="-mx-4 mt-4 -mb-4 rounded-b-2xl border-t border-line bg-surface-subtle px-4 py-3">
        {asking === "decline" ? (
          <div className="space-y-3">
            <Field label="Motivo" htmlFor={`swap-note-${q.id}`} hint="Obbligatorio: lo legge la squadra.">
              <textarea id={`swap-note-${q.id}`} className={inputClass} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={cancel} disabled={pending}>
                Annulla
              </Button>
              <Button variant="danger" pending={pending} disabled={!note.trim()} onClick={() => run(() => declineSlotSwap({ id: q.id, version: q.version, note }), cancel)}>
                Respingi
              </Button>
            </div>
          </div>
        ) : asking === "approve" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium sm:mr-auto">L&apos;hai già fatto su Dunkest? Approvando la rosa cambia qui e il bot lo annuncia.</span>
            <Button variant="secondary" onClick={cancel} disabled={pending}>
              Annulla
            </Button>
            <Button pending={pending} icon="check" onClick={() => run(() => approveSlotSwap({ id: q.id, version: q.version }), cancel)}>
              Sì, applica
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm text-muted sm:mr-auto">{broken ? "Così non si può applicare." : "Prima fallo su Dunkest, poi approva."}</span>
            <Button variant="secondary" onClick={() => ask("decline")} disabled={pending}>
              Respingi
            </Button>
            {!broken && (
              <Button icon="check" onClick={() => ask("approve")} disabled={pending}>
                Approva e applica
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
