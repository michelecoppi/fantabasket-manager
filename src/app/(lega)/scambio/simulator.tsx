"use client";

import { useState } from "react";
import { Callout } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { emptyGive, ImpactCard, TradePicker, type Give, type SimTeam } from "@/components/trade-parts";
import { Empty } from "@/components/ui";
import { evaluateTrade, type LeagueSettings, type TradeParty } from "@/lib/cap";
import { teamColors } from "@/lib/team-colors";

export type { SimTeam };

const control = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base font-semibold outline-none transition-[border-color,box-shadow] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";

export function toParty(t: SimTeam, give: Give): TradeParty {
  return {
    name: t.name,
    side: { roster: t.players.map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary })), cuts: t.cuts, bonus: t.bonus },
    picks: t.picks.map((p) => ({ id: p.id, year: p.year, round: p.round, toConfirm: p.toConfirm })),
    gives: { contracts: give.players, picks: give.picks, slots: give.slots },
  };
}

export function TradeSimulator({ teams, settings }: { teams: SimTeam[]; settings: LeagueSettings }) {
  const [aId, setAId] = useState(teams[0]?.id ?? "");
  const [bId, setBId] = useState(teams[1]?.id ?? "");
  const [giveA, setGiveA] = useState(emptyGive);
  const [giveB, setGiveB] = useState(emptyGive);
  const a = teams.find((t) => t.id === aId);
  const b = teams.find((t) => t.id === bId);
  if (!a || !b) return <p className="text-sm text-muted">Servono almeno due squadre.</p>;
  const colors = teamColors(teams.map((t) => t.id));
  const colorA = colors.get(a.id) ?? "#1d47b5";
  const colorB = colors.get(b.id) ?? "#cf2338";

  /** Cambia una delle due squadre; se coincide con l'altra, l'altra passa a una squadra diversa. */
  const choose = (side: "a" | "b", id: string) => {
    const mine = side === "a" ? { set: setAId, give: setGiveA } : { set: setBId, give: setGiveB };
    const other = side === "a" ? { id: bId, set: setBId, give: setGiveB } : { id: aId, set: setAId, give: setGiveA };
    mine.set(id);
    mine.give(emptyGive());
    if (id === other.id) {
      other.set(teams.find((t) => t.id !== id)?.id ?? "");
      other.give(emptyGive());
    }
  };
  /** Inverte i due lati (selezioni comprese). */
  const flip = () => {
    setAId(bId);
    setBId(aId);
    setGiveA(giveB);
    setGiveB(giveA);
  };

  const nothing = giveA.players.size + giveA.picks.size + giveB.players.size + giveB.picks.size === 0;
  const ev = evaluateTrade(toParty(a, giveA), toParty(b, giveB), settings);
  const side = (label: string, value: string, color: string, onChange: (id: string) => void) => (
    <label className="flex min-w-0 flex-1 items-center gap-3">
      <TeamCrest name={teams.find((t) => t.id === value)?.name ?? "?"} color={color} size="md" />
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-muted">{label}</span>
        <select className={control} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  );

  return (
    <>
      <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:p-4">
        {side("Prima squadra", aId, colorA, (id) => choose("a", id))}
        <button
          type="button"
          onClick={flip}
          aria-label="Inverti le due squadre"
          title="Inverti le due squadre"
          className="mx-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-nav text-gold shadow-lg transition-transform duration-300 hover:rotate-180 active:scale-90 sm:mx-0"
        >
          <Icon name="swap" size={20} strokeWidth={2.2} />
        </button>
        {side("Seconda squadra", bId, colorB, (id) => choose("b", id))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TradePicker team={a} give={giveA} onChange={setGiveA} color={colorA} />
        <TradePicker team={b} give={giveB} onChange={setGiveB} color={colorB} />
      </div>

      <div className="mt-10 mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-nav text-gold">
          <Icon name="coins" size={17} strokeWidth={2} />
        </span>
        <h2 className="font-display text-3xl leading-none font-extrabold">Effetto sul cap</h2>
        <span aria-hidden className="h-px flex-1 bg-linear-to-r from-line to-transparent" />
      </div>
      {nothing ? (
        <Empty title="Prepara lo scambio" icon="swap">
          Seleziona giocatori o pick da scambiare: qui vedi subito payroll, spazio e riserve di entrambe le squadre.
        </Empty>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <div className="grid gap-3 md:grid-cols-2">
            <ImpactCard key={`a-${a.id}`} name={a.name} impact={ev.impacts[0]} give={giveA} receive={giveB} color={colorA} />
            <ImpactCard key={`b-${b.id}`} name={b.name} impact={ev.impacts[1]} give={giveB} receive={giveA} color={colorB} />
          </div>
          {ev.errors.length === 0 && ev.warnings.length === 0 && <Callout tone="good" title="Scambio in regola">Nessun vincolo di cap o di rosa violato per entrambe le squadre.</Callout>}
          {ev.errors.map((error) => (
            <Callout key={error} tone="bad" title="Scambio non registrabile">
              {error}
            </Callout>
          ))}
          {ev.warnings.length > 0 && (
            <Callout tone="warn" title="Da controllare (non bloccano)">
              <ul className="list-disc pl-5">
                {ev.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Callout>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Assunzioni: se non scegli altro, i giocatori arrivano nello stesso slot (titolare/riserva) che avevano; se una squadra è già sopra il cap, lo scambio è
        accettabile solo se non aumenta il suo monte ingaggi. Un moderatore può autorizzare eccezioni (R-57).
      </p>
      <p className="mt-2 text-xs font-semibold text-warning">
        Ogni scambio va fatto anche su Dunkest, titolari e riserve compresi: questa app non modifica le rose Dunkest.
      </p>
    </>
  );
}
