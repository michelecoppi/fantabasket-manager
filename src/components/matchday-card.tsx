import Link from "next/link";
import { MvpStrip } from "@/components/awards";
import { MatchScore, type TeamIndex } from "@/components/dunkest-league";
import { Icon, type IconName } from "@/components/icons";
import { stagger } from "@/components/ui";
import type { Award } from "@/lib/awards";
import type { MatchdayView } from "@/lib/dunkest-league";

/*
 * «La giornata» (Fase 6, riordino): in un blocco solo i risultati dell'ultima giornata con punti, l'MVP dell'ultima chiusa e i
 * collegamenti alle schede di /classifica. Lo usano la home e la scheda Classifica.
 */

const STATE = { played: "chiusa", latest: "in corso o appena chiusa", upcoming: "da giocare" } as const;

export function MatchdayCard({
  day,
  mvp,
  teams,
  myTeamId,
}: {
  day: MatchdayView;
  mvp: { award: Award; matchday: number } | null;
  teams: TeamIndex;
  myTeamId: string | null;
}) {
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: `/classifica?vista=calendario&giornata=${day.matchday}`, label: "Formazioni", icon: "jersey" },
    { href: `/classifica?vista=premi${mvp ? `&giornata=${mvp.matchday}` : ""}`, label: "Premi", icon: "crown" },
    { href: "/classifica?vista=andamento", label: "Andamento", icon: "chart" },
  ];
  return (
    <section aria-labelledby={`giornata-${day.matchday}`} className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 id={`giornata-${day.matchday}`} className="font-display text-3xl leading-none font-black">
          Giornata {day.matchday}
        </h3>
        <span className="text-xs font-semibold text-muted">{STATE[day.state]}</span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {day.matches.map((m, i) => (
          <li key={m.id} className="rise" style={stagger(i)}>
            <Link
              href={`/classifica?vista=calendario&giornata=${day.matchday}`}
              className={`block rounded-xl border px-3 py-2.5 transition-colors hover:bg-surface-subtle/60 ${m.homeTeamId === myTeamId || m.awayTeamId === myTeamId ? "border-gold/60" : "border-line"}`}
            >
              <MatchScore match={m} teams={teams} myTeamId={myTeamId} live={day.state === "latest"} />
            </Link>
          </li>
        ))}
      </ol>
      {mvp && (
        <div className="mt-3">
          <MvpStrip award={mvp.award} matchday={mvp.matchday} teams={teams} myTeamId={myTeamId} />
        </div>
      )}
      <nav aria-label="Altro sulla giornata" className="mt-3 flex flex-wrap gap-1.5">
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-foreground/80 transition-colors hover:border-brand-blue hover:text-brand-blue"
          >
            <Icon name={l.icon} size={15} />
            {l.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
