"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Button, Segmented } from "@/components/controls";
import { Icon } from "@/components/icons";
import { KindTag, PlanMeter, PlannerLegend, type ValueKind } from "@/components/plan-parts";
import { CapLine } from "@/components/cap-line";
import { PosChip, Section, stagger } from "@/components/ui";
import { edgeMask, useScrollEdges } from "@/components/use-scroll-edges";
import type { LeagueSettings } from "@/lib/cap";
import { BASE_SCENARIO, capPlan, perOpenSlot, type PlannerTeam, type PlanRow, type PlanScenario, type PlanSeason } from "@/lib/cap-planner";
import { fmt } from "@/lib/format";

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");
const sameScenario = (a: PlanScenario, b: PlanScenario) => a.exercised.length === b.exercised.length && a.pendingCutsTaken === b.pendingCutsTaken && a.rank === b.rank;

/**
 * Planner del cap di una squadra (issue #46, P3-03): ipotesi in alto, una carta per stagione, tabellone dei contratti.
 * Gli scenari vivono solo in questa pagina: niente si salva e le regole restano in lib/cap-planner.ts.
 */
export function CapPlanner({ team, seasonYear, settings }: { team: PlannerTeam; seasonYear: number; settings: LeagueSettings }) {
  const [scenario, setScenario] = useState<PlanScenario>(BASE_SCENARIO);
  const base = useMemo(() => capPlan(team, seasonYear, settings), [team, seasonYear, settings]);
  const plan = useMemo(() => capPlan(team, seasonYear, settings, scenario), [team, seasonYear, settings, scenario]);
  const pendingCuts = team.cuts.filter((c) => c.status === "pending").length;
  const active = !sameScenario(scenario, BASE_SCENARIO);
  // Scala comune a tutte le stagioni (e a tutti gli scenari): i meter restano confrontabili quando cambi un'ipotesi.
  const scale = useMemo(() => {
    const all = capPlan(team, seasonYear, settings, { exercised: base.optionIds, pendingCutsTaken: false, rank: 1 });
    return Math.max(...all.seasons.flatMap((s) => [s.cap, s.capRange?.[1] ?? 0, s.payroll + s.unknown])) * 1.04;
  }, [team, seasonYear, settings, base.optionIds]);

  const toggleOption = (id: number) =>
    setScenario((s) => ({ ...s, exercised: s.exercised.includes(id) ? s.exercised.filter((x) => x !== id) : [...s.exercised, id] }));

  return (
    <>
      <ScenarioPanel
        scenario={scenario}
        onChange={setScenario}
        optionIds={base.optionIds}
        pendingCuts={pendingCuts}
        settings={settings}
        active={active}
      />

      {/* Telefono e tablet: carosello con la carta dopo che spunta; da lg una colonna per stagione. */}
      <section
        aria-label="Stagioni"
        className="no-scrollbar -mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0 lg:grid lg:grid-cols-[repeat(var(--n),minmax(0,1fr))] lg:overflow-visible lg:pb-0"
        style={{ "--n": plan.seasons.length } as CSSProperties}
      >
        {plan.seasons.map((s, k) => (
          <SeasonCard key={s.year} i={k} season={s} base={base.seasons[k]} scale={scale} plan={plan.rows} baseCap={settings.cap} startersNeeded={settings.starters.G + settings.starters.A + settings.starters.C} reserveBudget={settings.reserveBudget} />
        ))}
      </section>

      <Section title="Tabellone contratti" icon="grid" id="tabellone" aside={base.optionIds.length > 0 ? "tocca un'option per esercitarla" : undefined}>
        <ContractBoard rows={plan.rows} seasons={plan.seasons} onToggle={toggleOption} />
      </Section>

      <PlannerLegend />
    </>
  );
}

function ScenarioPanel({
  scenario,
  onChange,
  optionIds,
  pendingCuts,
  settings,
  active,
}: {
  scenario: PlanScenario;
  onChange: (s: PlanScenario) => void;
  optionIds: number[];
  pendingCuts: number;
  settings: LeagueSettings;
  active: boolean;
}) {
  const n = scenario.exercised.length;
  const optionMode = n === 0 ? "none" : n === optionIds.length ? "all" : null;
  const bonus = scenario.rank === null ? null : settings.rankBonus[scenario.rank - 1];
  const summary = [
    n > 0 && `${n} ${n === 1 ? "option esercitata" : "option esercitate"}`,
    scenario.rank !== null && `${scenario.rank}° posto ogni anno (bonus ${signed(bonus ?? 0)})`,
    scenario.pendingCutsTaken && "tagli in asta presi da altre squadre",
  ].filter(Boolean);

  return (
    <section aria-labelledby="ipotesi" className="rise overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-blue/10 text-brand-blue dark:bg-nav dark:text-gold">
          <Icon name="sliders" size={17} />
        </span>
        <h2 id="ipotesi" className="font-display min-w-0 flex-1 text-2xl leading-none font-extrabold">
          Ipotesi
        </h2>
        {active && (
          <Button variant="ghost" icon="refresh" className="min-h-9 px-3 text-base" onClick={() => onChange(BASE_SCENARIO)}>
            Azzera
          </Button>
        )}
      </div>

      <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <p className="eyebrow flex items-center gap-2 text-muted">
            Team option <span className="font-normal tracking-normal normal-case">R-22</span>
          </p>
          {optionIds.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nessuna option da decidere in rosa.</p>
          ) : (
            <>
              <div className="mt-1.5">
                <Segmented
                  label="Team option"
                  value={optionMode}
                  onChange={(v) => onChange({ ...scenario, exercised: v === "all" ? optionIds : [] })}
                  options={[
                    { value: "none", label: "Nessuna" },
                    { value: "all", label: `Tutte (${optionIds.length})` },
                  ]}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">{optionMode === null ? `${n} di ${optionIds.length} scelte nel tabellone.` : "Oppure scegli una per una nel tabellone."}</p>
            </>
          )}
        </div>

        <div>
          <p className="eyebrow flex items-center gap-2 text-muted">
            Tagli in asta <span className="font-normal tracking-normal normal-case">R-41/42</span>
          </p>
          {pendingCuts === 0 ? (
            <p className="mt-2 text-sm text-muted">Nessun tagliato in attesa dell&apos;asta.</p>
          ) : (
            <>
              <div className="mt-1.5">
                <Segmented
                  label="Tagli in asta"
                  value={scenario.pendingCutsTaken ? "taken" : "kept"}
                  onChange={(v) => onChange({ ...scenario, pendingCutsTaken: v === "taken" })}
                  options={[
                    { value: "kept", label: "A carico" },
                    { value: "taken", label: "Presi" },
                  ]}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">{pendingCuts === 1 ? "1 tagliato" : `${pendingCuts} tagliati`}: se un&apos;altra squadra li prende, la quota sparisce dalla stagione dopo.</p>
            </>
          )}
        </div>

        <RankPicker value={scenario.rank} bonuses={settings.rankBonus} onChange={(rank) => onChange({ ...scenario, rank })} />
      </div>

      <p
        role="status"
        className={`flex items-start gap-2.5 border-t px-4 py-3 text-sm sm:px-5 ${active ? "border-warning/40 bg-warning/8 text-foreground" : "border-line bg-surface-subtle/50 text-muted"}`}
      >
        <Icon name={active ? "alert" : "info"} size={18} className={`mt-px shrink-0 ${active ? "text-warning" : ""}`} />
        <span>
          {active ? (
            <>
              <strong className="font-semibold">Stai guardando un&apos;ipotesi:</strong> {summary.join(" · ")}. I numeri delle stagioni future non sono ufficiali e non si salvano.
            </>
          ) : (
            <>Scenario neutro: nessuna option esercitata, cap base senza bonus, tagli a carico fino a fine contratto.</>
          )}
        </span>
      </p>
    </section>
  );
}

/** Piazzamento ipotetico in classifica (R-60): un gettone per posizione con il bonus che porta. Scorre su telefono. */
function RankPicker({ value, bonuses, onChange }: { value: number | null; bonuses: number[]; onChange: (r: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mask = edgeMask(useScrollEdges(ref));
  const options = [{ rank: null as number | null, top: "Base", bottom: "±0" }, ...bonuses.map((b, i) => ({ rank: i + 1, top: `${i + 1}°`, bottom: signed(b) }))];
  return (
    <div className="min-w-0 sm:col-span-2 lg:col-span-1">
      <p className="eyebrow flex items-center gap-2 text-muted">
        Piazzamento ogni anno <span className="font-normal tracking-normal normal-case">R-60</span>
      </p>
      <div ref={ref} role="radiogroup" aria-label="Piazzamento ipotetico in classifica" style={{ maskImage: mask }} className="no-scrollbar -mx-1 mt-1.5 flex gap-1 overflow-x-auto px-1 py-0.5">
        {options.map((o) => {
          const on = o.rank === value;
          const tone = o.rank === null ? "" : bonuses[o.rank - 1] > 0 ? "text-success" : bonuses[o.rank - 1] < 0 ? "text-danger" : "";
          return (
            <button
              key={o.top}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.rank === null ? "Cap base, nessun bonus" : `${o.top} posto, bonus ${o.bottom}`}
              onClick={() => onChange(o.rank)}
              className={`flex min-h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-lg border px-2 transition-[background-color,border-color,color] ${
                on ? "border-brand-blue bg-brand-blue text-white dark:border-gold dark:bg-gold dark:text-nav" : "border-line bg-surface hover:border-foreground/40"
              }`}
            >
              <span className="font-display text-lg leading-none font-black">{o.top}</span>
              <span className={`mt-0.5 text-[0.6875rem] leading-none font-bold tnum ${on ? "" : tone || "text-muted"}`}>{o.bottom}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">Cambia il cap delle stagioni future. Oggi vale il bonus reale.</p>
    </div>
  );
}

function SeasonCard({
  season: s,
  base,
  scale,
  plan,
  baseCap,
  startersNeeded,
  reserveBudget,
  i,
}: {
  season: PlanSeason;
  base: PlanSeason;
  scale: number;
  plan: PlanRow[];
  baseCap: number;
  startersNeeded: number;
  reserveBudget: number;
  i: number;
}) {
  const now = s.offset === 0;
  const taken = plan.some((r) => r.cells[s.offset] === "taken");
  const hypothetical = !now && (s.capKind === "hypothetical" || s.options > 0 || taken);
  const delta = Math.round((s.space - base.space) * 10) / 10;
  const over = s.space < 0;
  const perSlot = perOpenSlot(s);
  const spaceKind: ValueKind = hypothetical ? "hyp" : "calc";
  const rows: { label: string; value: number; kind: ValueKind; swatch: string; note?: string }[] = [
    { label: "Titolari", value: s.starters, kind: "nominal", swatch: "bg-brand-blue" },
    ...(s.options > 0 ? [{ label: "Option", value: s.options, kind: "hyp" as const, swatch: "stripes bg-brand-blue/70" }] : []),
    ...(s.cuts > 0 || base.cuts > 0 ? [{ label: "Tagli", value: s.cuts, kind: (taken ? "hyp" : "calc") as ValueKind, swatch: "hatch bg-foreground/25 text-foreground" }] : []),
    ...(s.unknown > 0 ? [{ label: "Da fissare", value: s.unknown, kind: "nominal" as const, swatch: "hatch text-warning ring-1 ring-warning/50 ring-inset", note: "fuori dal totale" }] : []),
  ];

  return (
    <article className="rise relative flex w-[86%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:w-[calc(50%-0.375rem)] sm:p-5 lg:w-auto" style={stagger(i + 1)} aria-labelledby={`stagione-${s.year}`}>
      {now && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-red via-brand-blue to-gold" />}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-muted">{now ? "Oggi" : s.offset === 1 ? "Prossima stagione" : `Tra ${s.offset} stagioni`}</p>
          <h3 id={`stagione-${s.year}`} className="font-display text-5xl leading-[0.85] font-black tnum">
            {s.year}
          </h3>
        </div>
        {!now && (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.1em] text-muted uppercase">
            <Icon name="clock" size={12} />
            Proiezione
          </span>
        )}
      </header>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2 text-muted">
            {over ? "Oltre il cap" : "Spazio"} <KindTag kind={spaceKind} />
          </p>
          <p key={s.space} className={`font-display mt-1 animate-[fade-in_220ms_ease-out] text-[3.25rem] leading-[0.85] font-black tnum ${over ? "text-danger" : ""}`}>
            {over ? "−" : ""}
            {fmt(Math.abs(s.space))}
          </p>
        </div>
        {delta !== 0 && (
          <p key={delta} className={`pop pb-1 text-right text-xs font-bold tnum ${delta < 0 ? "text-danger" : "text-success"}`}>
            {delta < 0 ? "▼" : "▲"} {signed(delta)}
            <span className="block font-normal text-muted">con le ipotesi</span>
          </p>
        )}
      </div>

      <PlanMeter season={s} scale={scale} />

      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${r.swatch}`} />
            <dt className="min-w-0 truncate text-muted">
              {r.label}
              {r.note && <span className="sr-only"> ({r.note})</span>}
            </dt>
            <dd className={`ml-auto font-semibold tnum ${r.note ? "text-muted" : ""}`}>{fmt(r.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs text-muted">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tnum">
            Impegnati <span className="font-semibold text-foreground">{fmt(s.payroll)}</span> su cap <span className="font-semibold text-foreground">{fmt(s.cap)}</span>
            {s.cap !== baseCap && <> (bonus {signed(s.cap - baseCap)})</>}
          </span>
          <KindTag kind={s.capKind === "hypothetical" ? "hyp" : "calc"} />
          {s.capRange && (
            <span className="tnum">
              · col bonus da {fmt(s.capRange[0])} a {fmt(s.capRange[1])}
            </span>
          )}
        </p>
        <p className="tnum">
          <span className="font-semibold text-foreground">
            {s.starterCount}/{startersNeeded}
          </span>{" "}
          titolari sotto contratto
          {s.openSlots > 0 && (
            <>
              {" "}· {s.openSlots} {s.openSlots === 1 ? "posto" : "posti"}
              {perSlot !== null && perSlot > 0 && <> · ~{fmt(perSlot)} a posto</>}
            </>
          )}
        </p>
        <div>
          <p className="mb-1 flex justify-between tnum">
            <span>Riserve</span>
            <span>
              <span className="font-semibold text-foreground">{fmt(s.reserves)}</span> / {fmt(reserveBudget)}
            </span>
          </p>
          <CapLine payroll={s.reserves} cap={reserveBudget} compact />
        </div>
      </div>
    </article>
  );
}

/** Una stagione di una riga: un blocco per stagione (stile tabellone), option come casella da toccare. */
function BoardCell({ row, k, seasons, onToggle }: { row: PlanRow; k: number; seasons: PlanSeason[]; onToggle: (id: number) => void }) {
  const c = row.cells[k];
  const year = seasons[k].year;
  const fill = row.kind === "starter" ? "bg-brand-blue text-white dark:text-nav" : row.kind === "reserve" ? "bg-brand-blue/15 text-foreground ring-1 ring-brand-blue/25 ring-inset" : "hatch bg-foreground/15 text-foreground";
  const money = <span className="font-display text-base leading-none font-extrabold tnum">{fmt(row.salary)}</span>;

  if (c === "option-off" || c === "option") {
    const on = c === "option";
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`Team option di ${row.name} per il ${year}: ${on ? "esercitata" : "non esercitata"}`}
        onClick={() => onToggle(row.id)}
        className={
          on
            ? `pop stripes mx-1 flex h-9 w-[calc(100%-0.5rem)] items-center justify-center gap-1 rounded-lg ${row.kind === "starter" ? "bg-brand-blue/80 text-white dark:text-nav" : "bg-brand-blue/35 text-foreground"}`
            : "mx-1 flex h-9 w-[calc(100%-0.5rem)] items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-brand-blue/55 text-[0.6875rem] font-bold tracking-wide text-brand-blue uppercase transition-[background-color,border-color] hover:border-brand-blue hover:bg-brand-blue/8"
        }
      >
        {on ? (
          <>
            <Icon name="check" size={14} strokeWidth={3} />
            {money}
          </>
        ) : (
          <>
            <Icon name="plus" size={13} strokeWidth={2.6} />
            <span className="sm:hidden">1</span>
            <span className="hidden sm:inline">Option</span>
          </>
        )}
      </button>
    );
  }
  if (c === "full" || c === "taken") {
    return (
      <span className={`mx-1 flex h-9 items-center justify-center rounded-lg ${fill} ${c === "taken" ? "line-through opacity-40" : ""}`}>
        {money}
        <span className="sr-only">
          {" "}crediti nel {year}
          {c === "taken" ? ", preso all'asta in questa ipotesi" : ""}
        </span>
      </span>
    );
  }
  if (c === "half") {
    return (
      <span className="flex h-9 items-center">
        <span className={`ml-1 flex h-full w-1/2 min-w-10 items-center justify-center rounded-lg ${fill}`}>{money}</span>
        <span className="ml-1 text-[0.6875rem] font-bold text-muted">½</span>
        <span className="sr-only"> crediti, mezza stagione</span>
      </span>
    );
  }
  if (c === "unknown") {
    return (
      <span title="Durata da fissare" className="hatch mx-1 flex h-9 items-center justify-center rounded-lg text-sm font-bold text-warning ring-1 ring-warning/45 ring-inset">
        ?<span className="sr-only"> durata da fissare nel {year}</span>
      </span>
    );
  }
  // Prima stagione libera dopo il contratto: come esce il giocatore (R-23).
  if (row.exit && row.exit.year + 1 === year) {
    return (
      <span className="flex h-9 items-center justify-center">
        <span
          title={row.exit.restricted ? "Restricted: puoi pareggiare l'offerta più alta (R-23)" : "Unrestricted: va libero (R-23/R-24)"}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide uppercase ${
            row.exit.restricted ? "border-brand-blue/40 text-brand-blue" : "border-line text-muted"
          }`}
        >
          <Icon name={row.exit.restricted ? "refresh" : "logout"} size={11} strokeWidth={2.6} />
          <span className="sm:hidden">{row.exit.restricted ? "RFA" : "UFA"}</span>
          <span className="hidden sm:inline">{row.exit.restricted ? "Pareggio" : "Libero"}</span>
        </span>
      </span>
    );
  }
  return <span aria-hidden className="block h-9" />;
}

function ContractBoard({ rows, seasons, onToggle }: { rows: PlanRow[]; seasons: PlanSeason[]; onToggle: (id: number) => void }) {
  const groups = [
    { kind: "starter" as const, title: "Titolari" },
    { kind: "reserve" as const, title: "Riserve" },
    { kind: "cut" as const, title: "Quote dei tagli" },
  ].map((g) => ({ ...g, rows: rows.filter((r) => r.kind === g.kind) })).filter((g) => g.rows.length > 0);
  let n = 0;

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[21rem] table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Contratti per stagione: stipendi, team option da esercitare, durate da fissare e uscita a fine contratto</caption>
        <colgroup>
          <col className="w-[8.75rem] sm:w-60 lg:w-72" />
          {seasons.map((s) => (
            <col key={s.year} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="eyebrow sticky left-0 z-[2] bg-surface px-3 py-2.5 text-left text-muted sm:px-4">
              Giocatore
            </th>
            {seasons.map((s) => (
              <th key={s.year} scope="col" className="px-1 py-2.5 text-center">
                <span className="font-display block text-xl leading-none font-black tnum">{s.year}</span>
                <span className="eyebrow text-muted">{s.offset === 0 ? "oggi" : "proiez."}</span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.kind}>
            <tr>
              <th scope="rowgroup" colSpan={seasons.length + 1} className="eyebrow sticky left-0 border-t border-line bg-surface-subtle/70 px-3 py-1.5 text-left text-muted sm:px-4">
                {g.title} · {g.rows.length}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="rise group" style={stagger(n++)}>
                <th scope="row" className="sticky left-0 z-[1] border-t border-line/60 bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface-subtle sm:px-4">
                  <span className="flex min-w-0 items-center gap-2">
                    {r.kind === "cut" ? (
                      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-dashed border-line text-muted">
                        <Icon name="x" size={14} />
                      </span>
                    ) : (
                      <PosChip pos={r.pos} />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block truncate text-[0.6875rem] text-muted">
                        {r.kind === "cut" ? (r.pending ? "in asta" : "taglio definitivo") : `contratto ${r.label}`}
                        {r.rookie && " · rookie"}
                      </span>
                    </span>
                  </span>
                </th>
                {seasons.map((s, k) => (
                  <td key={s.year} className="border-t border-line/60 px-0 py-1.5">
                    <BoardCell row={r} k={k} seasons={seasons} onToggle={onToggle} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th scope="row" className="sticky left-0 z-[1] border-t-2 border-foreground/15 bg-surface px-3 py-2.5 text-left sm:px-4">
              <span className="eyebrow text-muted">Monte ingaggi</span>
            </th>
            {seasons.map((s) => (
              <td key={s.year} className="border-t-2 border-foreground/15 px-1 py-2.5 text-center">
                <span className="font-display text-xl leading-none font-black tnum">{fmt(s.payroll)}</span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 pb-3 text-left sm:px-4">
              <span className="eyebrow text-muted">Spazio</span>
            </th>
            {seasons.map((s) => (
              <td key={s.year} className="px-1 pb-3 text-center">
                <span className={`font-display text-xl leading-none font-black tnum ${s.space < 0 ? "text-danger" : "text-success"}`}>{signed(s.space)}</span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
