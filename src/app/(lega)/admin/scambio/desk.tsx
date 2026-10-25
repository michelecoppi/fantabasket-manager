"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Field, inputClass } from "@/components/controls";
import { emptyGive, ImpactCard, TradePicker, type Give, type SimTeam } from "@/components/trade-parts";
import { Card } from "@/components/ui";
import { evaluateTrade, type LeagueSettings } from "@/lib/cap";
import { toParty } from "../../scambio/simulator";
import { executeTrade } from "../actions";

type Outcome = { ok: boolean; text: string; warnings: string[] } | null;

/** Elenco leggibile di ciò che una squadra cede. */
function summary(t: SimTeam, g: Give): string[] {
  return [
    ...t.players.filter((p) => g.players.has(p.id)).map((p) => p.name),
    ...t.picks.filter((p) => g.picks.has(p.id)).map((p) => `Pick ${p.year} ${p.round}°`),
  ];
}

function Side({ from, to, items }: { from: string; to: string; items: string[] }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{from} →</div>
      <div className="font-display truncate text-lg leading-tight font-bold">{to}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Niente</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm">
          {items.map((i) => (
            <li key={i} className="truncate">• {i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TradeDesk({ teams, settings }: { teams: SimTeam[]; settings: LeagueSettings }) {
  const [aId, setAId] = useState(teams[0]?.id ?? "");
  const [bId, setBId] = useState(teams[1]?.id ?? "");
  const [giveA, setGiveA] = useState(emptyGive);
  const [giveB, setGiveB] = useState(emptyGive);
  const [approvedBy, setApprovedBy] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, start] = useTransition();

  const a = teams.find((t) => t.id === aId);
  const b = teams.find((t) => t.id === bId);
  if (!a || !b) return <p className="text-sm text-muted">Servono almeno due squadre.</p>;

  const reset = () => {
    setGiveA(emptyGive());
    setGiveB(emptyGive());
    setReason("");
    setConfirming(false);
  };
  const choose = (side: "a" | "b", id: string) => {
    const mine = side === "a" ? { set: setAId, give: setGiveA } : { set: setBId, give: setGiveB };
    const other = side === "a" ? { id: bId, set: setBId } : { id: aId, set: setAId };
    mine.set(id);
    if (id === other.id) other.set(teams.find((t) => t.id !== id)?.id ?? "");
    reset();
    setOutcome(null);
  };
  const edit = (set: (g: Give) => void) => (g: Give) => {
    set(g);
    setConfirming(false);
    setOutcome(null);
  };

  const ev = evaluateTrade(toParty(a, giveA), toParty(b, giveB), settings);
  const empty = giveA.players.size + giveA.picks.size + giveB.players.size + giveB.picks.size === 0;
  const needsReason = ev.capBreakers.length > 0;
  const blocked = empty || ev.errors.length > 0 || (needsReason && !reason.trim());

  const versioned = (t: SimTeam, g: Give) => ({
    contracts: t.players.filter((p) => g.players.has(p.id)).map((p) => ({ id: p.id, version: p.version ?? 0 })),
    picks: t.picks.filter((p) => g.picks.has(p.id)).map((p) => ({ id: p.id, version: p.version ?? 0 })),
  });

  const submit = () =>
    start(async () => {
      const r = await executeTrade({ teamA: a.id, teamB: b.id, aGives: versioned(a, giveA), bGives: versioned(b, giveB), approvedBy, overrideReason: reason });
      setConfirming(false);
      if (r.ok) {
        reset();
        setApprovedBy("");
        setOutcome({ ok: true, text: r.message, warnings: r.warnings });
      } else {
        setOutcome({ ok: false, text: r.error, warnings: [] });
      }
    });

  return (
    <>
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2">
          {([["a", aId, "Prima squadra"], ["b", bId, "Seconda squadra"]] as const).map(([side, value, label]) => (
            <select key={side} className={inputClass} value={value} aria-label={label} onChange={(e) => choose(side, e.target.value)}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TradePicker team={a} give={giveA} onChange={edit(setGiveA)} />
        <TradePicker team={b} give={giveB} onChange={edit(setGiveB)} />
      </div>

      {!empty && (
        <>
          <h2 className="font-display mt-8 mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">Effetto sul cap</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <ImpactCard name={a.name} impact={ev.impacts[0]} give={giveA} receive={giveB} />
            <ImpactCard name={b.name} impact={ev.impacts[1]} give={giveB} receive={giveA} />
          </div>
        </>
      )}

      <h2 className="font-display mt-8 mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">Ufficializza</h2>
      <Card className="space-y-4 p-4">
        {empty ? (
          <p className="text-sm text-muted">Seleziona giocatori o pick da scambiare per vedere il riepilogo.</p>
        ) : (
          <div className="flex items-start gap-3 rounded-md bg-foreground/5 p-3">
            <Side from={a.name} to={b.name} items={summary(a, giveA)} />
            <span aria-hidden className="font-display self-center text-2xl text-accent">⇄</span>
            <Side from={b.name} to={a.name} items={summary(b, giveB)} />
          </div>
        )}

        {ev.errors.map((e) => <Callout key={e} tone="bad">{e}</Callout>)}
        {needsReason && (
          <Callout tone="bad" title={`Fa sforare il cap: ${ev.capBreakers.join(" e ")} (R-57)`}>
            Serve l&apos;eccezione del moderatore, sentito il presidente. Indica la motivazione (luxury tax, soglia di sicurezza, rientro con tagli…).
          </Callout>
        )}
        {ev.warnings.length > 0 && (
          <Callout tone="warn" title="Da controllare (non bloccano)">
            <ul className="list-disc pl-5">{ev.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Callout>
        )}

        {needsReason && (
          <Field label="Motivazione dell'eccezione" htmlFor="reason" hint="Obbligatoria: finisce nel registro dello scambio.">
            <textarea id="reason" className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Field label="Approvato da" htmlFor="approved" hint="Il moderatore che ufficializza lo scambio (R-55), anche se non è admin dell'app. Facoltativo.">
          <input id="approved" className={inputClass} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="es. Amedeo" />
        </Field>

        {outcome && (
          <Callout tone={outcome.ok ? "good" : "bad"} title={outcome.ok ? "Fatto" : "Non registrato"}>
            {outcome.text}
            {outcome.warnings.length > 0 && <div className="mt-1 text-muted">Avvisi: {outcome.warnings.join(" · ")}</div>}
          </Callout>
        )}

        {confirming ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium sm:mr-auto">Confermi? Cambia rose e pick di entrambe le squadre, in un&apos;unica operazione.</span>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>Annulla</Button>
            <Button onClick={submit} pending={pending}>Sì, registra</Button>
          </div>
        ) : (
          <Button className="w-full sm:w-auto" disabled={blocked} onClick={() => setConfirming(true)}>
            Registra lo scambio
          </Button>
        )}
      </Card>
    </>
  );
}
