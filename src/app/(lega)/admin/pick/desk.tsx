"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Check, inputClass, Segmented } from "@/components/controls";
import { Badge, Card } from "@/components/ui";
import { openPickYear, setPick } from "../actions";

export interface DeskPick {
  id: number;
  version: number;
  year: number;
  round: number;
  originalTeamId: string;
  currentTeamId: string | null;
  toConfirm: boolean;
  note: string;
}
type Team = { id: string; name: string };
type Outcome = { ok: boolean; text: string; warnings: string[] } | null;

function PickRow({ pick, teams, onDone }: { pick: DeskPick; teams: Team[]; onDone: (o: Outcome) => void }) {
  const [owner, setOwner] = useState(pick.currentTeamId ?? "");
  const [toConfirm, setToConfirm] = useState(pick.toConfirm);
  const [pending, start] = useTransition();
  const original = teams.find((t) => t.id === pick.originalTeamId)?.name ?? "?";
  const changed = owner !== (pick.currentTeamId ?? "") || toConfirm !== pick.toConfirm;
  const invalid = owner === "" && !toConfirm;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate font-medium">di {original}</span>
        {pick.note && <span className="block truncate text-xs text-muted">{pick.note}</span>}
      </span>
      <select className={`${inputClass} !w-48 !py-1.5`} aria-label={`Proprietario della pick di ${original}`} value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">Sconosciuto</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <Check checked={toConfirm} onChange={setToConfirm}>da confermare</Check>
      <Button
        className="min-h-11 px-4"
        disabled={!changed || invalid}
        pending={pending}
        onClick={() =>
          start(async () => {
            const r = await setPick({ pickId: pick.id, version: pick.version, teamId: owner || null, toConfirm, note: pick.note });
            onDone(r.ok ? { ok: true, text: r.message, warnings: r.warnings } : { ok: false, text: r.error, warnings: [] });
          })
        }
      >
        Salva
      </Button>
    </li>
  );
}

export function PickDesk({
  picks,
  teams,
  seasonYear,
  openable,
  horizon,
  rounds,
  maxPerRound,
}: {
  picks: DeskPick[];
  teams: Team[];
  seasonYear: number;
  /** draft che si possono ancora aprire (R-34) */
  openable: number[];
  horizon: number;
  rounds: number;
  maxPerRound: number;
}) {
  const years = [...new Set(picks.map((p) => p.year))].sort();
  const [year, setYear] = useState<number>(years.find((y) => y > seasonYear) ?? years[0] ?? seasonYear + 1);
  const [onlyToConfirm, setOnlyToConfirm] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [opening, startOpen] = useTransition();

  const ofYear = picks.filter((p) => p.year === year);
  const toConfirmCount = picks.filter((p) => p.toConfirm).length;
  const perOwner = new Map<string, number>();
  for (const p of ofYear) if (p.currentTeamId) perOwner.set(`${p.currentTeamId}/${p.round}`, (perOwner.get(`${p.currentTeamId}/${p.round}`) ?? 0) + 1);
  const overLimit = [...perOwner].filter(([, n]) => n > maxPerRound);

  return (
    <>
      <Card className="space-y-3 p-3">
        {years.length > 0 && (
          <Segmented label="Anno del draft" value={year} onChange={(y) => { setYear(y); setOutcome(null); }} options={years.map((y) => ({ value: y, label: String(y) }))} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Check checked={onlyToConfirm} onChange={setOnlyToConfirm}>
            Solo da confermare <span className="text-xs text-muted">({toConfirmCount} in tutto)</span>
          </Check>
          {openable.map((y) => (
            <Button
              key={y}
              variant="secondary"
              className="min-h-11"
              pending={opening}
              onClick={() =>
                startOpen(async () => {
                  const r = await openPickYear({ year: y });
                  if (r.ok) setYear(y);
                  setOutcome(r.ok ? { ok: true, text: r.message, warnings: [] } : { ok: false, text: r.error, warnings: [] });
                })
              }
            >
              Apri il draft {y}
            </Button>
          ))}
        </div>
      </Card>

      {outcome && (
        <div className="mt-4">
          <Callout tone={outcome.ok ? "good" : "bad"} title={outcome.ok ? "Fatto" : "Non salvato"}>
            {outcome.text}
            {outcome.warnings.length > 0 && <div className="mt-1 text-muted">Avvisi: {outcome.warnings.join(" · ")}</div>}
          </Callout>
        </div>
      )}
      {overLimit.length > 0 && (
        <div className="mt-4">
          <Callout tone="warn" title="Troppe pick nello stesso giro (R-33)">
            {overLimit.map(([key, n]) => {
              const [teamId, round] = key.split("/");
              return <div key={key}>{teams.find((t) => t.id === teamId)?.name}: {n} pick del {round}° giro (max {maxPerRound})</div>;
            })}
          </Callout>
        </div>
      )}

      {ofYear.length === 0 && <p className="mt-6 text-sm text-muted">Nessuna pick per il {year}. Non si possono aprire più di {horizon} draft in anticipo (R-34).</p>}
      {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => {
        const list = ofYear.filter((p) => p.round === round && (!onlyToConfirm || p.toConfirm));
        if (list.length === 0) return null;
        return (
          <section key={round} className="mt-6">
            <h2 className="font-display mb-2 flex items-center gap-2.5 text-2xl font-extrabold before:h-5 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">
              {round}° giro <span className="text-base font-semibold text-muted">{list.length}</span>
              {list.some((p) => p.toConfirm) && <span className="ml-2 align-middle"><Badge tone="warn">da confermare</Badge></span>}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {list.map((p) => (
                <PickRow key={`${p.id}-${p.version}`} pick={p} teams={teams} onDone={setOutcome} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
