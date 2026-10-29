"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Field, inputClass } from "@/components/controls";
import { GroupTitle, NoticeBar, ProposalCard, useConfirm, useRun, type Notice, type ProposalContext } from "@/components/trade-proposal";
import type { SimTeam } from "@/components/trade-parts";
import type { LeagueSettings } from "@/lib/cap";
import type { Proposal } from "@/lib/trade-proposals";
import { approveProposal, declineProposal, markDunkestDone, returnProposal } from "../actions";

/**
 * Coda admin delle proposte (Fase 7.3): «Da approvare» (accettate da tutte le squadre: approva ed esegui, respingi, rimanda) e
 * «Da fare su Dunkest» (eseguite, finché un admin non conferma che lo scambio è fatto anche lì).
 */
export function ProposalQueue({
  toApprove,
  toDunkest,
  waiting,
  teams,
  settings,
}: {
  toApprove: Proposal[];
  toDunkest: Proposal[];
  /** proposte ancora in attesa delle risposte delle squadre */
  waiting: number;
  teams: SimTeam[];
  settings: LeagueSettings;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  return (
    <section id="proposte" aria-label="Proposte delle squadre" className="mb-10 scroll-mt-24">
      <NoticeBar notice={notice} />
      <GroupTitle icon="badge" count={toApprove.length}>
        Da approvare
      </GroupTitle>
      {toApprove.length === 0 ? (
        <p className="text-sm text-muted">
          Nessuna proposta accettata da tutte le squadre.
          {waiting > 0 && (
            <>
              {" "}
              {waiting === 1 ? "Una aspetta" : `${waiting} aspettano`} ancora le risposte (
              <Link href="/scambio?vista=proposte" className="font-semibold text-brand-blue underline">
                vedi
              </Link>
              ).
            </>
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {toApprove.map((p) => (
            <ProposalCard key={p.id} p={p} teams={teams} settings={settings} actions={(ctx) => <Approve p={p} ctx={ctx} notify={setNotice} />} />
          ))}
        </div>
      )}

      {toDunkest.length > 0 && (
        <>
          <GroupTitle icon="download" count={toDunkest.length}>
            Da fare su Dunkest
          </GroupTitle>
          <p className="mb-3 text-sm text-muted">Scambi già eseguiti qui: quando le squadre li hanno fatti anche su Dunkest, segnali come fatti.</p>
          <div className="space-y-3">
            {toDunkest.map((p) => (
              <ProposalCard key={p.id} p={p} teams={teams} settings={settings} actions={() => <DunkestDone p={p} notify={setNotice} />} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Approva ed esegui (R-55), con la motivazione dell'eccezione se il cap sfora (R-57); oppure respingi o rimanda alle squadre. */
function Approve({ p, ctx, notify }: { p: Proposal; ctx: ProposalContext; notify: (n: Notice) => void }) {
  const { pending, run } = useRun(notify);
  const { asking, ask, cancel } = useConfirm();
  const [approvedBy, setApprovedBy] = useState("");
  const [reason, setReason] = useState(p.capReason ?? "");
  const [note, setNote] = useState("");
  const { ev, stale } = ctx;
  const needsReason = ev.capBreakers.length > 0;
  const broken = stale.length > 0 || ev.errors.length > 0;

  if (asking === "decline" || asking === "return") {
    const decline = asking === "decline";
    return (
      <div className="space-y-3">
        <Field
          label={decline ? "Motivo" : "Nota per le squadre"}
          htmlFor={`note-${p.id}`}
          hint={decline ? "Obbligatorio: lo leggono le squadre." : "Facoltativa (es. «rose cambiate, rifatela»)."}
        >
          <textarea id={`note-${p.id}`} className={inputClass} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={cancel} disabled={pending}>
            Annulla
          </Button>
          <Button
            variant={decline ? "danger" : "secondary"}
            pending={pending}
            disabled={decline && !note.trim()}
            onClick={() => run(() => (decline ? declineProposal : returnProposal)({ id: p.id, version: p.version, note }), cancel)}
          >
            {decline ? "Respingi" : "Rimanda alle squadre"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {broken ? (
        <Callout tone="warn" title="Non si può eseguire così">
          {stale.length > 0 ? "Le rose sono cambiate dopo l'accettazione." : "Con le rose di adesso lo scambio non è in regola."} Rimandala alle squadre: chi l&apos;ha
          proposta può rifarla.
        </Callout>
      ) : (
        <>
          {needsReason && (
            <Callout tone="bad" title={`Fa sforare il cap: ${ev.capBreakers.join(", ")} (R-57)`}>
              Serve l&apos;eccezione del moderatore, sentito il presidente. La motivazione finisce nel registro dello scambio.
            </Callout>
          )}
          <Callout tone="warn" title="Fallo anche su Dunkest">
            Approvando, rose e pick cambiano subito qui. Le squadre devono rifare lo scambio su Dunkest, titolari e riserve compresi; poi segnalo come fatto.
          </Callout>
          <div className="grid gap-4 sm:grid-cols-2">
            {needsReason && (
              <Field label="Motivazione dell'eccezione" htmlFor={`reason-${p.id}`} hint="Obbligatoria. Precompilata con la richiesta della squadra.">
                <textarea id={`reason-${p.id}`} className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
            <Field label="Approvato da" htmlFor={`by-${p.id}`} hint="Il moderatore che ufficializza lo scambio (R-55). Facoltativo.">
              <input id={`by-${p.id}`} className={inputClass} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="es. Amedeo" />
            </Field>
          </div>
        </>
      )}

      {asking === "approve" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm font-medium sm:mr-auto">Confermi? Lo scambio si esegue ora: {p.moves.length} {p.moves.length === 1 ? "movimento" : "movimenti"} in un&apos;unica operazione.</span>
          <Button variant="secondary" onClick={cancel} disabled={pending}>
            Annulla
          </Button>
          <Button pending={pending} icon="check" onClick={() => run(() => approveProposal({ id: p.id, version: p.version, approvedBy, overrideReason: reason }), cancel)}>
            Sì, esegui
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!broken && (
            <Button icon="check" disabled={needsReason && !reason.trim()} onClick={() => ask("approve")}>
              Approva ed esegui
            </Button>
          )}
          <Button variant="secondary" onClick={() => ask("return")}>
            Rimanda alle squadre
          </Button>
          <Button variant="ghost" icon="x" onClick={() => ask("decline")}>
            Respingi
          </Button>
        </div>
      )}
    </div>
  );
}

function DunkestDone({ p, notify }: { p: Proposal; notify: (n: Notice) => void }) {
  const { pending, run } = useRun(notify);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="text-sm text-muted sm:mr-auto">
        <Link href="/admin/dunkest" className="font-semibold text-brand-blue underline">
          Allinea a Dunkest
        </Link>{" "}
        segnala le differenze tra le rose qui e su Dunkest.
      </span>
      <Button variant="secondary" icon="check" pending={pending} onClick={() => run(() => markDunkestDone({ id: p.id }))}>
        Fatto su Dunkest
      </Button>
    </div>
  );
}
