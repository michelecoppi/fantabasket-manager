import Link from "next/link";
import { TeamCrest } from "@/components/crest";
import { fpt, type TeamIndex } from "@/components/dunkest-league";
import { Icon } from "@/components/icons";
import { ShareCard } from "@/components/share-card";
import { Badge, stagger } from "@/components/ui";
import { AWARD_ORDER, type Award, type AwardKind, type AwardWinner } from "@/lib/awards";
import { AWARD_META } from "@/lib/awards-meta";

/*
 * Premi della giornata (Fase 6.1) come bacheca di trofei: una tessera per premio con icona, etichetta, vincitore (giocatore o
 * squadra, con lo stemma) e valore in cifre da tabellone. L'MVP è la tessera grande e scura; i premi «al contrario» (capitano
 * di latta, cucchiaio di legno) hanno l'icona rossa; quelli della mia squadra il bordo oro, come gli scontri.
 */

const ICON_TONE = { gold: "bg-gold text-nav", blue: "bg-brand-blue/12 text-brand-blue", red: "bg-danger/10 text-danger" } as const;

const team = (teams: TeamIndex, id: string) => teams.get(id) ?? { name: "?", owner: "", color: "var(--muted)" };

/** Riga del vincitore: giocatore (nome + stemma e squadra), scontro (le due squadre) o squadra. */
function Winner({ w, kind, teams, myTeamId, dark }: { w: AwardWinner; kind: AwardKind; teams: TeamIndex; myTeamId: string | null; dark: boolean }) {
  const t = team(teams, w.teamId);
  const sub = dark ? "text-white/65" : "text-muted";
  if (w.name !== undefined) {
    return (
      <div className="min-w-0">
        <p className={`truncate font-semibold ${dark ? "text-white" : ""}`}>{w.name}</p>
        <p className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-xs ${sub}`}>
          <TeamCrest name={t.name} color={t.color} size="xs" mine={w.teamId === myTeamId} />
          <span className="truncate">{t.name}</span>
        </p>
      </div>
    );
  }
  const vs = w.vsTeamId ? team(teams, w.vsTeamId) : null;
  const match = kind === "blowout" || kind === "photo_finish";
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-1.5">
        <TeamCrest name={t.name} color={t.color} size="xs" mine={w.teamId === myTeamId} />
        <span className="truncate font-semibold">{t.name}</span>
      </p>
      {vs && (
        <p className={`mt-0.5 truncate text-xs ${sub}`}>
          {match ? (w.value === 0 ? "pari con " : "su ") : "contro "}
          {vs.name}
        </p>
      )}
    </div>
  );
}

function Tile({ award, teams, myTeamId, i, matchday }: { award: Award; teams: TeamIndex; myTeamId: string | null; i: number; matchday: number }) {
  const a = AWARD_META[award.kind];
  const hero = award.kind === "mvp";
  const mine = award.winners.some((w) => w.teamId === myTeamId || w.vsTeamId === myTeamId);
  const value = award.winners[0].value;
  const margin = award.kind === "blowout" || award.kind === "photo_finish";
  return (
    <li
      className={`rise flex min-w-0 flex-col gap-3 rounded-2xl border p-3.5 sm:p-4 ${hero ? "arena col-span-2" : "bg-surface"} ${mine ? "border-gold/70" : hero ? "border-transparent" : "border-line"}`}
      style={stagger(i)}
    >
      <div className="flex items-start gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${ICON_TONE[a.tone]}`}>
          <Icon name={a.icon} size={17} strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          {/* l'etichetta va a capo invece di essere tagliata e la cifra sta sotto il vincitore (le colonne sono strette anche su desktop); la spiegazione compare da `sm` o nella tessera grande */}
          <span className={`font-display block leading-[0.95] font-extrabold ${hero ? "text-xl text-highlight" : "text-lg sm:text-xl"}`}>{a.label}</span>
          <span className={`mt-0.5 text-[0.6875rem] leading-tight ${hero ? "block text-white/55" : "hidden text-muted sm:block"}`}>{a.hint}</span>
        </span>
        {hero && <ShareCard src={`/card/mvp/${matchday}`} title={`MVP della giornata ${matchday}`} filename={`mvp-giornata-${matchday}.png`} className="-mt-1 -mr-1 ml-auto" />}
      </div>
      <div className={`mt-auto flex gap-x-3 gap-y-1.5 ${hero ? "items-end justify-between" : "flex-col"}`}>
        <div className="min-w-0 space-y-1.5">
          {award.winners.map((w) => (
            <Winner key={`${w.teamId}-${w.name ?? ""}-${w.vsTeamId ?? ""}`} w={w} kind={award.kind} teams={teams} myTeamId={myTeamId} dark={hero} />
          ))}
          {award.winners.length > 1 && <span className={`block text-[0.6875rem] font-bold uppercase ${hero ? "text-white/55" : "text-muted"}`}>ex aequo</span>}
        </div>
        <span className={`font-display tnum shrink-0 leading-none font-black ${hero ? "jumbo text-5xl" : `self-end text-3xl ${a.tone === "red" ? "text-danger" : "text-brand-blue"}`}`}>
          {margin ? `+${fpt(value)}` : fpt(value)}
          <span className="sr-only">{margin ? " punti di scarto" : " punti"}</span>
        </span>
      </div>
    </li>
  );
}

/**
 * Bacheca della giornata. `provisional`: l'ultima giornata con punti può essere in corso, quindi i premi possono cambiare.
 * `noLineups`: la giornata ha punteggi ma nessuna formazione salvata, quindi mancano i premi dei giocatori.
 * `matchday`: serve alla card da condividere dell'MVP (`/card/mvp/<giornata>`).
 */
export function AwardsGrid({ awards, teams, myTeamId, provisional, noLineups, matchday }: { awards: Award[]; teams: TeamIndex; myTeamId: string | null; provisional: boolean; noLineups: boolean; matchday: number }) {
  const sorted = [...awards].sort((a, b) => AWARD_ORDER.indexOf(a.kind) - AWARD_ORDER.indexOf(b.kind));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {provisional ? (
          <Badge tone="warn" icon="clock">
            Provvisori
          </Badge>
        ) : (
          <span />
        )}
        <ShareCard
          src={`/card/premi/${matchday}`}
          title={`Premi della giornata ${matchday}`}
          filename={`premi-giornata-${matchday}.png`}
          label="Condividi i premi"
          sheetTitle="Condividi i premi"
        />
      </div>
      {(provisional || noLineups) && (
        <p className="-mt-1 mb-3 text-xs text-muted">
          {provisional && "La giornata può essere ancora in corso: i premi si aggiornano ogni mattina. "}
          {noLineups && "Formazioni non salvate per questa giornata: ci sono solo i premi di squadra."}
        </p>
      )}
      <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((a, i) => (
          <Tile key={a.kind} award={a} teams={teams} myTeamId={myTeamId} i={i} matchday={matchday} />
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">Punti come li dà Dunkest (per il capitano non si sa se comprendono il bonus). A pari valore il premio è condiviso.</p>
    </div>
  );
}

/** Riga MVP per la home: l'MVP dell'ultima giornata chiusa, con link ai premi in classifica. */
export function MvpStrip({ award, matchday, teams, myTeamId }: { award: Award; matchday: number; teams: TeamIndex; myTeamId: string | null }) {
  const w = award.winners[0];
  const t = team(teams, w.teamId);
  return (
    <div className="relative">
      <Link
        href={`/classifica?vista=premi&giornata=${matchday}`}
        className={`rise group flex items-center gap-2.5 arena rounded-2xl sm:gap-3 sm:pr-16 sm:pl-4 border py-3 pr-14 pl-3 transition-[filter] hover:brightness-[1.04] dark:hover:brightness-125 ${w.teamId === myTeamId ? "border-gold/70" : "border-transparent"}`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold text-nav sm:h-10 sm:w-10">
          <Icon name="crown" size={20} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block truncate text-white/55">MVP giornata {matchday}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{award.winners.map((x) => x.name).join(" · ")}</span>
            <TeamCrest name={t.name} color={t.color} size="xs" mine={w.teamId === myTeamId} />
            <span className="hidden truncate text-xs text-white/65 sm:inline">{t.name}</span>
          </span>
        </span>
        <span className="font-display tnum jumbo shrink-0 text-2xl leading-none font-black sm:text-3xl">{fpt(w.value)}</span>
      </Link>
      <ShareCard src={`/card/mvp/${matchday}`} title={`MVP della giornata ${matchday}`} filename={`mvp-giornata-${matchday}.png`} className="absolute top-1/2 right-1.5 z-[2] -translate-y-1/2 sm:right-2" />
    </div>
  );
}
