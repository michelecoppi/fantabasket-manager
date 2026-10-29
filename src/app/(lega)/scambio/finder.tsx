"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Check, Field, Segmented, inputClass } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import type { SimTeam } from "@/components/trade-parts";
import { Badge, Card, Empty, PosChip } from "@/components/ui";
import type { LeagueSettings, Position } from "@/lib/cap";
import { fmt } from "@/lib/format";
import { teamColors } from "@/lib/team-colors";
import { encodeMoves } from "@/lib/trade-draft";
import { findTrades, type FinderNeed, type FinderOutput, type FinderResult } from "@/lib/trade-finder";

type NeedKind = FinderNeed["kind"];
const NEEDS: { value: NeedKind; label: string }[] = [
  { value: "player", label: "Un giocatore" },
  { value: "role", label: "Un ruolo" },
  { value: "cap", label: "Spazio nel cap" },
  { value: "reserves", label: "Spazio riserve" },
];
const ROLES: { value: Position; label: string }[] = [
  { value: "G", label: "Guardia" },
  { value: "A", label: "Ala" },
  { value: "C", label: "Centro" },
];

/**
 * Cercatore di scambi (Fase 7.4, `/scambio?vista=cerca`): scegli da quale squadra parti, con chi e cosa cerchi; la ricerca
 * (`lib/trade-finder.ts`) gira nel browser sulle rose di adesso. «Usa questa» apre il simulatore già compilato, da cui si
 * ritocca e si propone. Funziona anche senza squadra e a mercato chiuso, come il simulatore.
 */
export function TradeFinder({
  teams,
  settings,
  myTeamId,
  pdk,
}: {
  teams: SimTeam[];
  settings: LeagueSettings;
  myTeamId: string | null;
  /** PDK per id contratto; vuoto se i dati Dunkest non ci sono */
  pdk: Record<number, number>;
}) {
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const [me, setMe] = useState(myTeamId ?? sorted[0]?.id ?? "");
  const [counterpart, setCounterpart] = useState<string>("");
  const [kind, setKind] = useState<NeedKind>("player");
  const [pos, setPos] = useState<Position>("G");
  const [target, setTarget] = useState<number | null>(null);
  const [amount, setAmount] = useState("5");
  const [picks, setPicks] = useState(false);
  // risultato con i criteri per cui vale: cambiandoli sparisce
  const [found, setFound] = useState<{ for: string; out: FinderOutput } | null>(null);
  const [busy, setBusy] = useState(false);

  const colors = teamColors(teams.map((t) => t.id));
  const color = (id: string) => colors.get(id) ?? "#555";
  const byId = new Map(teams.map((t) => [t.id, t]));
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const others = sorted.filter((t) => t.id !== me);
  const pool = others.filter((t) => !counterpart || t.id === counterpart);
  const credits = Number(amount.replace(",", "."));
  const need: FinderNeed | null =
    kind === "player"
      ? target === null
        ? null
        : { kind, contractId: target }
      : kind === "role"
        ? { kind, pos }
        : Number.isFinite(credits) && credits > 0
          ? { kind, amount: credits }
          : null;
  const criteria = JSON.stringify([me, counterpart, need, picks]);
  const out = found?.for === criteria ? found.out : null;

  const search = () => {
    if (!need) return;
    setBusy(true);
    // un giro di rendering per mostrare il pallone che gira, poi la ricerca (sincrona, fino a ~1 s su telefono)
    setTimeout(() => {
      setFound({ for: criteria, out: findTrades({ teams, settings, me, counterpart: counterpart || null, need, picks, pdk }) });
      setBusy(false);
    }, 30);
  };

  const withPdk = Object.keys(pdk).length > 0;

  return (
    <>
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parti da" htmlFor="finder-me">
            <select
              id="finder-me"
              className={inputClass}
              value={me}
              onChange={(e) => {
                setMe(e.target.value);
                if (counterpart === e.target.value) setCounterpart("");
                setTarget(null);
              }}
            >
              {sorted.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.id === myTeamId ? " (la tua)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Con" htmlFor="finder-with">
            <select
              id="finder-with"
              className={inputClass}
              value={counterpart}
              onChange={(e) => {
                setCounterpart(e.target.value);
                setTarget(null);
              }}
            >
              <option value="">Tutta la lega</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <span className="eyebrow mb-1 block text-muted">Cosa cerchi</span>
          <Segmented label="Cosa cerchi" value={kind} options={NEEDS} onChange={setKind} layout="grid grid-cols-2 sm:grid-cols-4" />
        </div>

        {kind === "player" && (
          <Field label="Giocatore" htmlFor="finder-target" hint="Si cerca solo con la sua squadra.">
            <select id="finder-target" className={inputClass} value={target ?? ""} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Scegli un giocatore…</option>
              {pool.map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {t.players
                    .filter((p) => p.slot !== "talent")
                    .sort((a, b) => b.salary - a.salary)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.pos ?? "?"} · {fmt(p.salary)} cr{withPdk && pdk[p.id] !== undefined ? ` · ${fmt(pdk[p.id])} PDK` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        {kind === "role" && (
          <div>
            <span className="eyebrow mb-1 block text-muted">Ruolo</span>
            <Segmented label="Ruolo" value={pos} options={ROLES} onChange={setPos} />
          </div>
        )}
        {(kind === "cap" || kind === "reserves") && (
          <Field
            label="Crediti che ti servono"
            htmlFor="finder-amount"
            hint={
              kind === "cap"
                ? "Cedi almeno un titolare e il tuo monte ingaggi scende: prima gli scambi che liberano almeno questi crediti, dal più equilibrato."
                : `Cedi almeno una riserva e il tuo budget riserve (${fmt(settings.reserveBudget)}) respira: prima gli scambi che liberano almeno questi crediti.`
            }
          >
            <input id="finder-amount" className={`${inputClass} sm:max-w-40`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Check checked={picks} onChange={setPicks}>
            Puoi cedere anche una pick
          </Check>
          <Button icon="search" pending={busy} disabled={!need || !me} onClick={search} className="w-full sm:w-auto">
            Cerca scambi
          </Button>
        </div>
      </Card>

      {out && <Results out={out} me={me} teams={teams} pdk={pdk} withPdk={withPdk} kind={kind} color={color} name={name} />}

      <p className="mt-4 text-xs text-muted">
        Il cercatore prova scambi a due squadre (fino a {kindMax(kind)} giocatori ceduti da te) e tiene solo quelli in regola e senza sforamento del cap per
        nessuno, con le stesse regole del simulatore. L&apos;equilibrio (PDK Dunkest e stipendi) è solo un&apos;indicazione: nessuna regola di lega dice cosa è
        equo.
      </p>
    </>
  );
}

const kindMax = (k: NeedKind) => (k === "player" ? 3 : 2);

function Results({
  out,
  me,
  teams,
  pdk,
  withPdk,
  kind,
  color,
  name,
}: {
  out: FinderOutput;
  me: string;
  teams: SimTeam[];
  pdk: Record<number, number>;
  withPdk: boolean;
  kind: NeedKind;
  color: (id: string) => string;
  name: (id: string) => string;
}) {
  return (
    <section aria-label="Scambi trovati" className="mt-8">
      <h2 className="font-display mb-1 flex items-center gap-2.5 text-3xl leading-none font-extrabold">
        Trovati
        <span className="tnum rounded-full bg-surface-subtle px-2 py-0.5 text-base font-bold text-muted">{out.valid}</span>
      </h2>
      <p className="mb-4 text-sm text-muted">
        {out.valid > out.results.length ? `I ${out.results.length} migliori su ${out.valid} scambi validi` : `${out.valid} scambi validi`}, su{" "}
        {out.tried.toLocaleString("it-IT")} combinazioni provate.
        {out.truncated && " La ricerca si è fermata prima di provarle tutte: restringi con una controparte."}
      </p>
      {out.results.length === 0 ? (
        <Empty title="Nessuno scambio in regola" icon="search">
          Prova con un&apos;altra controparte, con le pick o con un altro bisogno.
        </Empty>
      ) : (
        <ol className="grid gap-3 lg:grid-cols-2">
          {out.results.map((r, i) => (
            <li key={encodeMoves(r.moves) + r.teams[1]} className="min-w-0">
              <ResultCard r={r} rank={i + 1} me={me} teams={teams} pdk={pdk} withPdk={withPdk} kind={kind} color={color} name={name} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");

/** Uno scambio trovato: cosa cedi e cosa ricevi, effetto sulla tua squadra, equilibrio, «Usa questa». */
function ResultCard({
  r,
  rank,
  me,
  teams,
  pdk,
  withPdk,
  kind,
  color,
  name,
}: {
  r: FinderResult;
  rank: number;
  me: string;
  teams: SimTeam[];
  pdk: Record<number, number>;
  withPdk: boolean;
  kind: NeedKind;
  color: (id: string) => string;
  name: (id: string) => string;
}) {
  const other = r.teams[1];
  const players = new Map(teams.flatMap((t) => t.players.map((p) => [p.id, p] as const)));
  const picks = new Map(teams.flatMap((t) => t.picks.map((p) => [p.id, p] as const)));
  const mine = r.ev.impacts[0];
  const href = `/scambio?squadre=${me},${other}&mosse=${encodeMoves(r.moves)}`;

  const side = (to: string) =>
    r.moves
      .filter((m) => m.to === to)
      .map((m) => {
        if (m.kind === "pick") {
          return (
            <li key={`p${m.id}`} className="flex min-h-8 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-subtle text-muted">
                <Icon name="ticket" size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{picks.get(m.id)?.label ?? "Pick"}</span>
            </li>
          );
        }
        const p = players.get(m.id);
        return (
          <li key={`c${m.id}`} className="flex min-h-8 items-center gap-2">
            <PosChip pos={p?.pos ?? null} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{p?.name ?? "?"}</span>
              {(m.to === me ? (m.slot ?? p?.slot) : p?.slot) === "reserve" && (
                <span className="block text-[0.6875rem] leading-tight font-semibold text-brand-blue">{m.to === me ? "arriva come riserva" : "riserva"}</span>
              )}
            </span>
            {withPdk && pdk[m.id] !== undefined && <span className="tnum text-xs font-bold text-brand-blue">{fmt(pdk[m.id])}</span>}
            <span className="font-display tnum w-9 text-right text-base leading-none font-black">{fmt(p?.salary ?? 0)}</span>
          </li>
        );
      });

  const received = side(me);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 pt-3.5">
        <span className="font-display tnum w-6 shrink-0 text-xl font-black text-muted">{rank}</span>
        <span className="flex shrink-0 -space-x-2" aria-hidden>
          <TeamCrest name={name(me)} color={color(me)} size="xs" />
          <TeamCrest name={name(other)} color={color(other)} size="xs" />
        </span>
        <h3 className="font-display min-w-0 flex-1 basis-32 truncate text-lg leading-tight font-black">con {name(other)}</h3>
        {(kind === "cap" || kind === "reserves") && (
          <Badge tone="good" icon="trending-up">
            {signed(r.gain)} {kind === "cap" ? "cap" : "riserve"}
          </Badge>
        )}
        {r.ev.warnings.length > 0 && (
          <Badge tone="warn" icon="alert" title={r.ev.warnings.join(" · ")}>
            {r.ev.warnings.length} {r.ev.warnings.length === 1 ? "avviso" : "avvisi"}
          </Badge>
        )}
      </header>

      <div className="mt-2 grid flex-1 gap-x-4 gap-y-2 px-4 sm:grid-cols-2">
        <div className="min-w-0">
          <h4 className="eyebrow text-muted">Cedi</h4>
          <ul>{side(other)}</ul>
        </div>
        <div className="min-w-0">
          <h4 className="eyebrow text-muted">Ricevi</h4>
          <ul>{received.length ? received : <li className="py-1 text-sm text-muted">Niente</li>}</ul>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line px-4 py-2.5 text-xs">
        <div>
          <dt className="text-muted">Spazio cap</dt>
          <dd className="tnum font-bold">
            {fmt(mine.after.capSpace)} <span className="font-normal text-muted">({signed(Math.round((mine.after.capSpace - mine.before.capSpace) * 10) / 10)})</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Riserve</dt>
          <dd className="tnum font-bold">
            {fmt(mine.after.reserveSpace)} <span className="font-normal text-muted">({signed(Math.round((mine.after.reserveSpace - mine.before.reserveSpace) * 10) / 10)})</span>
          </dd>
        </div>
        <div title="Indicazione, non una regola: ricevuto meno ceduto">
          <dt className="text-muted">Equilibrio</dt>
          <dd className="tnum font-bold">
            {r.pdkDiff !== null ? `${signed(r.pdkDiff)} PDK` : `${signed(r.salaryDiff)} cr`}
            {r.pdkPartial && (
              <span className="font-normal text-muted" title="Qualche giocatore non ha PDK: conta zero">
                {" "}
                *
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <span className="text-xs text-muted">{r.pdkDiff !== null ? `Stipendi ${signed(r.salaryDiff)} cr` : "Senza dati Dunkest"}</span>
        <Link
          href={href}
          className="font-display inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-lg font-extrabold text-brand-blue transition-colors hover:bg-brand-blue/10 dark:text-gold dark:hover:bg-gold/10"
        >
          Usa questa
          <Icon name="arrow-right" size={17} strokeWidth={2.4} />
        </Link>
      </div>
    </article>
  );
}
