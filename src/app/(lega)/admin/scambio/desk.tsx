"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Callout, Field, inputClass } from "@/components/controls";
import { TradeMachine, type SimTeam, type TradeContext } from "@/components/trade-parts";
import { Card } from "@/components/ui";
import type { LeagueSettings } from "@/lib/cap";
import { executeTrade } from "../actions";

/** Esito dell'ultimo invio, legato alla bozza per cui vale (`draftId`): cambiando lo scambio sparisce. */
type Outcome = { ok: boolean; text: string; warnings: string[]; draftId: string } | null;

export function TradeDesk({ teams, settings }: { teams: SimTeam[]; settings: LeagueSettings }) {
  if (teams.length < 2) return <p className="text-sm text-muted">Servono almeno due squadre.</p>;
  return <TradeMachine teams={teams} settings={settings}>{(ctx) => <Officialize ctx={ctx} />}</TradeMachine>;
}

/** Ufficializzazione (R-55): eccezione del cap motivata (R-57), chi approva, conferma, poi una sola RPC per tutte le squadre. */
function Officialize({ ctx }: { ctx: TradeContext }) {
  const { draft, moves, ev, draftId, name, reset } = ctx;
  const [approvedBy, setApprovedBy] = useState("");
  const [reason, setReason] = useState("");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, start] = useTransition();

  const empty = moves.length === 0;
  const needsReason = ev.capBreakers.length > 0;
  const blocked = empty || ev.errors.length > 0 || (needsReason && !reason.trim());
  const confirming = confirmFor === draftId;
  const names = draft.teams.map(name);

  const submit = () =>
    start(async () => {
      const r = await executeTrade({
        teams: draft.teams,
        moves: moves.map(({ kind, id, version, from, to, slot }) => ({ kind, id, version, from, to, slot })),
        approvedBy,
        overrideReason: reason,
      });
      setConfirmFor(null);
      if (r.ok) {
        reset();
        setReason("");
        setApprovedBy("");
        // dopo il reset la bozza ha le stesse squadre e nessun movimento
        setOutcome({ ok: true, text: r.message, warnings: r.warnings, draftId: JSON.stringify([draft.teams, [], []]) });
      } else {
        setOutcome({ ok: false, text: r.error, warnings: [], draftId });
      }
    });

  return (
    <>
      <h2 className="font-display mt-10 mb-3 flex items-center gap-2.5 text-3xl leading-none font-extrabold before:h-6 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">
        Ufficializza
      </h2>
      <Card className="space-y-4 p-4">
        {needsReason && (
          <Callout tone="bad" title={`Fa sforare il cap: ${ev.capBreakers.join(", ")} (R-57)`}>
            Serve l&apos;eccezione del moderatore, sentito il presidente. Indica la motivazione (luxury tax, soglia di sicurezza, rientro con tagli…).
          </Callout>
        )}
        {!empty && (
          <Callout tone="warn" title="Fallo anche su Dunkest">
            Questa app non modifica le rose Dunkest: dopo la registrazione {names.length > 2 ? `le ${names.length} squadre` : "le due squadre"} devono fare lo scambio
            anche lì, titolari e riserve compresi. Finché non lo fanno,{" "}
            <Link href="/admin/dunkest" className="font-semibold underline">
              Allinea a Dunkest
            </Link>{" "}
            segnala le differenze.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {needsReason && (
            <Field label="Motivazione dell'eccezione" htmlFor="reason" hint="Obbligatoria: finisce nel registro dello scambio.">
              <textarea id="reason" className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <Field label="Approvato da" htmlFor="approved" hint="Il moderatore che ufficializza lo scambio (R-55), anche se non è admin dell'app. Facoltativo.">
            <input id="approved" className={inputClass} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="es. Amedeo" />
          </Field>
        </div>

        {outcome?.draftId === draftId && (
          <Callout tone={outcome.ok ? "good" : "bad"} title={outcome.ok ? "Fatto" : "Non registrato"}>
            {outcome.text}
            {outcome.warnings.length > 0 && <div className="mt-1 text-muted">Avvisi: {outcome.warnings.join(" · ")}</div>}
          </Callout>
        )}

        {confirming ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium sm:mr-auto">
              Confermi? Cambia rose e pick di {names.join(", ")}: {moves.length} {moves.length === 1 ? "movimento" : "movimenti"} in un&apos;unica operazione.
            </span>
            <Button variant="secondary" onClick={() => setConfirmFor(null)} disabled={pending}>
              Annulla
            </Button>
            <Button onClick={submit} pending={pending}>
              Sì, registra
            </Button>
          </div>
        ) : (
          <Button className="w-full sm:w-auto" disabled={blocked} onClick={() => setConfirmFor(draftId)}>
            {empty ? "Registra lo scambio" : `Registra lo scambio a ${names.length}`}
          </Button>
        )}
      </Card>
    </>
  );
}
