"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Check, Field, inputClass, Segmented } from "@/components/controls";
import type { SimTeam } from "@/components/trade-parts";
import { Badge, Card, PosChip, StatChange } from "@/components/ui";
import { auctionFloor, auctionFloorErrors, contractDurations, evaluateSigning, teamOptionAllowed, type LeagueSettings } from "@/lib/cap";
import { fmt } from "@/lib/format";
import { filterPlayers, type PlayerListItem } from "@/lib/players";
import { signContract } from "../actions";

type Outcome = { ok: boolean; text: string; warnings: string[] } | null;

const durationLabel = (y: number | null) => (y === null ? "Da fissare" : y === 0.5 ? "½ stagione" : `${y} ${y === 1 ? "anno" : "anni"}`);

export function SignDesk({ teams, free, settings }: { teams: SimTeam[]; free: PlayerListItem[]; settings: LeagueSettings }) {
  const [q, setQ] = useState("");
  const [player, setPlayer] = useState<PlayerListItem | null>(null);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [slot, setSlot] = useState<"starter" | "reserve">("starter");
  const [years, setYears] = useState<number | null>(null);
  const [teamOption, setTeamOption] = useState(false);
  const [salary, setSalary] = useState("");
  const [isRookie, setIsRookie] = useState(false);
  const [unrestricted, setUnrestricted] = useState(false);
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, start] = useTransition();

  const team = teams.find((t) => t.id === teamId);
  const results = q.trim() ? filterPlayers(free, { q, pos: "", nbaTeam: "", owner: "free", sort: "credits" }).slice(0, 8) : [];
  const amount = salary === "" ? NaN : Number(salary);
  const optionOk = teamOptionAllowed(years, settings);

  const ev =
    team && player && Number.isFinite(amount)
      ? evaluateSigning(
          { roster: team.players.map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary })), cuts: team.cuts, bonus: team.bonus },
          { position: player.pos, slot, years, teamOption: teamOption && optionOk, salary: amount, isRookie },
          settings,
        )
      : null;
  // R-25: minimo d'asta da ultimo contratto (il server lo ricontrolla).
  const floor = player ? auctionFloor(player.lastContract, new Date().toISOString().slice(0, 10), settings) : null;
  const floorErrors = auctionFloorErrors(amount, floor);
  const ready = !!team && !!player && !!ev && ev.errors.length === 0 && floorErrors.length === 0;

  const pickPlayer = (p: PlayerListItem) => {
    setPlayer(p);
    setQ("");
    setOutcome(null);
    if (p.credits !== null && salary === "") setSalary(String(p.credits));
  };

  // R-24: con un diritto di pareggio aperto il contratto è unrestricted da solo (lo impone anche il database).
  const hasRight = player?.restrictedTeamId != null;

  const submit = () => {
    if (!team || !player) return;
    start(async () => {
      const r = await signContract({
        playerId: player.id,
        teamId: team.id,
        slot,
        years,
        teamOption: teamOption && optionOk,
        salary: amount,
        isRookie,
        unrestricted,
        notes,
      });
      if (r.ok) {
        setOutcome({ ok: true, text: r.message, warnings: r.warnings });
        setPlayer(null);
        setSalary("");
        setYears(null);
        setTeamOption(false);
        setIsRookie(false);
        setUnrestricted(false);
        setNotes("");
      } else {
        setOutcome({ ok: false, text: r.error, warnings: [] });
      }
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="font-display mb-3 flex items-center gap-2.5 text-2xl font-extrabold before:h-5 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">1 · Giocatore</h2>
          {player ? (
            <div className="flex items-center gap-3 rounded-md bg-foreground/5 p-3">
              <PosChip pos={player.pos} />
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-xl leading-tight font-bold">{player.name}</div>
                <div className="text-xs text-muted">
                  {player.nbaTeam ?? "—"} · {player.credits !== null ? `${fmt(player.credits)} crediti Dunkest` : "crediti non indicati"}
                </div>
                {floor && (
                  <div className="text-xs text-muted">
                    Ultimo stipendio {fmt(floor.lastSalary)} · minimo d&apos;asta {fmt(floor.minimum)} fino al {floor.expiresOn} (R-25)
                  </div>
                )}
              </div>
              {player.cutByTeamId && <Badge tone="warn" title="È nell'elenco dei tagliati">tagliato</Badge>}
              <Button variant="ghost" className="px-2 text-base" onClick={() => setPlayer(null)}>Cambia</Button>
            </div>
          ) : (
            <>
              <input
                className={inputClass}
                placeholder="Cerca tra i giocatori liberi…"
                aria-label="Cerca giocatore libero"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
              {q.trim() && (
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line">
                  {results.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nessun giocatore libero con questo nome.</li>}
                  {results.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pickPlayer(p)} className="flex min-h-12 w-full items-center gap-3 px-3 text-left transition hover:bg-foreground/5">
                        <PosChip pos={p.pos} />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-muted">{p.nbaTeam}</span>
                        <span className="w-10 text-right font-medium tabular-nums">{p.credits !== null ? fmt(p.credits) : "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!q.trim() && <p className="mt-2 text-xs text-muted">Scrivi almeno una lettera del nome. Compaiono solo i giocatori senza contratto in questa stagione.</p>}
            </>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-display mb-3 flex items-center gap-2.5 text-2xl font-extrabold before:h-5 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">2 · Contratto</h2>
          <div className="space-y-4">
            <Field label="Squadra" htmlFor="team">
              <select id="team" className={inputClass} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="In rosa come">
              <Segmented
                label="Titolare o riserva"
                value={slot}
                onChange={setSlot}
                options={[{ value: "starter", label: "Titolare" }, { value: "reserve", label: "Riserva" }]}
              />
            </Field>
            <Field label="Stipendio (crediti)" htmlFor="salary" hint={player?.credits != null ? `Crediti Dunkest: ${fmt(player.credits)}. Ammessi i mezzi crediti.` : "Ammessi i mezzi crediti (es. 3,5)."}>
              <input id="salary" className={inputClass} inputMode="decimal" type="number" min="0.5" step="0.5" value={salary} onChange={(e) => setSalary(e.target.value)} />
            </Field>
            <Field label="Durata" hint="Si può fissare anche dopo l'asta (R-51): in Rose potrai completarla.">
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
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Check checked={teamOption && optionOk} disabled={!optionOk} onChange={setTeamOption}>
                Team option (+1) <span className="text-xs text-muted">solo 1–2 anni</span>
              </Check>
              <Check checked={isRookie} onChange={setIsRookie}>Contratto rookie <span className="text-xs text-muted">(r)</span></Check>
              <Check checked={unrestricted || hasRight} disabled={hasRight} onChange={setUnrestricted}>
                Unrestricted <span className="text-xs text-muted">{hasRight ? "(u, automatico: diritto di pareggio, R-24)" : "(u)"}</span>
              </Check>
            </div>
            <Field label="Note" htmlFor="notes">
              <input id="notes" className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Facoltative" />
            </Field>
          </div>
        </Card>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-32 lg:self-start">
        <Card className={`border-t-4 p-4 ${ev && ev.impact.after.overCap ? "border-t-brand-red" : "border-t-brand-blue"}`}>
          <h2 className="font-display text-2xl leading-none font-bold">{team?.name ?? "Squadra"}</h2>
          <p className="mt-1 text-xs text-muted">Effetto della firma</p>
          {ev ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <StatChange label="Monte ingaggi" before={ev.impact.before.payroll} after={ev.impact.after.payroll} />
                <StatChange label="Spazio" before={ev.impact.before.capSpace} after={ev.impact.after.capSpace} worseWhenLower bad={ev.impact.after.overCap} />
                <StatChange label="Riserve" before={ev.impact.before.reserveSpace} after={ev.impact.after.reserveSpace} worseWhenLower />
              </div>
              <div className="mt-3 space-y-2">
                {[...ev.errors, ...floorErrors].map((e) => <Callout key={e} tone="bad">{e}</Callout>)}
                {ev.warnings.length > 0 && (
                  <Callout tone="warn" title="Da controllare (non bloccano)">
                    <ul className="list-disc pl-5">{ev.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  </Callout>
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">Scegli il giocatore e lo stipendio per vedere l&apos;effetto su cap e riserve.</p>
          )}
        </Card>

        {outcome && (
          <Callout tone={outcome.ok ? "good" : "bad"} title={outcome.ok ? "Fatto" : "Non registrato"}>
            {outcome.text}
            {outcome.warnings.length > 0 && <div className="mt-1 text-muted">Avvisi: {outcome.warnings.join(" · ")}</div>}
          </Callout>
        )}
        <Button className="w-full" disabled={!ready} pending={pending} onClick={submit}>
          Firma il contratto
        </Button>
      </aside>
    </div>
  );
}
