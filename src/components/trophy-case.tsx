import Link from "next/link";
import { AWARD_META } from "@/lib/awards-meta";
import { TeamCrest } from "@/components/crest";
import { fpt, type TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { Scoreboard, stagger } from "@/components/ui";
import { SHAME_KINDS, shelfSummary, TROPHY_KINDS, type AwardKind, type SeasonTrophies, type ShelfSummary, type TrophyWin } from "@/lib/awards";

/*
 * Vetrina stagionale (Fase 6): i premi della giornata vinti da una squadra in tutta la stagione. Una mensola di trofei (una
 * tessera per premio vinto, col numero, l'ultima giornata e il record; il dettaglio per giocatore e giornata in un foglio) e, a
 * parte, la mensola della vergogna coi premi al contrario, che non si sommano. Accanto, la bacheca della lega: chi ha più
 * trofei. Con 100 giornate a stagione le mensole non crescono: cresce solo il numero sulla tessera.
 */

const team = (teams: TeamIndex, id: string) => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };

/** Valore come lo dice il premio: punti del giocatore o della squadra, scarto per gli scontri. */
const val = (kind: AwardKind, v: number) => (kind === "blowout" || kind === "photo_finish" ? `+${fpt(v)}` : fpt(v));

const sheetIdOf = (teamId: string, kind: AwardKind) => `vetrina-${teamId}-${kind}`;

/**
 * Scaffale compatto: icona, nome, «×N», ultima giornata e record. Resta della stessa altezza dalla prima all'ultima delle
 * 100 giornate; tutta la tessera apre il dettaglio (foglio a comparsa).
 */
function Tile({ s, teamId, shame, i }: { s: ShelfSummary; teamId: string; shame: boolean; i: number }) {
  const a = AWARD_META[s.kind];
  const tone = shame ? "bg-danger/10 text-danger" : a.tone === "gold" ? "bg-gold text-nav" : "bg-brand-blue/12 text-brand-blue";
  return (
    <li className="rise min-w-0" style={stagger(i)}>
      <button
        type="button"
        popoverTarget={sheetIdOf(teamId, s.kind)}
        className={`group flex h-full w-full min-w-0 flex-col gap-2 rounded-2xl border bg-surface p-3 text-left transition-colors ${shame ? "border-danger/25 hover:border-danger/50" : "border-gold/50 hover:border-gold"}`}
      >
        <span className="flex w-full items-start gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}>
            <Icon name={a.icon} size={17} strokeWidth={2.2} />
          </span>
          <span className={`font-display tnum ml-auto text-3xl leading-none font-black ${shame ? "text-danger" : "text-highlight"}`}>
            ×{s.count}
            <span className="sr-only"> {s.count === 1 ? "volta" : "volte"}</span>
          </span>
        </span>
        <span className="font-display line-clamp-2 text-base leading-[0.95] font-extrabold">{a.label}</span>
        <span className="mt-auto flex w-full min-w-0 items-center gap-1 text-[0.6875rem] text-muted">
          <span className="truncate">
            ultima G{s.last} · record {val(s.kind, s.record.value)}
          </span>
          <Icon name="chevron" size={13} className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </li>
  );
}

/** Dettaglio di uno scaffale: numeri, chi l'ha portato (giocatori o avversarie) e le giornate, che portano ai premi di quel giorno. */
function ShelfSheet({ s, teamId, teams, shame }: { s: ShelfSummary; teamId: string; teams: TeamIndex; shame: boolean }) {
  const a = AWARD_META[s.kind];
  const id = sheetIdOf(teamId, s.kind);
  const vs = s.kind === "blowout" || s.kind === "photo_finish";
  return (
    <div id={id} popover="auto" role="dialog" aria-labelledby={`${id}-titolo`} className="sheet">
      <div className="arena px-5 pt-3 pb-5 sm:px-6 sm:pt-5">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="relative z-[2] flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${shame ? "bg-danger text-white" : "bg-gold text-nav"}`}>
            <Icon name={a.icon} size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-titolo`} className="font-display text-3xl leading-none font-black">
              {a.label}
            </h2>
            <p className="mt-1 text-xs text-white/65">
              {team(teams, teamId).name} · {a.hint}
            </p>
          </div>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Chiudi"
            className="-mt-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={20} strokeWidth={2.2} />
          </button>
        </div>
        <div className="relative z-[2] mt-4">
          <Scoreboard
            items={[
              { label: "Vinti", value: `×${s.count}`, tone: shame ? "bad" : "gold" },
              { label: "Record", value: val(s.kind, s.record.value) },
              { label: "Ultima", value: `G${s.last}` },
            ]}
          />
        </div>
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {s.groups.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2 text-muted">{vs ? "Contro chi" : "Chi li ha portati"}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {s.groups.map((g) => {
                const other = g.vsTeamId ? team(teams, g.vsTeamId) : null;
                return (
                  <li key={g.key} className="flex min-h-11 items-center gap-2.5 px-3 py-2">
                    {other && <TeamCrest name={other.name} color={other.color} size="xs" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{other ? other.name : g.name}</span>
                    <span className="tnum shrink-0 text-xs text-muted">record {val(s.kind, g.best)}</span>
                    <span className={`font-display tnum w-10 shrink-0 text-right text-xl leading-none font-black ${shame ? "text-danger" : "text-highlight"}`}>×{g.count}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section>
          <h3 className="eyebrow mb-2 text-muted">Giornate</h3>
          <ul className="flex flex-wrap gap-1.5">
            {s.matchdays.map((d) => (
              <li key={d}>
                <Link
                  href={`/classifica?vista=premi&giornata=${d}`}
                  className={`font-display tnum inline-flex min-h-9 min-w-11 items-center justify-center rounded-lg border px-2 text-base leading-none font-extrabold transition-colors hover:border-brand-blue ${
                    d === s.record.matchday ? (shame ? "border-danger/50 text-danger" : "border-gold text-highlight") : "border-line"
                  }`}
                  title={d === s.record.matchday ? "Giornata del record" : undefined}
                >
                  G{d}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Bordo colorato: la giornata del record. Tocca una giornata per vedere tutti i premi di quel turno.</p>
        </section>
      </div>
    </div>
  );
}

/**
 * Una mensola: le tessere dei premi vinti e, in una riga sola, quelli mai vinti (invece di tessere vuote). I fogli del dettaglio
 * stanno fuori dalla griglia.
 */
function Shelf({
  id,
  title,
  aside,
  kinds,
  wins,
  teamId,
  teams,
  shame,
}: {
  id: string;
  title: string;
  aside?: string;
  kinds: AwardKind[];
  wins: TrophyWin[];
  teamId: string;
  teams: TeamIndex;
  shame: boolean;
}) {
  const summaries = kinds.map((k) => shelfSummary(k, wins)).filter((x): x is ShelfSummary => x !== null);
  const never = kinds.filter((k) => !summaries.some((x) => x.kind === k));
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="eyebrow mb-2 flex items-baseline justify-between gap-2 text-muted">
        <span>{title}</span>
        {aside && <span className="tracking-normal normal-case">{aside}</span>}
      </h3>
      {summaries.length > 0 && (
        <ul className={`grid grid-cols-2 gap-2 ${shame ? "" : "sm:grid-cols-3"}`}>
          {summaries.map((x, i) => (
            <Tile key={x.kind} s={x} teamId={teamId} shame={shame} i={i} />
          ))}
        </ul>
      )}
      {never.length > 0 && (
        <p className={`text-xs text-muted ${summaries.length > 0 ? "mt-2" : "rounded-2xl border border-dashed border-line px-3.5 py-3"}`}>
          <span className="font-semibold">{summaries.length > 0 ? "Mai vinti: " : shame ? "Nessuno, per ora: " : "Ancora nessun trofeo: "}</span>
          {never.map((k) => AWARD_META[k].label).join(" · ")}
        </p>
      )}
      {summaries.map((x) => (
        <ShelfSheet key={x.kind} s={x} teamId={teamId} teams={teams} shame={shame} />
      ))}
    </section>
  );
}

export function TrophyCase({ teamId, season, teams, you }: { teamId: string; season: SeasonTrophies; teams: TeamIndex; you: boolean }) {
  const mine = season.teams.get(teamId);
  const trophies = mine?.trophies ?? [];
  const shame = mine?.shame ?? [];
  const board = [...season.teams.values()].sort((a, b) => a.rank - b.rank || b.trophies.length - a.trophies.length || a.shame.length - b.shame.length);
  const top = Math.max(1, ...board.map((c) => c.trophies.length));
  const md = season.matchdays;
  const range = md.length === 0 ? null : md.length === 1 ? `giornata ${md[0]}` : `giornate ${md[0]}–${md[md.length - 1]}`;

  if (md.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-subtle text-muted">
          <Icon name="trophy" size={24} />
        </span>
        <h3 className="font-display mt-3 text-2xl font-extrabold">Vetrina vuota</h3>
        <p className="mt-1 max-w-sm text-sm text-muted">I trofei arrivano quando si chiude la prima giornata.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-8">
        <div className="arena rise flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold text-nav">
            <Icon name="trophy" size={24} strokeWidth={2.2} />
          </span>
          <span>
            <span className="eyebrow block text-white/55">{you ? "I tuoi trofei" : "Trofei"}</span>
            <span className="font-display tnum jumbo block text-5xl leading-none font-black">{trophies.length}</span>
          </span>
          {mine && (
            <span>
              <span className="eyebrow block text-white/55">Nella lega</span>
              <span className="font-display tnum block text-3xl leading-none font-extrabold">{mine.rank}°</span>
            </span>
          )}
          <span className="min-w-0 basis-full text-xs text-white/60 sm:basis-auto sm:flex-1 sm:text-right">
            {range ? `${range[0].toUpperCase()}${range.slice(1)}` : ""} · contano solo le giornate chiuse
          </span>
        </div>

        <Shelf id="mensola-trofei" title="Mensola dei trofei" kinds={TROPHY_KINDS} wins={trophies} teamId={teamId} teams={teams} shame={false} />
        <Shelf id="mensola-vergogna" title="Mensola della vergogna" aside="non conta nei trofei" kinds={SHAME_KINDS} wins={shame} teamId={teamId} teams={teams} shame />

        {season.withoutLineups.length > 0 && (
          <p className="text-xs text-muted">
            {season.withoutLineups.length === 1 ? `La giornata ${season.withoutLineups[0]} non ha` : `Le giornate ${season.withoutLineups.join(", ")} non hanno`} le
            formazioni salvate: valgono solo i premi di squadra e di scontro.
          </p>
        )}
      </div>

      <aside aria-labelledby="bacheca-lega">
        <h3 id="bacheca-lega" className="font-display mb-3 text-2xl leading-none font-extrabold">
          Bacheca della lega
        </h3>
        <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {board.map((c, i) => {
            const t = team(teams, c.teamId);
            const me = c.teamId === teamId;
            return (
              <li key={c.teamId} className={`rise relative ${me ? "bg-gold/8" : ""}`} style={stagger(i)}>
                {me && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gold" />}
                <Link href={`/squadre/${c.teamId}?vista=vetrina`} className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-subtle/60">
                  <span className="font-display tnum w-6 text-center text-2xl leading-none font-black text-muted">{c.rank}</span>
                  <TeamCrest name={t.name} color={t.color} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.name}</span>
                    <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-foreground/10">
                      <span className="meter-fill block h-full rounded-full bg-gold" style={{ width: `${(c.trophies.length / top) * 100}%` }} />
                    </span>
                  </span>
                  <span className="text-right leading-none">
                    <span className="font-display tnum block text-xl font-extrabold">{c.trophies.length}</span>
                    {c.shame.length > 0 && (
                      <span className="tnum inline-flex items-center gap-0.5 text-[0.625rem] font-bold text-danger" title="Premi al contrario: capitano di latta e cucchiaio di legno">
                        <Icon name="mood-sad" size={11} strokeWidth={2.4} />
                        {c.shame.length}
                        <span className="sr-only"> premi al contrario</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
