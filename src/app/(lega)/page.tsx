import Link from "next/link";
import { Badge, Stat } from "@/components/ui";
import { fmt } from "@/lib/format";
import { loadLeague, loadProfile } from "@/lib/league-server";

export default async function Home() {
  const [league, profile] = await Promise.all([loadLeague(), loadProfile()]);
  const { settings } = league;

  return (
    <>
      <h1 className="text-2xl font-bold">Lega {league.seasonYear}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Cap {fmt(settings.cap)} (più bonus campionato) · floor {fmt(settings.cap - settings.cap / settings.floorDivisor)} · budget riserve {fmt(settings.reserveBudget)}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {league.teams.map((t) => {
          const f = t.finance;
          const mine = profile?.team_id === t.team.id;
          return (
            <Link
              key={t.team.id}
              href={`/squadre/${t.team.id}`}
              className={`rounded-xl border p-4 transition hover:border-orange-500 ${
                mine ? "border-orange-500" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.team.name}</div>
                  <div className="text-sm text-neutral-500">{t.team.owner_name}</div>
                </div>
                {mine && <Badge tone="accent">La tua</Badge>}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Monte ingaggi" value={fmt(f.payroll)} />
                <Stat label="Spazio" value={fmt(f.capSpace)} tone={f.overCap ? "bad" : undefined} />
                <Stat label="Spazio riserve" value={fmt(f.reserveSpace)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={t.bonus > 0 ? "good" : t.bonus < 0 ? "warn" : "neutral"} title="Bonus/malus campionato">
                  bonus {t.bonus > 0 ? "+" : ""}{t.bonus}
                </Badge>
                {f.overCap && <Badge tone="bad">budget sforato</Badge>}
                {f.belowFloor && <Badge tone="warn" title={`Sotto il salary floor (${fmt(f.floor)})`}>sotto floor</Badge>}
                {t.warnings.length > 0 && <Badge title={t.warnings.join(" · ")}>rosa incompleta</Badge>}
                <Badge tone={t.entryFeePaid ? "good" : "neutral"}>quota {t.entryFeePaid ? "pagata" : "da pagare"}</Badge>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
