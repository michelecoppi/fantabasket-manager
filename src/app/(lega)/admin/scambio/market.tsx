"use client";

import { useState, useTransition } from "react";
import { Button, Callout } from "@/components/controls";
import { Badge, Card } from "@/components/ui";
import { setTradeMarket } from "../actions";

type Outcome = { ok: boolean; text: string } | null;

/**
 * Interruttore del mercato degli scambi (Fase 7.1). Decide se le squadre possono proporre scambi tra loro; gli scambi
 * registrati da qui sotto restano sempre possibili (R-55: il moderatore ufficializza). `open` null = stato non letto.
 */
export function MarketSwitch({ open }: { open: boolean | null }) {
  // Stato ottimistico: mostra subito la scelta, torna indietro se la RPC rifiuta.
  const [value, setValue] = useState(open);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    if (value === null) return;
    const before = value;
    const next = !value;
    setValue(next);
    start(async () => {
      const r = await setTradeMarket({ open: next });
      if (!r.ok) setValue(before);
      setOutcome(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });
  };

  return (
    <Card className="mb-8 space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl leading-none font-bold">Mercato degli scambi</h2>
            {value === null ? <Badge>non disponibile</Badge> : value ? <Badge tone="good" icon="check">aperto</Badge> : <Badge icon="lock">chiuso</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            Da aperto, le squadre possono proporsi scambi dall&apos;app. Gli scambi registrati qui sotto da un admin valgono sempre.
          </p>
        </div>
        {value !== null && (
          <Button variant={value ? "secondary" : "gold"} icon={value ? "lock" : "swap"} pending={pending} onClick={toggle} className="shrink-0">
            {value ? "Chiudi il mercato" : "Apri il mercato"}
          </Button>
        )}
      </div>
      {value === null && <Callout tone="warn">Non riesco a leggere lo stato del mercato: aggiorna la pagina. Se resta così, il database non ha ancora la migrazione del mercato.</Callout>}
      {outcome && <Callout tone={outcome.ok ? "good" : "bad"}>{outcome.text}</Callout>}
    </Card>
  );
}
