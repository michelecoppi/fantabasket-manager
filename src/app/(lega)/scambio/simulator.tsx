"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { emptyGive, ImpactCard, TradePicker, type Give, type SimTeam } from "@/components/trade-parts";
import { evaluateTrade, type LeagueSettings, type TradeParty } from "@/lib/cap";

export type { SimTeam };

const control = "w-full rounded border border-line bg-surface px-3 py-2 text-base";

export function toParty(t: SimTeam, give: Give): TradeParty {
  return {
    name: t.name,
    side: { roster: t.players.map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary })), cuts: t.cuts, bonus: t.bonus },
    picks: t.picks.map((p) => ({ id: p.id, year: p.year, round: p.round, toConfirm: p.toConfirm })),
    gives: { contracts: give.players, picks: give.picks },
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

  const nothing = giveA.players.size + giveA.picks.size + giveB.players.size + giveB.picks.size === 0;
  const ev = evaluateTrade(toParty(a, giveA), toParty(b, giveB), settings);
  return (
    <>
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2">
          <select className={control} value={aId} aria-label="Prima squadra" onChange={(e) => choose("a", e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className={control} value={bId} aria-label="Seconda squadra" onChange={(e) => choose("b", e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TradePicker team={a} give={giveA} onChange={setGiveA} />
        <TradePicker team={b} give={giveB} onChange={setGiveB} />
      </div>

      <h2 className="font-display mt-8 mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">Effetto sul cap</h2>
      {nothing ? (
        <p className="text-sm text-muted">Seleziona giocatori o pick da scambiare.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <ImpactCard name={a.name} impact={ev.impacts[0]} give={giveA} receive={giveB} />
          <ImpactCard name={b.name} impact={ev.impacts[1]} give={giveB} receive={giveA} />
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Assunzioni: i giocatori restano nel ruolo di rosa (titolare/riserva) che avevano; se una squadra è già sopra il cap, lo scambio è accettabile solo se non aumenta il suo monte ingaggi.
        Un moderatore può autorizzare eccezioni (R-57).
      </p>
    </>
  );
}
