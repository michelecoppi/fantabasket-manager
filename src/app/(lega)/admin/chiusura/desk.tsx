"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Check, inputClass } from "@/components/controls";
import { Badge, Card, Section } from "@/components/ui";
import type { LeagueSettings } from "@/lib/cap";
import { fmt } from "@/lib/format";
import { optionContracts, planSeasonClose, SEASON_CLOSE_ENABLED, type CloseInput } from "@/lib/season-close";
import { closeSeason, type ActionResult } from "../actions";

export function ClosingDesk({ input, settings }: { input: CloseInput; settings: LeagueSettings }) {
  const n = input.teams.length;
  const lotteryN = settings.lotteryTeams;
  const [ranking, setRanking] = useState<string[]>(() => Array(n).fill(""));
  const [lottery, setLottery] = useState<string[]>(() => Array(lotteryN).fill(""));
  const [exercised, setExercised] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const name = (id: string) => input.teams.find((t) => t.id === id)?.name ?? "?";
  const rankingDone = ranking.every(Boolean);
  const bottom = rankingDone ? ranking.slice(n - lotteryN) : [];
  // Se la classifica cambia, le squadre della lottery che non sono più tra le ultime si azzerano.
  const lotteryNow = lottery.map((t) => (bottom.includes(t) ? t : ""));
  const choices = { ranking, lottery: lotteryNow, exercised };
  const plan = planSeasonClose(input, choices, settings);

  const setAt = (list: string[], set: (v: string[]) => void, i: number, v: string) => set(list.map((x, j) => (j === i ? v : x)));
  const options = optionContracts(input.contracts);
  const optionTeams = input.teams.filter((t) => options.some((c) => c.teamId === t.id));
  const toggle = (id: number, on: boolean) => setExercised(on ? [...exercised, id] : exercised.filter((x) => x !== id));
  const restricted = plan.expireContracts.filter((c) => c.restricted);

  const submit = () =>
    start(async () => {
      const r = await closeSeason(choices);
      setResult(r);
      if (r.ok) {
        setRanking(Array(n).fill(""));
        setLottery(Array(lotteryN).fill(""));
        setExercised([]);
        setConfirmed(false);
      }
    });

  return (
    <div className="space-y-6">
      {!SEASON_CLOSE_ENABLED && (
        <Callout tone="warn" title="Chiusura non ancora abilitata">
          Puoi compilare e vedere l&apos;anteprima, ma il pulsante resta bloccato.
        </Callout>
      )}
      {result?.ok && (
        <Callout tone="good" title={result.message}>
          {result.warnings.map((w) => <p key={w}>{w}</p>)}
        </Callout>
      )}
      {result && !result.ok && <Callout tone="bad" title="Non chiusa">{result.error}</Callout>}

      <Section title="1. Classifica finale" aside="dal 1° all'ultimo">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ranking.map((teamId, i) => (
            <label key={i} className="block">
              <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">{i + 1}° posto</span>
              <select className={inputClass} value={teamId} onChange={(e) => setAt(ranking, setRanking, i, e.target.value)}>
                <option value="">Scegli…</option>
                {input.teams.filter((t) => t.id === teamId || !ranking.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Section>

      <Section title="2. Lottery del draft" aside={`ultime ${lotteryN} della classifica`}>
        {rankingDone ? (
          <>
            <p className="mb-2 text-sm text-muted">Estrazione fatta dal vivo: scegli chi ha avuto la 1ª, la 2ª… scelta. Le altre {n - lotteryN} squadre vanno in ordine inverso di classifica.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {lotteryNow.map((teamId, i) => (
                <label key={i} className="block">
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">{i + 1}ª scelta</span>
                  <select className={inputClass} value={teamId} onChange={(e) => setAt(lotteryNow, setLottery, i, e.target.value)}>
                    <option value="">Scegli…</option>
                    {bottom.filter((t) => t === teamId || !lotteryNow.includes(t)).map((t) => <option key={t} value={t}>{name(t)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Prima completa la classifica.</p>
        )}
      </Section>

      <Section title="3. Team option" aside={`${options.length} contratti all'ultimo anno`}>
        {options.length === 0 ? (
          <p className="text-sm text-muted">Nessun contratto con team option all&apos;ultimo anno.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">Spunta le option esercitate (R-22): il contratto dura un anno in più allo stesso stipendio e a fine corsa il giocatore è unrestricted. Le altre scadono da restricted.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {optionTeams.map((t) => (
                <Card key={t.id} className="p-3">
                  <h3 className="font-display text-xl font-bold">{t.name}</h3>
                  {options.filter((c) => c.teamId === t.id).map((c) => (
                    <Check key={c.id} checked={exercised.includes(c.id)} onChange={(v) => toggle(c.id, v)}>{c.name}</Check>
                  ))}
                </Card>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Anteprima">
        {plan.errors.length > 0 && (
          <div className="mb-3">
            <Callout tone="warn" title="Per chiudere">
              <ul className="list-disc pl-5">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Callout>
          </div>
        )}
        {plan.warnings.length > 0 && (
          <div className="mb-3">
            <Callout tone="info" title="Da sapere">
              <ul className="list-disc pl-5">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Callout>
          </div>
        )}

        {plan.teams.length > 0 && (
          <Card className="mb-3 divide-y divide-line">
            {plan.teams.map((t) => (
              <div key={t.teamId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-display w-8 text-xl font-bold text-brand-blue">{t.rank}°</span>
                <span className="min-w-0 flex-1 truncate font-medium">{name(t.teamId)}</span>
                <Badge tone={t.bonus < 0 ? "bad" : t.bonus > 0 ? "good" : "neutral"}>{t.bonus > 0 ? `+${t.bonus}` : t.bonus} crediti</Badge>
                <span className="w-24 text-right text-xs text-muted">cap {fmt(settings.cap + t.bonus)}</span>
              </div>
            ))}
          </Card>
        )}

        {plan.draftOrder.length > 0 && (
          <Card className="mb-3 p-3">
            <h3 className="font-display text-xl font-bold">Draft {plan.newYear}: 1° giro</h3>
            <ol className="mt-1 text-sm">
              {plan.draftOrder.filter((d) => d.round === 1).map((d) => (
                <li key={d.pickNo} className="flex gap-3 py-0.5">
                  <span className="w-6 text-muted tabular-nums">{d.pickNo}</span>
                  <span className="font-medium">{name(d.teamId)}</span>
                  {d.note && <span className="text-muted">{d.note}</span>}
                </li>
              ))}
            </ol>
          </Card>
        )}

        <Card className="p-3 text-sm">
          <p>
            <b>{plan.carryContracts.length}</b> contratti passano al {plan.newYear}, <b>{plan.expireContracts.length}</b> scadono
            ({restricted.length} restricted, {plan.expireContracts.length - restricted.length} unrestricted). Quote dei tagli: {plan.carryCuts.length} continuano, {plan.endCuts.length} finiscono.
          </p>
          {plan.expireContracts.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-brand-blue">Chi esce dalle rose</summary>
              <ul className="mt-1 space-y-0.5">
                {plan.expireContracts.map((c) => (
                  <li key={c.id}>{c.name} <span className="text-muted">({name(c.teamId)}, {c.restricted ? "restricted" : "unrestricted"})</span></li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      </Section>

      <Card className="space-y-2 border-t-4 border-t-brand-red p-4">
        <Check checked={confirmed} onChange={setConfirmed}>Ho controllato: la chiusura non si annulla</Check>
        <Button variant="danger" pending={pending} disabled={!SEASON_CLOSE_ENABLED || !confirmed || plan.errors.length > 0} onClick={submit}>
          Chiudi la stagione {input.seasonYear}
        </Button>
      </Card>
    </div>
  );
}
