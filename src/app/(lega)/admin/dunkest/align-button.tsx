"use client";

import { useState, useTransition } from "react";
import { Button, Callout } from "@/components/controls";
import type { ActionResult } from "@/lib/action-result";
import { alignToDunkest } from "../actions";

/** «Allinea» (una squadra) o «Allinea tutte»: titolari e riserve dell'app come la rosa Dunkest, dopo la conferma dell'admin. */
export function AlignButton({ teamIds, label, primary = false }: { teamIds: string[]; label: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-3">
      <Button variant={primary ? "primary" : "secondary"} icon="swap" pending={pending} onClick={() => start(async () => setResult(await alignToDunkest(teamIds)))}>
        {pending ? "Allineo…" : label}
      </Button>
      {result &&
        (result.ok ? (
          <Callout tone={result.warnings.length > 0 ? "warn" : "good"} title={result.message}>
            {result.warnings.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </Callout>
        ) : (
          <Callout tone="bad">{result.error}</Callout>
        ))}
    </div>
  );
}
