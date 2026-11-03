import type { ReactNode } from "react";
import { TeamCrest } from "@/components/crest";
import { Icon, type IconName } from "@/components/icons";
import { Badge, PosChip } from "@/components/ui";
import { clockSpan, leader, matchPrice, secondsLeft, type AuctionRules, type Lot } from "@/lib/auction";
import type { PoolEntry } from "@/lib/auction-playground";
import type { Sale } from "@/lib/auction-room";
import { fmt } from "@/lib/format";

/*
 * Sala d'asta (issue #104): pezzi di presentazione. Lo stato e i bot stanno in app/(lega)/asta/playground.tsx.
 * Il palco è una superficie arena; il cronometro è un "shot clock" (riquadro scuro, cifre oro, rosse negli ultimi tre secondi).
 */

export interface TeamInfo {
  id: string;
  name: string;
  color: string;
}

const KIND: Record<PoolEntry["kind"], string> = { free: "Free agent", cut: "Tagliato", restricted: "Restricted" };

/** Tipo di lotto con chi c'entra: chi l'ha tagliato (escluso, R-41) o chi può pareggiare (R-23). */
export function LotKindBadge({ entry, team }: { entry: Pick<PoolEntry, "kind" | "formerTeamId" | "example">; team: (id: string) => TeamInfo | undefined }) {
  const former = entry.formerTeamId ? team(entry.formerTeamId) : undefined;
  if (entry.kind === "free") return <Badge>{KIND.free}</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={entry.kind === "cut" ? "bad" : "accent"} icon={entry.kind === "cut" ? "x" : "hand"}>
        {entry.kind === "cut" ? `Tagliato da ${former?.name ?? "?"}` : `Pareggia ${former?.name ?? "?"}`}
      </Badge>
      {entry.example && <Badge title="Non è un dato vero: serve a provare la regola">esempio</Badge>}
    </span>
  );
}

/** Shot clock: secondi interi, battito negli ultimi tre, «Uno… Due… Tre…» sotto. */
export function ShotClock({ lot, now, rules }: { lot: Lot; now: number; rules: AuctionRules }) {
  const left = secondsLeft(lot, now);
  const s = Math.ceil(left - 0.05);
  const paused = lot.pausedLeft !== null;
  const urgent = !paused && s <= 3;
  const call = lot.phase === "match" ? "pareggio" : paused ? "in pausa" : urgent ? (["Tre…", "Due…", "Uno…"][s - 1] ?? "") : "secondi";
  return (
    <div className="flex w-[5.5rem] shrink-0 flex-col items-center sm:w-24">
      <div role="timer" aria-label={paused ? "Asta in pausa" : `${s} secondi`} className="grid aspect-square w-full place-items-center rounded-2xl bg-nav shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_14px_30px_-18px_rgb(3_6_13/0.9)]">
        <span
          key={urgent ? s : "calm"}
          className={`font-display tnum text-[3.5rem] leading-none font-black sm:text-[4rem] ${urgent ? "tick-beat text-accent" : paused ? "text-gold/60" : "text-gold"}`}
        >
          {paused ? <Icon name="clock" size={36} strokeWidth={2.2} /> : Math.max(0, s)}
        </span>
      </div>
      <span className={`eyebrow mt-1.5 ${urgent ? "text-arena-bad" : "text-white/60"}`}>{call}</span>
      <span className="sr-only">{`su ${Math.round(clockSpan(lot, rules))}`}</span>
    </div>
  );
}

/** Barra del cronometro sotto il palco. */
export function ClockBar({ lot, now, rules }: { lot: Lot; now: number; rules: AuctionRules }) {
  const p = Math.min(1, secondsLeft(lot, now) / clockSpan(lot, rules));
  const urgent = lot.pausedLeft === null && secondsLeft(lot, now) <= 3;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/12" aria-hidden>
      <div className={`clock-bar h-full rounded-full ${urgent ? "bg-brand-red" : lot.phase === "match" ? "bg-brand-blue" : "bg-gold"}`} style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}

/** Numerino del palco: etichetta piccola sopra, cifra da tabellone. */
export function StageStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-arena-good" : tone === "warn" ? "text-arena-warn" : tone === "bad" ? "text-arena-bad" : "text-white";
  return (
    <div className="min-w-0 bg-board px-3 py-2.5 sm:px-4">
      <dt className="eyebrow truncate text-white/55">{label}</dt>
      <dd className={`font-display tnum mt-0.5 truncate text-2xl leading-none font-extrabold ${color}`}>{value}</dd>
    </div>
  );
}

/** Offerta in testa: cifra grande che salta a ogni rilancio e chi la tiene. */
export function PriceBlock({ lot, team, me }: { lot: Lot; team: (id: string) => TeamInfo | undefined; me: string }) {
  const top = leader(lot);
  const t = top ? team(top.teamId) : undefined;
  const amount = lot.phase === "match" ? matchPrice(lot) : (top?.amount ?? lot.base);
  return (
    <div className="min-w-0" aria-live="polite" aria-atomic>
      <div className="eyebrow text-white/60">{top ? (lot.phase === "match" ? "Da pareggiare" : "Offerta") : "Base d'asta"}</div>
      <div key={`${lot.bids.length}-${amount}`} className={`price-bump font-display tnum mt-1 text-[clamp(4.25rem,17vw,7.5rem)] leading-[0.8] font-black ${top ? "jumbo" : "text-white/45"}`}>
        {fmt(amount)}
      </div>
      <div className="mt-3 flex min-h-8 min-w-0 items-center gap-2">
        {t ? (
          <>
            <span key={t.id} className="pop">
              <TeamCrest name={t.name} color={t.color} size="sm" mine={t.id === me} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="font-display block truncate text-xl font-extrabold">{t.id === me ? "Tu" : t.name}</span>
              <span className="block text-xs text-white/60">{lot.bids.length === 1 && top?.teamId === lot.calledBy ? "ha chiamato e apre" : "in testa"}</span>
            </span>
          </>
        ) : (
          <span className="text-sm text-white/60">{lot.kind === "cut" ? "Nessuna offerta: chi apre alla base?" : "Nessuna offerta"}</span>
        )}
      </div>
    </div>
  );
}

/** Timbro di fine lotto, sopra il palco. */
export function SoldStamp({ lot, team, me }: { lot: Lot; team: (id: string) => TeamInfo | undefined; me: string }) {
  const r = lot.result;
  const t = r ? team(r.teamId) : undefined;
  const mine = r?.teamId === me;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-arena/70 p-6 backdrop-blur-[3px]">
      <div className="relative flex flex-col items-center text-center">
        {mine && (
          <>
            <span aria-hidden className="ring-burst absolute top-2 h-24 w-24 rounded-full border-4 border-gold" />
            <span aria-hidden className="ring-burst absolute top-2 h-24 w-24 rounded-full border-2 border-gold" style={{ animationDelay: "180ms" }} />
          </>
        )}
        {t && (
          <span className="pop">
            <TeamCrest name={t.name} color={t.color} size="lg" mine={mine} />
          </span>
        )}
        <div
          className={`stamp font-display mt-3 rounded-xl border-[5px] px-5 py-1.5 text-[clamp(2.25rem,9vw,3.75rem)] leading-none font-black tracking-wide uppercase ${r ? "border-gold text-highlight dark:text-gold" : "border-white/40 text-white/70"}`}
        >
          {r ? (r.matched ? "Pareggiato" : "Aggiudicato") : "Nessuna offerta"}
        </div>
        <p className="rise mt-4 text-sm text-white/80" style={{ animationDelay: "260ms" }}>
          {r && t ? (
            <>
              <strong className="font-semibold text-white">{mine ? "Tuo" : `A ${t.name}`}</strong> per <span className="tnum font-bold text-white">{fmt(r.amount)}</span> · durata da
              fissare
            </>
          ) : lot.kind === "cut" ? (
            "L'ex proprietario sceglie: taglio definitivo o rientro (R-42)"
          ) : (
            "Torna libero"
          )}
        </p>
      </div>
    </div>
  );
}

/** Registro del lotto: un rigo per offerta, la più recente in alto. */
export function BidFeed({ lot, team, me, now }: { lot: Lot; team: (id: string) => TeamInfo | undefined; me: string; now: number }) {
  const rows = [...lot.bids].reverse().slice(0, 8);
  if (rows.length === 0)
    return <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">Ancora nessuna offerta su questo giocatore.</p>;
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Offerte">
      {rows.map((b, i) => {
        const t = team(b.teamId);
        const prev = lot.bids[lot.bids.length - 2 - i];
        const opening = lot.bids.length - 1 - i === 0 && b.teamId === lot.calledBy;
        const ago = Math.max(0, Math.round((now - b.at) / 1000));
        return (
          <li key={`${b.teamId}-${b.at}`} className={`relative flex min-h-12 items-center gap-3 px-3.5 py-2 ${i === 0 ? "bid-in" : "opacity-75"}`}>
            {t && <TeamCrest name={t.name} color={t.color} size="xs" mine={t.id === me} />}
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">{t?.id === me ? "Tu" : t?.name}</span>
              <span className="text-muted"> · {opening ? "chiama e apre" : ago < 2 ? "adesso" : `${ago}″ fa`}</span>
            </span>
            {prev && <span className="tnum text-xs font-bold text-success">+{fmt(Math.round((b.amount - prev.amount) * 10) / 10)}</span>}
            <span className={`font-display tnum w-14 text-right text-2xl leading-none font-extrabold ${i === 0 ? "" : "text-muted"}`}>{fmt(b.amount)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface BoardRow {
  team: TeamInfo;
  capSpace: number;
  starters: number;
  startersMax: number;
  reserves: number;
  reservesMax: number;
  spent: number;
  bought: number;
  /** quanto può offrire sul giocatore in palio (null senza lotto) */
  limit: number | null;
  state: "leader" | "excluded" | "holder" | "caller" | "out" | null;
  /** ha appena rilanciato (velo oro) */
  flash: string | null;
}

const STATE: Record<NonNullable<BoardRow["state"]>, { label: string; icon: IconName; tone: "gold" | "neutral" | "accent" | "bad" }> = {
  leader: { label: "In testa", icon: "crown", tone: "gold" },
  excluded: { label: "Escluso", icon: "lock", tone: "neutral" },
  holder: { label: "Pareggio", icon: "hand", tone: "accent" },
  caller: { label: "Chiama", icon: "gavel", tone: "accent" },
  out: { label: "Senza spazio", icon: "lock", tone: "neutral" },
};

/** Tabellone delle squadre: spazio, posti, spesa e stato sul lotto in corso. */
export function TeamBoard({ rows, me }: { rows: BoardRow[]; me: string }) {
  return (
    <ul className="grid gap-1.5" aria-label="Squadre in sala">
      {rows.map((r) => {
        const st = r.state ? STATE[r.state] : null;
        return (
          <li
            key={r.team.id}
            className={`relative flex min-h-14 items-center gap-3 rounded-xl border px-2.5 py-2 transition-[border-color,opacity] ${
              r.state === "leader" ? "border-gold bg-gold/8" : r.team.id === me ? "border-brand-blue/35 bg-surface" : "border-line bg-surface"
            } ${r.state === "excluded" || r.state === "out" ? "opacity-60" : ""}`}
          >
            {r.flash && <span key={r.flash} aria-hidden className="flash-veil bg-gold/30" />}
            <span className="w-1 self-stretch rounded-full" style={{ background: r.team.color }} aria-hidden />
            <TeamCrest name={r.team.name} color={r.team.color} size="sm" mine={r.team.id === me} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-bold">
                {r.team.name}
                {r.team.id === me && <span className="ml-1.5 text-xs font-semibold text-brand-blue dark:text-gold">tu</span>}
              </span>
              <span className="tnum block truncate text-xs text-muted">
                spazio <span className={r.capSpace < 0 ? "font-bold text-danger" : "font-semibold text-foreground"}>{fmt(r.capSpace)}</span> · T {r.starters}/{r.startersMax} · R{" "}
                {r.reserves}/{r.reservesMax}
                {r.bought > 0 && (
                  <>
                    {" "}
                    · <span className="font-semibold text-foreground">{r.bought}</span> presi
                  </>
                )}
              </span>
            </span>
            {st ? (
              <Badge tone={st.tone} icon={st.icon}>
                {st.label}
              </Badge>
            ) : (
              r.limit !== null && (
                <span className="tnum shrink-0 text-right text-xs leading-tight text-muted">
                  max
                  <span className="font-display block text-lg leading-none font-extrabold text-foreground">{fmt(r.limit)}</span>
                </span>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rigo di un acquisto (registro degli aggiudicati e riepilogo). */
export function SaleRow({ sale, team, me, showTeam = true }: { sale: Sale; team: (id: string) => TeamInfo | undefined; me: string; showTeam?: boolean }) {
  const t = team(sale.teamId);
  const p = sale.entry.player;
  return (
    <li className="flex min-h-12 items-center gap-3 px-3.5 py-2">
      <PosChip pos={p.pos} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold">{p.name}</span>
        <span className="block truncate text-xs text-muted">
          {showTeam && t ? `${t.id === me ? "Tu" : t.name} · ` : ""}
          {sale.slot === "starter" ? "titolare" : "riserva"} · {sale.bids} {sale.bids === 1 ? "offerta" : "offerte"}
          {sale.matched ? " · pareggio" : ""}
        </span>
      </span>
      {showTeam && t && <TeamCrest name={t.name} color={t.color} size="xs" mine={t.id === me} />}
      <span className="font-display tnum w-12 text-right text-xl leading-none font-extrabold">{fmt(sale.amount)}</span>
    </li>
  );
}
