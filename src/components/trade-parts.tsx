"use client";

import { Badge, Card, StatChange } from "@/components/ui";
import type { Position, Slot, TradeImpact } from "@/lib/cap";
import { fmt } from "@/lib/format";

export interface SimTeam {
  id: string;
  name: string;
  bonus: number;
  cuts: { salary: number }[];
  players: { id: number; name: string; pos: Position | null; slot: Slot; salary: number; version?: number }[];
  picks: { id: number; label: string; year: number; round: number; toConfirm: boolean; version?: number }[];
}

/** Cosa cede una squadra: giocatori (per id contratto) e pick (per id). */
export interface Give {
  players: Set<number>;
  picks: Set<number>;
}
export const emptyGive = (): Give => ({ players: new Set(), picks: new Set() });

function toggle(set: Set<number>, id: number): Set<number> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function TradePicker({ team, give, onChange }: { team: SimTeam; give: Give; onChange: (g: Give) => void }) {
  return (
    <Card className="p-3">
      <h3 className="font-display text-xl font-bold">{team.name} cede</h3>
      <ul className="mt-2 divide-y divide-line">
        {team.players.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
              <input type="checkbox" className="h-5 w-5 accent-[var(--brand-red)]" checked={give.players.has(p.id)} onChange={() => onChange({ ...give, players: toggle(give.players, p.id) })} />
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
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--brand-red)]" checked={give.picks.has(p.id)} onChange={() => onChange({ ...give, picks: toggle(give.picks, p.id) })} />
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

/** Effetto dello scambio su una squadra: monte ingaggi, spazio e riserve prima → dopo. */
export function ImpactCard({ name, impact, give, receive }: { name: string; impact: TradeImpact; give: Give; receive: Give }) {
  const r = impact;
  return (
    <Card className={`border-t-4 p-4 ${r.breaksCap ? "border-t-brand-red" : "border-t-brand-blue"}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-2xl leading-none font-bold">{name}</h3>
        {r.breaksCap ? <Badge tone="bad">fa sforare il cap</Badge> : <Badge tone="good">cap rispettato</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatChange label="Monte ingaggi" before={r.before.payroll} after={r.after.payroll} />
        <StatChange label="Spazio" before={r.before.capSpace} after={r.after.capSpace} worseWhenLower bad={r.after.overCap} />
        <StatChange label="Riserve" before={r.before.reserveSpace} after={r.after.reserveSpace} worseWhenLower />
      </div>
      <p className="mt-2 text-xs text-muted">Pick: {receive.picks.size} in entrata, {give.picks.size} in uscita</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {r.after.belowFloor && <Badge tone="warn" title="Il floor non blocca lo scambio (R-57)">sotto floor ({fmt(r.after.floor)})</Badge>}
        {r.warnings.map((w) => <Badge key={w} title="Composizione della rosa dopo lo scambio">{w}</Badge>)}
      </div>
    </Card>
  );
}
