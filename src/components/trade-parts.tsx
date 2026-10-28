"use client";

import { CapLine } from "@/components/cap-line";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { Badge, PosChip, StatChange } from "@/components/ui";
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
  /** slot con cui i giocatori ceduti arrivano all'altra squadra; senza voce restano come sono */
  slots: Map<number, ArrivalSlotValue>;
}
/** Dove può arrivare un giocatore scambiato: la squadra talenti non si cambia. */
export type ArrivalSlotValue = Exclude<Slot, "talent">;
export const emptyGive = (): Give => ({ players: new Set(), picks: new Set(), slots: new Map() });

/** Seleziona o deseleziona un giocatore; deselezionato, perde anche lo slot di arrivo scelto. */
function togglePlayer(give: Give, id: number): Give {
  const players = toggle(give.players, id);
  const slots = new Map(give.slots);
  if (!players.has(id)) slots.delete(id);
  return { ...give, players, slots };
}

const SLOT_LABEL = { starter: "Titolare", reserve: "Riserva" } as const;

/** Sotto un giocatore ceduto: come entra nell'altra squadra. Scegliere lo slot che ha già equivale a non scegliere. */
function ArrivalSlot({ current, value, onChange, color }: { current: ArrivalSlotValue; value: ArrivalSlotValue; onChange: (slot: ArrivalSlotValue | null) => void; color: string }) {
  return (
    <div role="group" aria-label="Arriva come" className="flex items-center gap-1.5 pr-1 pb-1.5 pl-12 text-xs">
      <span className="text-muted">Arriva come</span>
      {(["starter", "reserve"] as const).map((slot) => {
        const on = value === slot;
        return (
          <button
            key={slot}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(slot === current ? null : slot)}
            className={`min-h-9 rounded-lg border px-2.5 font-semibold transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-gold ${
              on ? "border-transparent text-white" : "border-line hover:border-foreground/40"
            }`}
            style={on ? { background: color } : undefined}
          >
            {SLOT_LABEL[slot]}
          </button>
        );
      })}
    </div>
  );
}

function toggle(set: Set<number>, id: number): Set<number> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Riga selezionabile: il checkbox nativo resta (tastiera e lettori di schermo), la grafica è la casella a destra. */
function ToggleRow({ checked, onChange, color, children }: { checked: boolean; onChange: () => void; color: string; children: React.ReactNode }) {
  return (
    <label
      className={`relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-2.5 py-1.5 transition-[background-color,border-color] ${
        checked ? "border-transparent" : "border-transparent hover:bg-surface-subtle"
      }`}
      style={checked ? { background: `color-mix(in oklab, ${color} 13%, transparent)`, borderColor: `color-mix(in oklab, ${color} 45%, transparent)` } : undefined}
    >
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      {children}
      <span
        aria-hidden
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,transform] peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-focus-visible:ring-offset-2 ${
          checked ? "scale-110 border-transparent text-white" : "border-line text-transparent"
        }`}
        style={checked ? { background: color } : undefined}
      >
        <Icon name="check" size={14} strokeWidth={3} />
      </span>
    </label>
  );
}

export function TradePicker({ team, give, onChange, color = "#1d47b5" }: { team: SimTeam; give: Give; onChange: (g: Give) => void; color?: string }) {
  const out = team.players.filter((p) => give.players.has(p.id)).reduce((n, p) => n + p.salary, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3" style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${color} 14%, transparent), transparent)` }}>
        <TeamCrest name={team.name} color={color} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display truncate text-xl leading-none font-black sm:text-2xl">{team.name}</h3>
          <p className="eyebrow text-muted">cede</p>
        </div>
        <div className="text-right">
          <div className="font-display tnum text-2xl leading-none font-black">{fmt(out)}</div>
          <div className="eyebrow text-muted">
            {give.players.size} gioc. · {give.picks.size} pick
          </div>
        </div>
      </div>
      <ul className="max-h-[28rem] space-y-0.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
        {team.players.map((p) => (
          <li key={p.id}>
            <ToggleRow checked={give.players.has(p.id)} color={color} onChange={() => onChange(togglePlayer(give, p.id))}>
              <PosChip pos={p.pos} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block text-xs text-muted">{p.slot === "reserve" ? "riserva" : "titolare"}</span>
              </span>
              <span className="font-display tnum w-10 text-right text-xl leading-none font-black">{fmt(p.salary)}</span>
            </ToggleRow>
            {give.players.has(p.id) && p.slot !== "talent" && (
              <ArrivalSlot
                current={p.slot}
                value={give.slots.get(p.id) ?? p.slot}
                color={color}
                onChange={(slot) => {
                  const slots = new Map(give.slots);
                  if (slot) slots.set(p.id, slot);
                  else slots.delete(p.id);
                  onChange({ ...give, slots });
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {team.picks.length > 0 && (
        <div className="border-t border-line p-3">
          <h4 className="eyebrow mb-2 flex items-center gap-1.5 text-muted">
            <Icon name="ticket" size={14} />
            Pick
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {team.picks.map((p) => {
              const on = give.picks.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-[background-color,border-color,color] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold ${
                    on ? "border-transparent text-white" : "border-line border-dashed hover:border-foreground/40"
                  }`}
                  style={on ? { background: color } : undefined}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange({ ...give, picks: toggle(give.picks, p.id) })} />
                  {on && <Icon name="check" size={13} strokeWidth={3} />}
                  {p.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Effetto dello scambio su una squadra: monte ingaggi, spazio e riserve prima → dopo. */
export function ImpactCard({ name, impact, give, receive, color = "#1d47b5" }: { name: string; impact: TradeImpact; give: Give; receive: Give; color?: string }) {
  const r = impact;
  return (
    <div className={`pop relative overflow-hidden rounded-2xl border bg-surface p-4 sm:p-5 ${r.breaksCap ? "border-danger/60" : "border-line"}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: r.breaksCap ? "var(--danger)" : color }} />
      <div className="flex items-center gap-3">
        <TeamCrest name={name} color={color} size="sm" />
        <h3 className="font-display min-w-0 flex-1 truncate text-2xl leading-none font-black">{name}</h3>
        {r.breaksCap ? (
          <Badge tone="bad" icon="alert">
            richiede eccezione
          </Badge>
        ) : r.after.overCap ? (
          <Badge tone="warn" icon="flame">
            ancora sopra cap
          </Badge>
        ) : (
          <Badge tone="good" icon="check">
            sotto cap
          </Badge>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatChange label="Monte ingaggi" before={r.before.payroll} after={r.after.payroll} />
        <StatChange label="Spazio" before={r.before.capSpace} after={r.after.capSpace} worseWhenLower bad={r.after.overCap} />
        <StatChange label="Riserve" before={r.before.reserveSpace} after={r.after.reserveSpace} worseWhenLower />
      </div>
      <div className="mt-4">
        <CapLine payroll={r.after.payroll} cap={r.after.effectiveCap} floor={r.after.floor} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="ticket" size={14} />
        Pick: {receive.picks.size} in entrata, {give.picks.size} in uscita
      </p>
      {(r.after.belowFloor || r.warnings.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.after.belowFloor && (
            <Badge tone="warn" title="Il floor non blocca lo scambio (R-57)">
              sotto floor ({fmt(r.after.floor)})
            </Badge>
          )}
          {r.warnings.map((w) => (
            <Badge key={w} title="Composizione della rosa dopo lo scambio">
              {w}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
