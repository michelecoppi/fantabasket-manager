"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Check, Field, inputClass, Segmented } from "@/components/controls";
import { Badge, Card, RestrictionBadge, Stat, StatChange } from "@/components/ui";
import { contractDurations, cutShare, evaluateContractEdit, evaluateSigning, teamFinance, teamOptionAllowed, type LeagueSettings, type Position } from "@/lib/cap";
import { contractLabel } from "@/lib/league";
import { fmt } from "@/lib/format";
import { cutPlayer, finalizeCut, reinstateCut, removeContract, setDurations, updateContract } from "../actions";

export interface RoseTeam {
  id: string;
  name: string;
  bonus: number;
  cuts: RoseCut[];
  players: RosePlayer[];
}
export interface RoseCut {
  id: number;
  version: number;
  name: string;
  status: "pending" | "cut";
  paid: number;
  years: number | null;
  teamOption: boolean;
  /** null = taglio importato dal foglio: non ricorda lo stipendio di partenza */
  originalSalary: number | null;
  originalSlot: "starter" | "reserve" | null;
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
const activeCuts = (team: RoseTeam) => team.cuts.map((c) => ({ salary: c.paid }));
const durationLabel = (y: number | null) => (y === null ? "Da fissare" : y === 0.5 ? "½" : `${y} ${y === 1 ? "anno" : "anni"}`);

function EditPanel({ team, p, settings, onDone }: { team: RoseTeam; p: RosePlayer; settings: LeagueSettings; onDone: (o: Outcome) => void }) {
  const [slot, setSlot] = useState(p.slot);
  const [years, setYears] = useState(p.years);
  const [teamOption, setTeamOption] = useState(p.teamOption);
  const [salary, setSalary] = useState(String(p.salary));
  const [pending, start] = useTransition();
  const optionOk = teamOptionAllowed(years, settings);
  const terms = { slot, years, teamOption: teamOption && optionOk, salary: Number(salary) };
  const ev = evaluateContractEdit(
    { roster: team.players.map((x) => ({ id: x.id, position: x.pos, slot: x.slot, salary: x.salary })), cuts: activeCuts(team), bonus: team.bonus },
    p.id,
    { ...terms, position: p.pos },
    settings,
  );
  const errors = ev.errors;
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
      {errors.length === 0 && !unchanged && ev.warnings.length > 0 && (
        <Callout tone="warn" title="Da controllare (non bloccano)">
          <ul className="list-disc pl-5">{ev.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Callout>
      )}
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
  const before = teamFinance(roster, activeCuts(team), team.bonus, settings);
  const after = teamFinance(
    team.players.filter((x) => x.id !== p.id).map((x) => ({ position: x.pos, slot: x.slot, salary: x.salary })),
    [...activeCuts(team), { salary: share }],
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

function RemovePanel({ team, p, onDone }: { team: RoseTeam; p: RosePlayer; onDone: (o: Outcome) => void }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 border-t border-line bg-brand-red/5 p-4">
      <p className="text-sm">
        <strong>Rimuovi {p.name}</strong> da {team.name} <em>senza</em> pagare nessuna quota: serve solo per correggere un errore (firma sbagliata, giocatore inserito per sbaglio).
        Se la squadra vuole davvero liberarsi del giocatore usa <strong>Taglia</strong>.
      </p>
      <Field label="Motivo" htmlFor={`rm-${p.id}`} hint="Facoltativo: finisce nel registro operazioni.">
        <input id={`rm-${p.id}`} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. firmato per errore" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone(null)} disabled={pending}>Annulla</Button>
        <Button
          variant="danger"
          pending={pending}
          onClick={() =>
            start(async () => {
              const r = await removeContract({ contractId: p.id, version: p.version, reason });
              onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            })
          }
        >
          Rimuovi {p.name}
        </Button>
      </div>
    </div>
  );
}

/** Contratti senza durata (es. ingaggi d'asta, R-51): si fissano tutti insieme, in un'unica operazione. */
function DurationsPanel({ team, settings, onDone }: { team: RoseTeam; settings: LeagueSettings; onDone: (o: Outcome) => void }) {
  const missing = team.players.filter((p) => p.years === null);
  const [chosen, setChosen] = useState<Record<number, number | null>>({});
  const [pending, start] = useTransition();
  if (missing.length === 0) return null;
  const ready = missing.filter((p) => chosen[p.id] != null);
  return (
    <section className="mt-6">
      <h2 className="font-display mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">
        Durate da fissare <span className="text-base font-semibold text-muted">{missing.length}</span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <ul className="divide-y divide-line">
          {missing.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-5 text-center text-xs font-semibold text-muted">{p.pos ?? "?"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="w-11 text-right text-sm tabular-nums">{fmt(p.salary)}</span>
              <select
                className={`${inputClass} !w-32 !py-1.5`}
                aria-label={`Durata di ${p.name}`}
                value={chosen[p.id] ?? ""}
                onChange={(e) => setChosen({ ...chosen, [p.id]: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">—</option>
                {contractDurations(settings).map((y) => <option key={y} value={y}>{durationLabel(y)}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-3 border-t border-line bg-foreground/[0.03] p-3">
          <span className="text-sm text-muted">{ready.length} su {missing.length} scelte</span>
          <Button
            disabled={ready.length === 0}
            pending={pending}
            onClick={() =>
              start(async () => {
                const r = await setDurations(ready.map((p) => ({ contractId: p.id, version: p.version, years: chosen[p.id] ?? null, teamOption: false })));
                if (r.ok) setChosen({});
                onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
              })
            }
          >
            {ready.length === 1 ? "Salva 1 durata" : `Salva ${ready.length} durate`}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">Per aggiungere la team option usa Modifica sul singolo giocatore.</p>
    </section>
  );
}

/** Taglio ancora in attesa: o definitivo (R-42) o il giocatore rientra in rosa. L'asta si registra in Firma. */
function ResolveCutPanel({ team, cut, settings, onDone }: { team: RoseTeam; cut: RoseCut; settings: LeagueSettings; onDone: (o: Outcome) => void }) {
  const [mode, setMode] = useState<"final" | "back">("final");
  const [slot, setSlot] = useState<"starter" | "reserve">(cut.originalSlot ?? "starter");
  const [salary, setSalary] = useState(cut.originalSalary === null ? "" : String(cut.originalSalary));
  const [years, setYears] = useState<number | null>(cut.years);
  const [pending, start] = useTransition();
  const amount = cut.originalSalary ?? (salary === "" ? NaN : Number(salary));
  const roster = team.players.map((x) => ({ id: x.id, position: x.pos, slot: x.slot, salary: x.salary }));
  const ev = Number.isFinite(amount)
    ? evaluateSigning(
        { roster, cuts: team.cuts.filter((c) => c.id !== cut.id).map((c) => ({ salary: c.paid })), bonus: team.bonus },
        { position: null, slot, years, teamOption: false, salary: amount },
        settings,
      )
    : null;
  return (
    <div className="space-y-3 border-t border-line bg-foreground/[0.03] p-4">
      <Segmented
        label="Esito del taglio"
        value={mode}
        onChange={setMode}
        options={[{ value: "final", label: "Taglio definitivo" }, { value: "back", label: "Rientra in rosa" }]}
      />
      {mode === "final" ? (
        <>
          <p className="text-sm">
            Nessuno ha preso <strong>{cut.name}</strong> all&apos;asta (R-41): il posto si libera e {team.name} continua a pagare <strong>{fmt(cut.paid)}</strong> crediti fino a fine contratto (R-42).
          </p>
          <div className="flex justify-end">
            <Button
              variant="danger"
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await finalizeCut({ cutId: cut.id, version: cut.version });
                  onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
                })
              }
            >
              Rendi definitivo
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            <strong>{cut.name}</strong> torna in rosa a {team.name} e la quota di {fmt(cut.paid)} crediti non si paga più.
          </p>
          <Field label="In rosa come">
            <Segmented label="Titolare o riserva" value={slot} onChange={setSlot} options={[{ value: "starter", label: "Titolare" }, { value: "reserve", label: "Riserva" }]} />
          </Field>
          {cut.originalSalary === null ? (
            <Field label="Stipendio (crediti)" htmlFor={`bk-${cut.id}`} hint="Il taglio arriva dal foglio e non ricorda lo stipendio di partenza.">
              <input id={`bk-${cut.id}`} className={inputClass} type="number" inputMode="decimal" min="0.5" step="0.5" value={salary} onChange={(e) => setSalary(e.target.value)} />
            </Field>
          ) : (
            <p className="text-sm text-muted">Stipendio: {fmt(cut.originalSalary)} crediti (come prima del taglio).</p>
          )}
          <Field label="Durata">
            <Segmented
              label="Durata del contratto"
              value={years}
              onChange={setYears}
              options={[{ value: null, label: durationLabel(null) }, ...contractDurations(settings).map((y) => ({ value: y as number | null, label: durationLabel(y) }))]}
            />
          </Field>
          {ev?.errors.map((e) => <Callout key={e} tone="bad">{e}</Callout>)}
          {ev && ev.errors.length === 0 && ev.warnings.length > 0 && (
            <Callout tone="warn" title="Da controllare (non bloccano)">
              <ul className="list-disc pl-5">{ev.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Callout>
          )}
          <div className="flex justify-end">
            <Button
              disabled={!ev || ev.errors.length > 0}
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await reinstateCut({ cutId: cut.id, version: cut.version, slot, salary: Number.isFinite(amount) ? amount : null, years, teamOption: false });
                  onDone(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
                })
              }
            >
              Fai rientrare
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function RoseDesk({ teams, settings }: { teams: RoseTeam[]; settings: LeagueSettings }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [open, setOpen] = useState<{ id: number; mode: "edit" | "cut" | "remove" | "resolve" } | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const team = teams.find((t) => t.id === teamId);
  if (!team) return <p className="text-sm text-muted">Nessuna squadra.</p>;

  const f = teamFinance(team.players.map((x) => ({ position: x.pos, slot: x.slot, salary: x.salary })), activeCuts(team), team.bonus, settings);
  const finish = (o: Outcome) => {
    setOpen(null);
    if (o) setOutcome(o);
  };
  const toggle = (id: number, mode: "edit" | "cut" | "remove" | "resolve") => {
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
                    <Button variant="ghost" className="min-h-9 px-2 text-base hover:text-brand-red" aria-label={`Rimuovi ${p.name} senza quota`} title="Rimuovi (correzione di un errore, nessuna quota)" aria-expanded={open?.id === p.id && open.mode === "remove"} onClick={() => toggle(p.id, "remove")}>✕</Button>
                  </span>
                </div>
                {open?.id === p.id && open.mode === "edit" && <EditPanel key={`${p.id}-${p.version}`} team={team} p={p} settings={settings} onDone={finish} />}
                {open?.id === p.id && open.mode === "remove" && <RemovePanel key={`${p.id}-${p.version}`} team={team} p={p} onDone={finish} />}
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

      <DurationsPanel key={`${team.id}-${team.players.map((p) => p.version).join(",")}`} team={team} settings={settings} onDone={finish} />
      {group("starter", "Titolari")}
      {group("reserve", "Riserve")}

      {team.cuts.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display mb-2 border-l-4 border-brand-red pl-3 text-2xl font-bold">Tagliati</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {team.cuts.map((c) => (
              <li key={c.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1 basis-32 truncate">{c.name}</span>
                  {c.status === "pending" ? (
                    <Badge tone="warn" title="In attesa dell'asta dei tagliati">in asta</Badge>
                  ) : (
                    <Badge title="Taglio definitivo">definitivo</Badge>
                  )}
                  <span className="w-12 text-right tabular-nums">{fmt(c.paid)}</span>
                  {c.status === "pending" && (
                    <Button variant="secondary" className="min-h-9 px-3 text-base" aria-expanded={open?.id === c.id && open.mode === "resolve"} onClick={() => toggle(c.id, "resolve")}>
                      Risolvi
                    </Button>
                  )}
                </div>
                {open?.id === c.id && open.mode === "resolve" && c.status === "pending" && (
                  <ResolveCutPanel key={`${c.id}-${c.version}`} team={team} cut={c} settings={settings} onDone={finish} />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Se un&apos;altra squadra lo prende all&apos;asta dei tagliati registra la firma in <strong>Firma</strong>: il taglio si chiude da solo e l&apos;ex proprietario smette di pagare la quota.
          </p>
        </section>
      )}
    </>
  );
}
