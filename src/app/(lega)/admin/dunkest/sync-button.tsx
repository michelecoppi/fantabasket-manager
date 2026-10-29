"use client";

import { useState, useTransition } from "react";
import { Button, Callout } from "@/components/controls";
import type { ActionResult } from "@/lib/action-result";
import { syncDunkest } from "../actions";

/** "Aggiorna ora": lo stesso aggiornamento del cron delle 9, utile la prima volta o se il job di stamattina è fallito. */
export function DunkestSyncButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-3">
      <Button variant="secondary" icon="download" pending={pending} onClick={() => start(async () => setResult(await syncDunkest()))}>
        {pending ? "Scarico da Dunkest…" : "Aggiorna ora"}
      </Button>
      {result &&
        (result.ok ? (
          <Callout tone={result.warnings.length > 0 ? "warn" : "good"} title={result.message}>
            {result.warnings.join(" ")}
          </Callout>
        ) : (
          <Callout tone="bad">{result.error}</Callout>
        ))}
    </div>
  );
}
