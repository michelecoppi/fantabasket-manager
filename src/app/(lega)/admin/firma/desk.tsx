"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Check, Field, inputClass, Segmented } from "@/components/controls";
import type { SimTeam } from "@/components/trade-parts";
import { Badge, Card, PosChip, StatChange } from "@/components/ui";
import { auctionFloor, auctionFloorErrors, contractDurations, evaluateSigning, rookieDurations, teamOptionAllowed, type LeagueSettings } from "@/lib/cap";
import { fmt } from "@/lib/format";
import { filterPlayers, type PlayerListItem } from "@/lib/players";
import { signContract, signTalent } from "../actions";

type Outcome = { ok: boolean; text: string; warnings: string[] } | null;

/** Un giocatore della squadra talenti (R-35): lo firma solo la squadra che lo ha. */
export interface TalentOption {
  id: number;
  teamId: string;
  name: string;
  draftYear: number | null;
  credits: number | null;
  /** giocatore del listone già collegato al talento: alla firma è lui */
  player: PlayerListItem | null;
}

const durationLabel = (y: number | null) => (y === null ? "Da fissare" : y === 0.5 ? "½ stagione" : `${y} ${y === 1 ? "anno" : "anni"}`);
/** Per cercare il giocatore del listone: i nomi dei talenti sono spesso solo il cognome ("T.Johnson"), a volte con l'anno di draft. */
const searchName = (name: string) =>
  name
    .replace(/[\d()?.]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv)$/i.test(w))
    .pop() ?? "";

export function SignDesk({ teams, free, talents, settings }: { teams: SimTeam[]; free: PlayerListItem[]; talents: TalentOption[]; settings: LeagueSettings }) {
  const [source, setSource] = useState<"free" | "talent">("free");
  const [talentId, setTalentId] = useState<number | null>(null);
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

  const fromTalents = source === "talent";
  const talent = fromTalents ? talents.find((t) => t.id === talentId) : undefined;
  // Un talento lo firma solo la sua squadra (R-35): la squadra non si sceglie.
  const team = teams.find((t) => t.id === (fromTalents ? talent?.teamId : teamId));
  const rookie = fromTalents || isRookie;
  const durations = fromTalents ? rookieDurations(settings) : contractDurations(settings);
  const results = q.trim() ? filterPlayers(free, { q, pos: "", nbaTeam: "", owner: "free", sort: "credits" }).slice(0, 8) : [];
  const amount = salary === "" ? NaN : Number(salary);
  const optionOk = teamOptionAllowed(years, settings);

  const ev =
    team && player && Number.isFinite(amount)
      ? evaluateSigning(
          { roster: team.players.map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary })), cuts: team.cuts, bonus: team.bonus },
          { position: player.pos, slot, years, teamOption: teamOption && optionOk, salary: amount, isRookie: rookie },
          settings,
        )
      : null;
  // R-25: minimo d'asta da ultimo contratto (il server lo ricontrolla).
  const floor = player ? auctionFloor(player.lastContract, new Date().toISOString().slice(0, 10), settings) : null;
  const floorErrors = auctionFloorErrors(amount, floor);
  const ready = !!team && !!player && (!fromTalents || !!talent) && !!ev && ev.errors.length === 0 && floorErrors.length === 0;

  const reset = () => {
    setPlayer(null);
    setTalentId(null);
    setQ("");
    setSalary("");
    setYears(null);
    setTeamOption(false);
    setIsRookie(false);
    setUnrestricted(false);
    setNotes("");
  };

  const switchSource = (s: "free" | "talent") => {
    setSource(s);
    reset();
    setOutcome(null);
  };

  const pickPlayer = (p: PlayerListItem) => {
    setPlayer(p);
    setQ("");
    setOutcome(null);
    if (p.credits !== null && salary === "") setSalary(String(p.credits));
  };

  // R-26: stipendio precompilato col valore d'ingresso del talento, modificabile.
  const pickTalent = (id: number | null) => {
    const t = talents.find((x) => x.id === id);
    setTalentId(t?.id ?? null);
    setPlayer(t?.player ?? null);
    setQ(t && !t.player ? searchName(t.name) : "");
    setSalary(t?.credits != null ? String(t.credits) : "");
    setOutcome(null);
  };

  // R-24: con un diritto di pareggio aperto il contratto è unrestricted da solo (lo impone anche il database).
  const hasRight = player?.restrictedTeamId != null;

  const submit = () => {
    if (!team || !player) return;
    start(async () => {
      const terms = { playerId: player.id, slot, years, teamOption: teamOption && optionOk, salary: amount, notes };
      const r =
        fromTalents && talent
          ? await signTalent({ ...terms, talentId: talent.id })
          : await signContract({ ...terms, teamId: team.id, isRookie, unrestricted });
      if (r.ok) {
        setOutcome({ ok: true, text: r.message, warnings: r.warnings });
        reset();
      } else {
        setOutcome({ ok: false, text: r.error, warnings: [] });
      }
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Segmented
          label="Chi firma"
          value={source}
          onChange={switchSource}
          options={[{ value: "free", label: "Giocatore libero" }, { value: "talent", label: "Dalla squadra talenti" }]}
        />
        {fromTalents && (
          <Card className="p-4">
            <h2 className="font-display mb-3 flex items-center gap-2.5 text-2xl font-extrabold before:h-5 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">Talento</h2>
            <Field label="Talento da firmare" htmlFor="talent" hint="Lo firma solo la squadra che lo ha (R-35), con un contratto rookie (R-26).">
              <select id="talent" className={inputClass} value={talentId ?? ""} onChange={(e) => pickTalent(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Scegli…</option>
                {teams.map((t) => {
                  const own = talents.filter((x) => x.teamId === t.id);
                  if (own.length === 0) return null;
                  return (
                    <optgroup key={t.id} label={t.name}>
                      {own.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                          {x.draftYear ? ` · draft ${x.draftYear}` : ""}
                          {x.credits !== null ? ` · ${fmt(x.credits)} cr.` : ""}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </Field>
          </Card>
        )}
        {(!fromTalents || talent) && (
        <Card className="p-4">
          <h2 className="font-display mb-3 flex items-center gap-2.5 text-2xl font-extrabold before:h-5 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">1 · Giocatore</h2>
          {fromTalents && !player && <p className="mb-2 text-xs text-muted">Collega il talento al giocatore del listone: il nome della squadra talenti spesso è solo il cognome.</p>}
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
              {talent?.player ? (
                <Badge tone="accent" title="Il talento è collegato a questo giocatore del listone">collegato</Badge>
              ) : (
                <Button variant="ghost" className="px-2 text-base" onClick={() => setPlayer(null)}>Cambia</Button>
              )}
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
        )}

        <Card className="p-4">
          <h2 className="font-display mb-3 flex items-center gap-2.5 text-2xl font-extrabold before:h-5 before:w-1.5 before:rounded-full before:bg-gold before:content-['']">2 · Contratto</h2>
          <div className="space-y-4">
            {fromTalents ? (
              <Field label="Squadra">
                <p className="flex min-h-11 items-center font-semibold">{team?.name ?? "Scegli prima il talento"}</p>
              </Field>
            ) : (
              <Field label="Squadra" htmlFor="team">
                <select id="team" className={inputClass} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="In rosa come">
              <Segmented
                label="Titolare o riserva"
                value={slot}
                onChange={setSlot}
                options={[{ value: "starter", label: "Titolare" }, { value: "reserve", label: "Riserva" }]}
              />
            </Field>
            <Field
              label="Stipendio (crediti)"
              htmlFor="salary"
              hint={
                fromTalents
                  ? talent?.credits != null
                    ? `Valore d'ingresso del talento: ${fmt(talent.credits)} (R-26). Si può correggere.`
                    : "Il talento non ha un valore d'ingresso: scrivilo tu (R-26)."
                  : player?.credits != null
                    ? `Crediti Dunkest: ${fmt(player.credits)}. Ammessi i mezzi crediti.`
                    : "Ammessi i mezzi crediti (es. 3,5)."
              }
            >
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
                options={[{ value: null, label: durationLabel(null) }, ...durations.map((y) => ({ value: y as number | null, label: durationLabel(y) }))]}
              />
            </Field>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Check checked={teamOption && optionOk} disabled={!optionOk} onChange={setTeamOption}>
                Team option (+1) <span className="text-xs text-muted">solo 1–2 anni</span>
              </Check>
              <Check checked={rookie} disabled={fromTalents} onChange={setIsRookie}>
                Contratto rookie <span className="text-xs text-muted">{fromTalents ? "(r, sempre per un talento)" : "(r)"}</span>
              </Check>
              {(!fromTalents || hasRight) && (
                <Check checked={unrestricted || hasRight} disabled={hasRight || fromTalents} onChange={setUnrestricted}>
                  Unrestricted <span className="text-xs text-muted">{hasRight ? "(u, automatico: diritto di pareggio, R-24)" : "(u)"}</span>
                </Check>
              )}
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
                {/* Con un errore bloccante gli avvisi ripeterebbero gli stessi conteggi di rosa (es. «Titolari: 14/13») come «non bloccano». */}
                {ev.errors.length === 0 && floorErrors.length === 0 && ev.warnings.length > 0 && (
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
          {fromTalents ? "Firma il talento" : "Firma il contratto"}
        </Button>
      </aside>
    </div>
  );
}
