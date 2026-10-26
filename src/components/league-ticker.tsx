import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { stagger } from "@/components/ui";
import { fmt } from "@/lib/format";
import { loadLeague, loadProfile } from "@/lib/league-server";
import { teamColors } from "@/lib/team-colors";

/**
 * Striscia sotto l'header, come lo scoreboard di NBA.com: una "partita" per squadra con spazio salariale e cap meter.
 * Dati reali di `loadLeague` (memoizzata, nessuna query in più); non è una classifica, l'ordine è alfabetico.
 */
export async function LeagueTicker() {
  const [league, profile] = await Promise.all([loadLeague(), loadProfile()]);
  const colors = teamColors(league.teams.map((t) => t.team.id));
  const teams = [...league.teams].sort((a, b) => a.team.name.localeCompare(b.team.name));
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] items-stretch">
        <div className="hidden shrink-0 flex-col justify-center border-r border-line px-4 sm:flex lg:pl-10">
          <span className="eyebrow leading-tight text-muted">Lega</span>
          <span className="font-display text-xl leading-none font-black">{league.seasonYear}</span>
        </div>
        <ul className="no-scrollbar flex flex-1 snap-x overflow-x-auto overscroll-x-contain" aria-label="Spazio salariale delle squadre">
          {teams.map((t, i) => {
            const f = t.finance;
            const mine = profile?.team_id === t.team.id;
            const pct = f.effectiveCap > 0 ? Math.min(100, (f.payroll / f.effectiveCap) * 100) : 100;
            return (
              <li key={t.team.id} className="snap-start border-r border-line">
                <Link
                  href={`/squadre/${t.team.id}`}
                  className={`group flex h-full min-w-[9.75rem] items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-subtle ${mine ? "bg-gold/12" : ""}`}
                  title={`${t.team.name}: payroll ${fmt(f.payroll)} su ${fmt(f.effectiveCap)}`}
                >
                  <span className="pop" style={stagger(i)}>
                    <TeamCrest name={t.team.name} color={colors.get(t.team.id) ?? "#555"} size="xs" mine={mine} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] leading-tight font-bold group-hover:underline">{t.team.name}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-foreground/10">
                      <span className={`meter-fill block h-full rounded-full ${f.overCap ? "bg-brand-red" : "bg-brand-blue"}`} style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`font-display tnum block text-xl leading-none font-black ${f.overCap ? "text-danger" : ""}`}>{fmt(f.capSpace)}</span>
                    <span className="block text-[0.5625rem] font-bold tracking-wider text-muted uppercase">spazio</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Segnaposto della stessa altezza mentre arrivano i dati (evita che la pagina salti). */
export function LeagueTickerFallback() {
  return (
    <div className="border-b border-line bg-surface" aria-hidden>
      <div className="mx-auto flex h-[3.25rem] max-w-[1440px] items-center gap-3 overflow-hidden px-4 lg:px-10">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="skeleton h-7 w-40 shrink-0 rounded-md" />
        ))}
      </div>
    </div>
  );
}
