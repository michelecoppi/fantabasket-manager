"use client";

import { useState, useTransition } from "react";
import { Callout, Check } from "@/components/controls";
import { Badge, Card } from "@/components/ui";
import { fmt, fmtEuro } from "@/lib/format";
import { setTeamSeason } from "../actions";

export interface FeeTeam {
  id: string;
  name: string;
  payroll: number;
  effectiveCap: number;
  /** luxury tax dovuta in euro (R-12) */
  taxEur: number;
  /** null = riga delle quote non ancora creata */
  version: number | null;
  entryFeePaid: boolean;
  luxuryTaxPaid: boolean;
}
type Outcome = { ok: boolean; text: string } | null;

function TeamFees({ team, onDone }: { team: FeeTeam; onDone: (o: Outcome) => void }) {
  const [pending, start] = useTransition();
  // Stato ottimistico: il valore mostrato è quello appena scelto finché la pagina non si ricarica con il dato salvato.
  const [paid, setPaid] = useState({ fee: team.entryFeePaid, tax: team.luxuryTaxPaid });
  // Ogni salvataggio riuscito alza la versione di 1 (trigger bump_version): la tengo qui per i clic successivi.
  const [version, setVersion] = useState(team.version);
  const save = (next: { fee: boolean; tax: boolean }) => {
    const before = paid;
    setPaid(next);
    start(async () => {
      const r = await setTeamSeason({ teamId: team.id, version, entryFeePaid: next.fee, luxuryTaxPaid: next.tax });
      if (!r.ok) setPaid(before);
      else setVersion((v) => (v ?? 0) + 1);
      onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });
  };
  const owesTax = team.taxEur > 0;

  return (
    <Card className={`border-t-4 p-4 ${owesTax && !paid.tax ? "border-t-brand-red" : "border-t-brand-blue"}`} >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl leading-none font-bold">{team.name}</h2>
        {pending && <span className="text-xs text-muted">salvo…</span>}
      </div>
      <p className="mt-1 text-xs text-muted">Monte ingaggi {fmt(team.payroll)} su {fmt(team.effectiveCap)}</p>
      <div className="mt-2">
        <Check checked={paid.fee} onChange={(v) => save({ ...paid, fee: v })}>Quota di iscrizione pagata</Check>
        <Check checked={paid.tax} disabled={!owesTax} onChange={(v) => save({ ...paid, tax: v })}>
          Luxury tax pagata
        </Check>
      </div>
      <div className="mt-1">
        {owesTax ? (
          <Badge tone={paid.tax ? "good" : "bad"}>{fmtEuro(team.taxEur)} € {paid.tax ? "pagati" : "da pagare"}</Badge>
        ) : (
          <Badge>nessuna luxury tax</Badge>
        )}
      </div>
    </Card>
  );
}

export function QuoteDesk({ teams }: { teams: FeeTeam[] }) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  return (
    <>
      {outcome && !outcome.ok && (
        <div className="mb-4">
          <Callout tone="bad" title="Non salvato">{outcome.text}</Callout>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => <TeamFees key={t.id} team={t} onDone={setOutcome} />)}
      </div>
      {outcome?.ok && <p className="mt-3 text-xs text-muted" role="status">{outcome.text}</p>}
    </>
  );
}
