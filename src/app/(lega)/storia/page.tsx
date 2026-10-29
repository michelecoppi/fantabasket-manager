import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { ChampionRing, fmtPts, HistoryTeam, LeagueTabs, RingRow } from "@/components/history";
import { Icon } from "@/components/icons";
import { Badge, Empty, PageTitle, Scoreboard, Section, stagger } from "@/components/ui";
import { sameName, seasonLabel, winPct, type Career, type Former, type SeasonTable } from "@/lib/league-history";
import { loadHistory, loadLeague, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

const FORMER_COLOR = "var(--muted)";

const record = (r: { wins: number; draws: number; losses: number }) => (r.draws ? `${r.wins}–${r.draws}–${r.losses}` : `${r.wins}–${r.losses}`);
const pct = (r: { wins: number; draws: number; losses: number }) => {
  const p = winPct(r);
  return p === null ? "–" : `${(p * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
};
const span = (years: number[]) => (years.length === 1 ? seasonLabel(years[0]) : `${seasonLabel(years[0])} – ${seasonLabel(years[years.length - 1])}`);

/** Muro degli anelli: una colonna per stagione, dalla più vecchia, il campione più recente in evidenza. */
function RingWall({ seasons, color }: { seasons: SeasonTable[]; color: (teamId: string | null) => string }) {
  const chrono = [...seasons].reverse();
  return (
    <ol className="arena grid grid-cols-2 gap-px overflow-hidden rounded-3xl md:grid-cols-4">
      {chrono.map((s, i) => {
        const c = s.champion;
        const latest = i === chrono.length - 1;
        return (
          <li key={s.year} className="relative z-[2] flex flex-col items-center px-3 pt-6 pb-5 text-center">
            <span className="eyebrow text-white/55">{seasonLabel(s.year)}</span>
            {c ? (
              <>
                <span className="pop mt-3 mb-2" style={stagger(i)}>
                  <ChampionRing name={c.teamName} color={color(c.teamId)} year={s.year} size="lg" className="sm:hidden" />
                  <ChampionRing name={c.teamName} color={color(c.teamId)} year={s.year} size="xl" className="hidden sm:block" />
                </span>
                {c.teamId ? (
                  <Link href={`/squadre/${c.teamId}?vista=vetrina`} className="font-display line-clamp-2 text-2xl leading-[0.95] font-black text-white hover:underline">
                    {c.teamName}
                  </Link>
                ) : (
                  <span className="font-display line-clamp-2 text-2xl leading-[0.95] font-black text-white/70">{c.teamName}</span>
                )}
                <span className="font-display tnum mt-1.5 text-lg leading-none font-extrabold text-highlight">{record(c)}</span>
                <span className="mt-1 text-xs text-white/55">{fmtPts(c.totalPts)} punti</span>
                {latest && c.teamId && <span className="mt-2 text-[0.6875rem] font-bold tracking-wide text-highlight uppercase">Campioni in carica</span>}
                {!c.teamId && <span className="mt-2 text-[0.6875rem] font-bold tracking-wide text-white/50 uppercase">non più in lega</span>}
              </>
            ) : (
              <span className="mt-6 text-sm text-white/55">Campione non registrato</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Carriere delle squadre di oggi: tabella su desktop, righe a due piani su telefono. */
function Careers({ careers, names, color, myTeamId, currentYear }: { careers: Career[]; names: Map<string, string>; color: (teamId: string | null) => string; myTeamId: string | null; currentYear: number }) {
  const head = "eyebrow text-muted";
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="hidden items-center gap-4 border-b border-line bg-surface-subtle/60 px-4 py-2 md:flex">
        <span className={`${head} flex-1`}>Squadra</span>
        <span className={`${head} w-20 text-center`}>In lega dal</span>
        <span className={`${head} w-16 text-center`}>Stagioni</span>
        <span className={`${head} w-24 text-center`}>Migliore</span>
        <span className={`${head} w-36`}>Anelli</span>
        <span className={`${head} w-28 text-right`}>V–P totali</span>
      </div>
      <ol>
        {careers.map((c, i) => {
          const name = names.get(c.teamId) ?? "?";
          const mine = c.teamId === myTeamId;
          const best = c.best ? `${c.best.position}°${c.best.years.length > 1 ? ` ×${c.best.years.length}` : ""}` : "–";
          const bestSub = c.best ? c.best.years.map(seasonLabel).join(", ") : "nessuna stagione conclusa";
          const sub = c.replaced.length ? `al posto di ${c.replaced.map((r) => r.name).join(" e ")}` : undefined;
          return (
            <li key={c.teamId} className={`rise relative border-t border-line first:border-t-0 ${mine ? "bg-gold/8" : ""}`} style={stagger(i)}>
              {mine && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gold" />}
              <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <HistoryTeam name={name} teamId={c.teamId} color={color(c.teamId)} sub={sub} />
                  </span>
                  <span className="md:hidden">
                    <RingRow name={name} color={color(c.teamId)} years={c.rings} size="sm" />
                  </span>
                </div>
                <dl className="grid grid-cols-4 gap-2 md:contents">
                  <div className="md:w-20 md:text-center">
                    <dt className="eyebrow text-[0.625rem] text-muted md:sr-only">Dal</dt>
                    <dd className="font-display tnum text-xl leading-none font-extrabold">{seasonLabel(c.since)}</dd>
                  </div>
                  <div className="md:w-16 md:text-center">
                    <dt className="eyebrow text-[0.625rem] text-muted md:sr-only">Stagioni</dt>
                    <dd className="font-display tnum text-xl leading-none font-extrabold" title={`compresa la ${seasonLabel(currentYear)} in corso`}>
                      {c.seasons}
                    </dd>
                  </div>
                  <div className="md:w-24 md:text-center">
                    <dt className="eyebrow text-[0.625rem] text-muted md:sr-only">Migliore</dt>
                    <dd className={`font-display tnum text-xl leading-none font-extrabold ${c.best?.position === 1 ? "text-highlight" : ""}`} title={bestSub}>
                      {best}
                    </dd>
                  </div>
                  <div className="hidden md:block md:w-36">
                    <dt className="sr-only">Anelli</dt>
                    <dd>{c.rings.length ? <RingRow name={name} color={color(c.teamId)} years={c.rings} size="xs" /> : <span className="text-muted">–</span>}</dd>
                  </div>
                  <div className="text-right md:w-28">
                    <dt className="eyebrow text-[0.625rem] text-muted md:sr-only">V–P</dt>
                    <dd className="leading-none">
                      <span className="font-display tnum block text-xl font-extrabold">{record(c)}</span>
                      <span className="tnum mt-0.5 block text-[0.6875rem] text-muted">{pct(c)}</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Classifica finale di una stagione, col campione in testa. */
function SeasonCard({ s, names, color, i }: { s: SeasonTable; names: Map<string, string>; color: (teamId: string | null) => string; i: number }) {
  const top = Math.max(...s.rows.map((r) => r.totalPts), 1);
  return (
    <article className="rise overflow-hidden rounded-2xl border border-line bg-surface" style={stagger(i)} aria-labelledby={`stagione-${s.year}`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <h3 id={`stagione-${s.year}`} className="font-display flex-1 text-3xl leading-none font-black">
          {seasonLabel(s.year)}
        </h3>
        {s.champion && (
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 text-right">
              <span className="eyebrow block text-muted">Campione</span>
              <span className="block truncate text-sm font-bold">{s.champion.teamName}</span>
            </span>
            <ChampionRing name={s.champion.teamName} color={color(s.champion.teamId)} year={s.year} size="sm" />
          </span>
        )}
      </header>
      <ol>
        {s.rows.map((r) => {
          const now = r.teamId ? names.get(r.teamId) : undefined;
          const sub = r.teamId ? (now && !sameName(now, r.teamName) ? `oggi ${now}` : undefined) : "non più in lega";
          return (
            <li key={r.position} className={`flex min-h-12 items-center gap-3 border-t border-line px-3 py-1.5 first:border-t-0 sm:px-4 ${r.position === 1 ? "bg-gold/8" : ""}`}>
              <span className={`font-display tnum w-6 text-center text-2xl leading-none font-black ${r.position === 1 ? "text-highlight" : r.position <= 3 ? "" : "text-muted"}`}>{r.position}</span>
              <span className="min-w-0 flex-1">
                <HistoryTeam name={r.teamName} crestName={now} teamId={r.teamId} color={color(r.teamId)} sub={sub} />
              </span>
              <span className="font-display tnum w-12 text-center text-lg leading-none font-extrabold">{record(r)}</span>
              <span className="flex w-[4.75rem] flex-col items-end leading-none">
                <span className="font-display tnum text-base font-extrabold text-brand-blue">{fmtPts(r.totalPts)}</span>
                <span aria-hidden className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                  <span className="block h-full rounded-full bg-brand-blue/70" style={{ width: `${Math.max(4, (r.totalPts / top) * 100)}%` }} />
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

/** Squadre uscite dalla lega, con chi ha preso il loro posto (senza ereditarne la storia). */
function Formers({ formers, names }: { formers: Former[]; names: Map<string, string> }) {
  return (
    <ul className="grid gap-2.5 md:grid-cols-3">
      {formers.map((f, i) => (
        <li key={f.key} className="rise flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-surface p-4" style={stagger(i)}>
          <div className="flex items-center gap-3">
            <TeamCrest name={f.name} color={FORMER_COLOR} size="md" />
            <span className="min-w-0 flex-1">
              <span className="font-display block truncate text-2xl leading-none font-black">{f.name}</span>
              <span className="mt-1 block truncate text-xs text-muted">
                {span(f.years)}
                {f.aliases.length > 0 && ` · prima ${f.aliases.join(", ")}`}
              </span>
            </span>
            <RingRow name={f.name} color={FORMER_COLOR} years={f.rings} size="sm" label={false} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Stagioni", value: f.years.length },
              { label: "Migliore", value: `${f.best}°`, gold: f.best === 1 },
              { label: "V–P", value: record(f) },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-surface-subtle/70 px-2 py-2">
                <dt className="eyebrow text-[0.625rem] text-muted">{x.label}</dt>
                <dd className={`font-display tnum mt-0.5 text-xl leading-none font-extrabold ${x.gold ? "text-highlight" : ""}`}>{x.value}</dd>
              </div>
            ))}
          </dl>
          {f.rings.length > 0 && (
            <p className="text-xs font-semibold text-highlight">
              {f.rings.length === 1 ? "Campione" : `${f.rings.length} anelli`}: {f.rings.map(seasonLabel).join(", ")}
            </p>
          )}
          {f.replacedBy && (
            <Link href={`/squadre/${f.replacedBy}`} className="mt-auto inline-flex min-h-11 items-center gap-1.5 border-t border-line pt-2 text-xs text-muted hover:text-foreground">
              Al suo posto dal {seasonLabel(f.years[f.years.length - 1] + 1)}:
              <span className="font-bold text-brand-blue">{names.get(f.replacedBy) ?? "?"}</span>
              <Icon name="arrow-right" size={14} strokeWidth={2.2} className="text-brand-blue" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Albo d'oro: anelli dei campioni (R-61: il 1° in classifica), carriera delle squadre di oggi (record compresa la stagione in
 * corso), classifiche finali di ogni stagione conclusa e squadre uscite dalla lega. Sola lettura.
 */
export default async function HistoryPage() {
  const [history, league, profile] = await Promise.all([loadHistory(), loadLeague(), loadProfile()]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const color = (teamId: string | null) => (teamId ? (colors.get(teamId) ?? FORMER_COLOR) : FORMER_COLOR);
  const names = league.teamNames;
  const myTeamId = profile?.team_id ?? null;
  const seasons = history?.seasons ?? [];
  const champions = new Set(seasons.map((s) => s.champion?.teamId ?? s.champion?.teamName));
  const last = seasons[0]?.champion;

  return (
    <>
      <PageTitle
        icon="medal"
        eyebrow={seasons.length ? `Lega dal ${seasonLabel(seasons[seasons.length - 1].year)}` : "Storia della lega"}
        sub="Gli anelli dei campioni, la carriera di ogni squadra e le classifiche finali di tutte le stagioni. L'anello va al primo in classifica."
        aside={
          seasons.length > 0 && (
            <Scoreboard
              items={[
                { label: "Stagioni concluse", value: seasons.length },
                { label: "Campioni diversi", value: champions.size },
                { label: "Ultimo anello", value: last?.teamName ?? "–", tone: "gold" },
              ]}
            />
          )
        }
      >
        Albo d&apos;oro
      </PageTitle>

      <div className="mb-8">
        <LeagueTabs active="storia" />
      </div>

      {!history ? (
        <Empty title="Storico non disponibile" icon="medal">
          Le classifiche delle stagioni passate non si leggono in questo momento. Rose e contratti sono aggiornati.
        </Empty>
      ) : seasons.length === 0 ? (
        <Empty title="Ancora nessuna stagione conclusa" icon="medal">
          L&apos;albo d&apos;oro si riempie quando si chiude la prima stagione.
        </Empty>
      ) : (
        <>
          <Section title="Anelli" icon="crown" aside="un anello per stagione al 1° in classifica">
            <RingWall seasons={seasons} color={color} />
          </Section>

          <Section title="Le squadre" icon="shield" aside={`record compresa la ${seasonLabel(league.seasonYear)} in corso`}>
            <Careers careers={history.careers} names={names} color={color} myTeamId={myTeamId} currentYear={league.seasonYear} />
            <p className="mt-3 text-xs text-muted">
              Ordinate per anelli, poi per percentuale di vittorie. Chi ha preso il posto di una squadra uscita parte da zero: stagioni, record e anelli restano
              a quella squadra, qui sotto. La classifica di quest&apos;anno è in{" "}
              <Link href="/classifica" className="font-bold text-brand-blue hover:underline">
                Classifica
              </Link>
              .
            </p>
          </Section>

          <Section title="Stagione per stagione" icon="clipboard" aside="classifiche finali">
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {seasons.map((s, i) => (
                <SeasonCard key={s.year} s={s} names={names} color={color} i={i} />
              ))}
            </div>
          </Section>

          {history.formers.length > 0 && (
            <Section title="Non più in lega" icon="clock" aside={`${history.formers.length} ${history.formers.length === 1 ? "squadra" : "squadre"}`}>
              <Formers formers={history.formers} names={names} />
            </Section>
          )}

          <div className="mt-6 flex flex-wrap gap-1.5">
            <Badge icon="info">Fonte: classifiche finali di Dunkest</Badge>
          </div>
        </>
      )}
    </>
  );
}
