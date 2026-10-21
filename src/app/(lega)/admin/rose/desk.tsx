"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Check, Field, inputClass, Segmented } from "@/components/controls";
import { Badge, Card, RestrictionBadge, Stat, StatChange } from "@/components/ui";
import { contractDurations, contractTermsErrors, cutShare, teamFinance, teamOptionAllowed, type LeagueSettings, type Position } from "@/lib/cap";
import { contractLabel } from "@/lib/league";
import { fmt } from "@/lib/format";
import { cutPlayer, updateContract } from "../actions";

export interface RoseTeam {
  id: string;
  name: string;
  bonus: number;
  cuts: { name: string; paid: number }[];
  players: RosePlayer[];
}
export interface RosePlayer {
  id: number;
  version: number;
  name: string;
  pos: Position | null;
  slot: "starter" | "reserve";
  salary: number;
  years: number | null;
  teamOption: boolean;
  rookie: boolean;
  unrestricted: boolean;
}

type Outcome = { ok: boolean; text: string } | null;
const durationLabel = (y: number | null) => (y === null ? "Da fissare" : y === 0.5 ? "½" : `${y} ${y === 1 ? "anno" : "anni"}`);

function EditPanel({ p, settings, onDone }: { p: RosePlayer; settings: LeagueSettings; onDone: (o: Outcome) => void }) {
  const [slot, setSlot] = useState(p.slot);
  const [years, setYears] = useState(p.years);
  const [teamOption, setTeamOption] = useState(p.teamOption);
  const [salary, setSalary] = useState(String(p.salary));
  const [pending, start] = useTransition();
  const optionOk = teamOptionAllowed(years, settings);
  const terms = { slot, years, teamOption: teamOption && optionOk, salary: Number(salary) };
  const errors = contractTermsErrors(terms, settings);
  const unchanged = slot === p.slot && years === p.years && terms.teamOption === p.teamOption && terms.salary === p.salary;

  return (
    <div className="space-y-4 border-t border-line bg-foreground/[0.03] p-4">
      <Field label="In rosa come">
        <Segmented label="Titolare o riserva" value={slot} onChange={setSlot} options={[{ value: "starter", label: "Titolare" }, { value: "reserve", label: "Riserva" }]} />
      </Field>
      <Field label="Durata">
        <Segmented
          label="Durata del contratto"
          value={years}
          onChange={(y) => {
            setYears(y);
            if (!teamOptionAllowed(y, settings)) setTeamOption(false);
          }}
          options={[{ value: null, label: durationLabel(null) }, ...contractDurations(settings).map((y) => ({ value: y as number | null, label: durationLabel(y) }))]}
        />
      </Field>
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <Field label="Stipendio (crediti)" htmlFor={`sal-${p.id}`}>
          <input id={`sal-${p.id}`} className={inputClass} type="number" inputMode="decimal" min="0.5" step="0.5" value={salary} onChange={(e) => setSalary(e.target.value)} />
        </Field>
        <Check checked={teamOption && optionOk} disabled={!optionOk} onChange={setTeamOption}>Team option (+1)</Check>
      </div>
      {errors.map((e) => <Callout key={e} tone="bad">{e}</Callout>)}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone(null)} disabled={pending}>Annulla</Button>
        <Button
          disabled={unchanged || errors.length > 0}
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await updateContract({ contractId: p.id, version: p.version, slot, years, teamOption: terms.teamOption, salary: terms.salary });
              onDone(r.ok ? { ok: true, text: `${p.name}: ${r.message}` } : { ok: false, text: r.error });
            })
          }
        >
          Salva
        </Button>
      </div>
    </div>
  );
}

function CutPanel({ team, p, settings, onDone }: { team: RoseTeam; p: RosePlayer; settings: LeagueSettings; onDone: (o: Outcome) => void }) {
  const [pending, start] = useTransition();
  const share = cutShare(p.salary);
  const roster = team.players.map((x) => ({ position: x.pos, slot: x.slot, salary: x.salary }));
  const before = teamFinance(roster, team.cuts.map((c) => ({ salary: c.paid })), team.bonus, settings);
  const after = teamFinance(
    team.players.filter((x) => x.id !== p.id).map((x) => ({ position: x.pos, slot: x.slot, salary: x.salary })),
    [...team.cuts.map((c) => ({ salary: c.paid })), { salary: share }],
    team.bonus,
    settings,
  );
  return (
    <div className="space-y-3 border-t border-line bg-brand-red/5 p-4">
      <p className="text-sm">
        <strong>{p.name}</strong> va all&apos;asta dei tagliati (R-41). {team.name} paga <strong>{fmt(share)}</strong> crediti, un terzo di {fmt(p.salary)} arrotondato a 0,5 (R-42), fino a fine contratto.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <StatChange label="Monte ingaggi" before={before.payroll} after={after.payroll} />
        <StatChange label="Spazio" before={before.capSpace} after={after.capSpace} worseWhenLower bad={after.overCap} />
        <StatChange label="Riserve" before={before.reserveSpace} after={after.reserveSpace} worseWhenLower />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone(null)} disabled={pending}>Annulla</Button>
        <Button
          variant="danger"
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await cutPlayer({ contractId: p.id, version: p.version });
              onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            })
          }
        >
          Taglia {p.name}
        </Button>
      </div>
    </div>
  );
}

export function RoseDesk({ teams, settings }: { teams: RoseTeam[]; settings: LeagueSettings }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [open, setOpen] = useState<{ id: number; mode: "edit" | "cut" } | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const team = teams.find((t) => t.id === teamId);
  if (!team) return <p className="text-sm text-muted">Nessuna squadra.</p>;

  const f = teamFinance(team.players.map((x) => ({ position: x.pos, slot: x.slot, salary: x.salary })), team.cuts.map((c) => ({ salary: c.paid })), team.bonus, settings);
  const finish = (o: Outcome) => {
    setOpen(null);
    if (o) setOutcome(o);
  };
  const toggle = (id: number, mode: "edit" | "cut") => {
    setOutcome(null);
    setOpen((cur) => (cur?.id === id && cur.mode === mode ? null : { id, mode }));
  };

  const group = (slot: "starter" | "reserve", title: string) => {
    const list = team.players.filter((p) => p.slot === slot);
    return (
      <section className="mt-6">
        <h2 className="font-display mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">
          {title} <span className="text-base font-semibold text-muted">{list.length}</span>
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Nessun giocatore.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {list.map((p) => (
              <li key={p.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="w-5 text-center text-xs font-semibold text-muted">{p.pos ?? "?"}</span>
                  <span className="min-w-0 flex-1 basis-32 truncate font-medium">{p.name}</span>
                  <RestrictionBadge rookie={p.rookie} restriction={p.unrestricted ? "unrestricted" : null} />
                  {p.years === null ? (
                    <Badge tone="warn" title="Durata ancora da fissare">durata?</Badge>
                  ) : (
                    <span className="w-9 text-right text-sm text-muted" title="Anni di contratto">{contractLabel(p.years, p.teamOption)}</span>
                  )}
                  <span className="w-11 text-right font-semibold tabular-nums">{fmt(p.salary)}</span>
                  <span className="flex gap-1.5">
                    <Button variant="secondary" className="min-h-9 px-3 text-base" aria-expanded={open?.id === p.id && open.mode === "edit"} onClick={() => toggle(p.id, "edit")}>Modifica</Button>
                    <Button variant="secondary" className="min-h-9 px-3 text-base hover:border-brand-red hover:text-brand-red" aria-expanded={open?.id === p.id && open.mode === "cut"} onClick={() => toggle(p.id, "cut")}>Taglia</Button>
                  </span>
                </div>
                {open?.id === p.id && open.mode === "edit" && <EditPanel key={`${p.id}-${p.version}`} p={p} settings={settings} onDone={finish} />}
                {open?.id === p.id && open.mode === "cut" && <CutPanel key={`${p.id}-${p.version}`} team={team} p={p} settings={settings} onDone={finish} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <>
      <Card className="p-3">
        <select
          className={inputClass}
          aria-label="Squadra"
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setOpen(null);
            setOutcome(null);
          }}
        >
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Monte ingaggi" value={fmt(f.payroll)} />
          <Stat label="Spazio" value={fmt(f.capSpace)} tone={f.overCap ? "bad" : undefined} />
          <Stat label="Riserve" value={fmt(f.reserveSpace)} />
        </div>
      </Card>

      {outcome && (
        <div className="mt-4">
          <Callout tone={outcome.ok ? "good" : "bad"} title={outcome.ok ? "Fatto" : "Non salvato"}>{outcome.text}</Callout>
        </div>
      )}

      {group("starter", "Titolari")}
      {group("reserve", "Riserve")}

      {team.cuts.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">Tagliati</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {team.cuts.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="w-12 text-right tabular-nums">{fmt(c.paid)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
