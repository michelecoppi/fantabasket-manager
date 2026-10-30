import Link from "next/link";
import { AWARD_META } from "@/lib/awards-meta";
import { TeamCrest } from "@/components/crest";
import { fpt, type TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { stagger } from "@/components/ui";
import { SHAME_KINDS, TROPHY_KINDS, type AwardKind, type SeasonTrophies, type TrophyWin } from "@/lib/awards";

/*
 * Vetrina stagionale (Fase 6): i premi della giornata vinti da una squadra in tutta la stagione. Una mensola di trofei (uno
 * scaffale per tipo di premio, col numero di vittorie e le giornate) e, a parte, la mensola della vergogna coi premi al
 * contrario, che non si sommano. Accanto, la bacheca della lega: chi ha più trofei.
 */

const team = (teams: TeamIndex, id: string) => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };

/** Chi ha vinto, in breve: il giocatore, o l'avversaria per i premi di scontro, o niente per i premi di squadra. */
function who(w: TrophyWin, teams: TeamIndex): string {
  if (w.name) return `${w.name} ${fpt(w.value)}`;
  if (w.kind === "blowout" || w.kind === "photo_finish") return `+${fpt(w.value)} su ${team(teams, w.vsTeamId ?? "").name}`;
  return fpt(w.value);
}

function Shelf({ kind, wins, teams, shame, i }: { kind: AwardKind; wins: TrophyWin[]; teams: TeamIndex; shame: boolean; i: number }) {
  const a = AWARD_META[kind];
  const has = wins.length > 0;
  const tone = !has ? "bg-surface-subtle text-muted" : shame ? "bg-danger/10 text-danger" : a.tone === "gold" ? "bg-gold text-nav" : "bg-brand-blue/12 text-brand-blue";
  return (
    <li
      className={`rise flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3.5 ${has ? (shame ? "border-danger/25 bg-surface" : "border-gold/50 bg-surface") : "border-dashed border-line"}`}
      style={stagger(i)}
    >
      <div className="flex items-start gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}>
          <Icon name={a.icon} size={18} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`font-display block text-lg leading-[0.95] font-extrabold ${has ? "" : "text-muted"}`}>{a.label}</span>
        </span>
        <span className={`font-display tnum shrink-0 text-3xl leading-none font-black ${!has ? "text-muted" : shame ? "text-danger" : "text-highlight"}`}>
          {has ? `×${wins.length}` : "–"}
          <span className="sr-only">{has ? ` ${wins.length === 1 ? "volta" : "volte"}` : " nessuno"}</span>
        </span>
      </div>
      {has && (
        <ul className="flex flex-wrap gap-1">
          {wins.map((w) => (
            <li key={`${w.matchday}-${w.name ?? ""}-${w.vsTeamId ?? ""}`}>
              <Link
                href={`/classifica?vista=premi&giornata=${w.matchday}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-subtle/60 py-0.5 pr-2 pl-1 text-[0.6875rem] transition-colors hover:border-brand-blue"
              >
                <span className="font-display tnum rounded-full bg-surface px-1.5 text-xs leading-4 font-black">G{w.matchday}</span>
                <span className="truncate text-muted">{who(w, teams)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
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

        <section aria-labelledby="mensola-trofei">
          <h3 id="mensola-trofei" className="eyebrow mb-2 text-muted">
            Mensola dei trofei
          </h3>
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {TROPHY_KINDS.map((k, i) => (
              <Shelf key={k} kind={k} wins={trophies.filter((t) => t.kind === k)} teams={teams} shame={false} i={i} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="mensola-vergogna">
          <h3 id="mensola-vergogna" className="eyebrow mb-2 flex items-baseline justify-between gap-2 text-muted">
            <span>Mensola della vergogna</span>
            <span className="tracking-normal normal-case">non conta nei trofei</span>
          </h3>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {SHAME_KINDS.map((k, i) => (
              <Shelf key={k} kind={k} wins={shame.filter((t) => t.kind === k)} teams={teams} shame i={i} />
            ))}
          </ul>
        </section>

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
