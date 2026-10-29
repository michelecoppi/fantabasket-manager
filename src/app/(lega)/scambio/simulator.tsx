"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Callout, Field, inputClass } from "@/components/controls";
import { Icon } from "@/components/icons";
import { TradeMachine, type SimTeam, type TradeContext } from "@/components/trade-parts";
import { Card } from "@/components/ui";
import type { LeagueSettings } from "@/lib/cap";
import { draftFromMoves, type TradeMoveInput } from "@/lib/trade-draft";
import { proposeTrade } from "./actions";

export type { SimTeam };

/** Bozza da cui parte la trade machine: uno scambio del cercatore («Usa questa») o una proposta da rifare. */
export interface StartDraft {
  teams: string[];
  moves: TradeMoveInput[];
  /** controproposta (o proposta rifatta dal proponente): i suoi movimenti ancora validi */
  counter?: {
    id: number;
    /** true se a rifarla è chi l'aveva proposta: la vecchia si ritira, invece di essere rifiutata */
    own: boolean;
  };
}

export function TradeSimulator({
  teams,
  settings,
  myTeamId,
  market,
  start,
}: {
  teams: SimTeam[];
  settings: LeagueSettings;
  myTeamId?: string | null;
  /** mercato degli scambi (Fase 7.1): null = stato non disponibile */
  market: boolean | null;
  start?: StartDraft;
}) {
  if (teams.length < 2) return <p className="text-sm text-muted">Servono almeno due squadre.</p>;
  const initialDraft = start ? draftFromMoves(start.teams, start.moves) : undefined;
  return (
    <>
      <TradeMachine teams={teams} settings={settings} myTeamId={myTeamId} initialDraft={initialDraft}>
        {(ctx) => myTeamId && <Propose ctx={ctx} myTeamId={myTeamId} market={market} settings={settings} counter={start?.counter} />}
      </TradeMachine>
      <p className="mt-4 text-xs text-muted">
        Assunzioni: se non scegli altro, i giocatori arrivano nello stesso slot (titolare/riserva) che avevano; se una squadra è già sopra il cap, lo scambio è
        accettabile solo se non aumenta il suo monte ingaggi. Un moderatore può autorizzare eccezioni (R-57). Al massimo {settings.tradeMaxTeams} squadre per
        scambio.
      </p>
      <p className="mt-2 text-xs font-semibold text-warning">
        Ogni scambio va fatto anche su Dunkest, titolari e riserve compresi: questa app non modifica le rose Dunkest.
      </p>
    </>
  );
}

type Outcome = { ok: boolean; text: string; warnings: string[]; draftId: string } | null;

/**
 * Invio della proposta (Fase 7.3): solo con un account collegato a una squadra, la tua squadra nello scambio e il mercato
 * aperto. Le regole sono quelle dell'esito qui sopra; lo sforamento del cap (R-57) chiede una richiesta di eccezione per l'admin.
 */
function Propose({
  ctx,
  myTeamId,
  market,
  settings,
  counter,
}: {
  ctx: TradeContext;
  myTeamId: string;
  market: boolean | null;
  settings: LeagueSettings;
  counter?: StartDraft["counter"];
}) {
  const { draft, moves, ev, draftId, name, reset } = ctx;
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // dopo l'invio la proposta di partenza è chiusa: le nuove proposte da qui sono proposte normali
  const [parent, setParent] = useState(counter?.id ?? null);
  const [pending, start] = useTransition();

  const others = draft.teams.filter((id) => id !== myTeamId).map(name);
  const inTrade = draft.teams.includes(myTeamId);
  const empty = moves.length === 0;
  const needsReason = ev.capBreakers.length > 0;
  const blocked = market !== true || !inTrade || empty || ev.errors.length > 0 || (needsReason && !reason.trim());
  const confirming = confirmFor === draftId;
  const label = others.length > 1 ? `${others.slice(0, -1).join(", ")} e ${others.at(-1)}` : (others[0] ?? "");

  const submit = () =>
    start(async () => {
      const r = await proposeTrade({
        teams: draft.teams,
        moves: moves.map(({ kind, id, version, from, to, slot }) => ({ kind, id, version, from, to, ...(slot ? { slot } : {}) })),
        message,
        capReason: reason,
        parent,
      });
      setConfirmFor(null);
      if (r.ok) {
        reset();
        setMessage("");
        setReason("");
        setParent(null);
        // dopo il reset la bozza ha le stesse squadre e nessun movimento
        setOutcome({ ok: true, text: r.message, warnings: r.warnings, draftId: JSON.stringify([draft.teams, [], []]) });
      } else {
        setOutcome({ ok: false, text: r.error, warnings: [], draftId });
      }
    });

  return (
    <>
      <h2 className="font-display mt-10 mb-3 flex items-center gap-2.5 text-3xl leading-none font-extrabold before:h-6 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">
        {parent ? "Controproponi" : "Proponi"}
      </h2>
      <Card className="space-y-4 p-4">
        {parent !== null && (
          <Callout tone="info" title={`Riparti dalla proposta n. ${parent}`}>
            {counter?.own
              ? "Inviando questa, la proposta di partenza si ritira."
              : "Inviando questa, rifiuti la proposta di partenza e le squadre ricevono la tua al suo posto."}{" "}
            <Link href="/scambio?vista=proposte" className="font-semibold underline">
              Annulla
            </Link>
          </Callout>
        )}

        {market === false ? (
          <p className="flex items-start gap-2 text-sm">
            <Icon name="lock" size={18} className="mt-0.5 shrink-0 text-muted" />
            <span>
              <span className="font-semibold">Mercato chiuso.</span> Puoi simulare quanto vuoi, ma le proposte si inviano solo a mercato aperto: lo apre un admin.
            </span>
          </p>
        ) : market === null ? (
          <p className="text-sm text-muted">Stato del mercato non disponibile: aggiorna la pagina per proporre lo scambio.</p>
        ) : !inTrade ? (
          <p className="text-sm text-muted">Aggiungi la tua squadra allo scambio per proporlo.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Le altre squadre hanno {settings.tradeProposalHours} ore per accettare o rifiutare; se accettano tutte, lo scambio passa a un admin che lo esegue. La
              proposta la vedono solo le squadre coinvolte e gli admin.
            </p>
            {needsReason && (
              <Callout tone="bad" title={`Fa sforare il cap: ${ev.capBreakers.join(", ")} (R-57)`}>
                Serve l&apos;eccezione del moderatore: spiega perché (luxury tax, soglia di sicurezza, rientro con tagli…). Decide l&apos;admin all&apos;approvazione.
              </Callout>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Messaggio" htmlFor="message" hint="Facoltativo: lo leggono le altre squadre.">
                <textarea id="message" className={inputClass} rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
              {needsReason && (
                <Field label="Richiesta di eccezione al cap" htmlFor="reason" hint="Obbligatoria: la legge l'admin che approva.">
                  <textarea id="reason" className={inputClass} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              )}
            </div>
          </>
        )}

        {outcome?.draftId === draftId && (
          <Callout tone={outcome.ok ? "good" : "bad"} title={outcome.ok ? "Proposta inviata" : "Non inviata"}>
            {outcome.text}
            {outcome.warnings.length > 0 && <div className="mt-1 text-muted">Avvisi: {outcome.warnings.join(" · ")}</div>}
            {outcome.ok && (
              <div className="mt-1">
                <Link href="/scambio?vista=proposte" className="font-semibold underline">
                  Vedi le tue proposte →
                </Link>
              </div>
            )}
          </Callout>
        )}

        {market === true && inTrade && (
          confirming ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-sm font-medium sm:mr-auto">
                Confermi? Mandi a {label} {moves.length} {moves.length === 1 ? "movimento" : "movimenti"}: la proposta resta aperta {settings.tradeProposalHours} ore.
              </span>
              <Button variant="secondary" onClick={() => setConfirmFor(null)} disabled={pending}>
                Annulla
              </Button>
              <Button onClick={submit} pending={pending} icon="swap">
                Sì, invia
              </Button>
            </div>
          ) : (
            <Button className="w-full sm:w-auto" icon="swap" disabled={blocked} onClick={() => setConfirmFor(draftId)}>
              {empty ? "Proponi lo scambio" : `Proponi a ${label}`}
            </Button>
          )
        )}
      </Card>
    </>
  );
}
