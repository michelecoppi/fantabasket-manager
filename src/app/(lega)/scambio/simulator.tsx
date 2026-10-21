"use client";

import { useState } from "react";
import { Badge, Card, Stat } from "@/components/ui";
import { tradeImpact, type LeagueSettings, type Position, type Slot } from "@/lib/cap";
import { fmt } from "@/lib/format";

export interface SimTeam {
  id: string;
  name: string;
  bonus: number;
  cuts: { salary: number }[];
  players: { id: number; name: string; pos: Position | null; slot: Slot; salary: number }[];
  picks: { id: number; label: string }[];
}

const control = "w-full rounded border border-line bg-surface px-3 py-2 text-base";

function toggle(set: Set<number>, id: number): Set<number> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Cosa cede una squadra: giocatori (per id contratto) e pick (per id). */
interface Give {
  players: Set<number>;
  picks: Set<number>;
}
const empty = (): Give => ({ players: new Set(), picks: new Set() });

function Picker({ team, give, onChange }: { team: SimTeam; give: Give; onChange: (g: Give) => void }) {
  return (
    <Card className="p-3">
      <h3 className="font-display text-xl font-bold">{team.name} cede</h3>
      <ul className="mt-2 divide-y divide-line">
        {team.players.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 py-1.5">
              <input type="checkbox" className="h-4 w-4" checked={give.players.has(p.id)} onChange={() => onChange({ ...give, players: toggle(give.players, p.id) })} />
              <span className="w-5 text-center text-xs font-semibold text-muted">{p.pos ?? "?"}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted">{p.slot === "reserve" ? "riserva" : "titolare"}</span>
              <span className="w-10 text-right font-medium tabular-nums">{fmt(p.salary)}</span>
            </label>
          </li>
        ))}
      </ul>
      {team.picks.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-medium tracking-wide text-muted uppercase">Pick</h4>
          <ul className="divide-y divide-line">
            {team.picks.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 py-1.5">
                  <input type="checkbox" className="h-4 w-4" checked={give.picks.has(p.id)} onChange={() => onChange({ ...give, picks: toggle(give.picks, p.id) })} />
                  <span className="text-sm">{p.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Result({ team, other, give, receive, settings }: { team: SimTeam; other: SimTeam; give: Give; receive: Give; settings: LeagueSettings }) {
  const incoming = other.players.filter((p) => receive.players.has(p.id)).map((p) => ({ position: p.pos, slot: p.slot, salary: p.salary }));
  const roster = team.players.map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary }));
  const r = tradeImpact({ roster, cuts: team.cuts, bonus: team.bonus }, give.players, incoming, settings);
  const delta = Math.round((r.after.payroll - r.before.payroll) * 10) / 10;
  return (
    <Card className={`border-t-4 p-4 ${r.breaksCap ? "border-t-brand-red" : "border-t-brand-blue"}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-2xl leading-none font-bold">{team.name}</h3>
        {r.breaksCap ? <Badge tone="bad">fa sforare il cap</Badge> : <Badge tone="good">cap rispettato</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Monte ingaggi" value={`${fmt(r.before.payroll)} → ${fmt(r.after.payroll)}`} />
        <Stat label="Spazio" value={`${fmt(r.before.capSpace)} → ${fmt(r.after.capSpace)}`} tone={r.after.overCap ? "bad" : undefined} />
        <Stat label="Riserve" value={`${fmt(r.before.reserveSpace)} → ${fmt(r.after.reserveSpace)}`} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Monte ingaggi {delta > 0 ? "+" : ""}{fmt(delta)} · pick {receive.picks.size} in entrata, {give.picks.size} in uscita
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {r.after.belowFloor && <Badge tone="warn" title="Il floor non blocca lo scambio (R-57)">sotto floor ({fmt(r.after.floor)})</Badge>}
        {r.warnings.map((w) => <Badge key={w} title="Composizione della rosa dopo lo scambio">{w}</Badge>)}
      </div>
    </Card>
  );
}

export function TradeSimulator({ teams, settings }: { teams: SimTeam[]; settings: LeagueSettings }) {
  const [aId, setAId] = useState(teams[0]?.id ?? "");
  const [bId, setBId] = useState(teams[1]?.id ?? "");
  const [giveA, setGiveA] = useState(empty);
  const [giveB, setGiveB] = useState(empty);
  const a = teams.find((t) => t.id === aId);
  const b = teams.find((t) => t.id === bId);
  if (!a || !b) return <p className="text-sm text-muted">Servono almeno due squadre.</p>;

  /** Cambia una delle due squadre; se coincide con l'altra, l'altra passa a una squadra diversa. */
  const choose = (side: "a" | "b", id: string) => {
    const mine = side === "a" ? { set: setAId, give: setGiveA } : { set: setBId, give: setGiveB };
    const other = side === "a" ? { id: bId, set: setBId, give: setGiveB } : { id: aId, set: setAId, give: setGiveA };
    mine.set(id);
    mine.give(empty());
    if (id === other.id) {
      other.set(teams.find((t) => t.id !== id)?.id ?? "");
      other.give(empty());
    }
  };

  const nothing = giveA.players.size + giveA.picks.size + giveB.players.size + giveB.picks.size === 0;
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
        <Picker team={a} give={giveA} onChange={setGiveA} />
        <Picker team={b} give={giveB} onChange={setGiveB} />
      </div>

      <h2 className="font-display mt-8 mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">Effetto sul cap</h2>
      {nothing ? (
        <p className="text-sm text-muted">Seleziona giocatori o pick da scambiare.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Result team={a} other={b} give={giveA} receive={giveB} settings={settings} />
          <Result team={b} other={a} give={giveB} receive={giveA} settings={settings} />
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Assunzioni: i giocatori restano nel ruolo di rosa (titolare/riserva) che avevano; se una squadra è già sopra il cap, lo scambio è accettabile solo se non aumenta il suo monte ingaggi.
        Un moderatore può autorizzare eccezioni (R-57).
      </p>
    </>
  );
}
