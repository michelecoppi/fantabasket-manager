"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  BidFeed,
  ClockBar,
  LotKindBadge,
  PriceBlock,
  SaleRow,
  ShotClock,
  SoldStamp,
  StageStat,
  TeamBoard,
  type BoardRow,
  type TeamInfo,
} from "@/components/auction";
import { Button, Callout, Check, Field, Segmented, inputClass } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { BallLoader, Icon } from "@/components/icons";
import { Badge, PageTitle, PosChip, Scoreboard, stagger } from "@/components/ui";
import {
  PROPOSED_RULES,
  bidLimit,
  excludedReason,
  isLive,
  leader,
  matchPrice,
  minimumBid,
  secondsLeft,
  type AuctionRules,
  type LotPlayer,
} from "@/lib/auction";
import { botAmount, botCall, botDelay, botValue, makeBots, seeded } from "@/lib/auction-bots";
import { buildScenario, type PlaygroundTeam, type PoolEntry, type RosterPick, type ScenarioMode } from "@/lib/auction-playground";
import { canCall, createRoom, limitFor, roomReducer, teamSummary, type Room, type RoomAction } from "@/lib/auction-room";
import { auctionFloor, teamFinance, type LastContract, type LeagueSettings, type Position } from "@/lib/cap";
import { fmt } from "@/lib/format";

export interface FreeAgentRow extends LotPlayer {
  lastContract: LastContract | null;
  restrictedTeamId: string | null;
}

interface Props {
  teams: PlaygroundTeam[];
  rostered: RosterPick[];
  free: FreeAgentRow[];
  settings: LeagueSettings;
  myTeamId: string | null;
  seasonYear: number;
}

type Pace = "calmo" | "proposto" | "veloce";
const PACES: Record<Pace, { label: string; open: number; bid: number }> = {
  calmo: { label: "Calmo", open: 20, bid: 15 },
  proposto: {
    label: "Proposto",
    open: PROPOSED_RULES.openSeconds,
    bid: PROPOSED_RULES.bidSeconds,
  },
  veloce: { label: "Veloce", open: 10, bid: 6 },
};

/** Quanto resta in vista il timbro di fine lotto prima del lotto successivo. */
const SETTLE_MS = 2600;

const today = () => new Date().toISOString().slice(0, 10);

export function AuctionPlayground(props: Props) {
  const [me, setMe] = useState(props.myTeamId ?? props.teams[0]?.id ?? "");
  const [mode, setMode] = useState<ScenarioMode>("today");
  const [pace, setPace] = useState<Pace>("proposto");
  const [examples, setExamples] = useState(true);
  const [session, setSession] = useState<{ room: Room; seed: number } | null>(null);

  const rules: AuctionRules = {
    ...PROPOSED_RULES,
    openSeconds: PACES[pace].open,
    bidSeconds: PACES[pace].bid,
  };
  // Con le rose di oggi, chi ha ancora un posto e spazio per comprare (gli esempi di tagliati ne liberano qualcuno).
  const buyers = props.teams.filter((t) => canCall({ teams: props.teams, settings: props.settings, rules }, t.id)).length;

  function start() {
    const day = today();
    const seed = Date.now() % 2 ** 31;
    const data = {
      teams: props.teams,
      rostered: props.rostered,
      settings: props.settings,
      today: day,
      free: props.free.map((f) => ({
        ...f,
        floor: auctionFloor(f.lastContract, day, props.settings),
      })),
    };
    const sc = buildScenario(data, mode, examples, me, rules, seeded(seed));
    setSession({
      room: createRoom(sc, props.settings, rules, Date.now()),
      seed,
    });
    window.scrollTo({ top: 0 });
  }

  if (session) return <AuctionRoom key={session.seed} initial={session.room} seed={session.seed} me={me} onExit={() => setSession(null)} onRestart={start} />;

  return (
    <>
      <PageTitle
        icon="gavel"
        eyebrow="Playground · niente si salva"
        sub="Prova l'asta come la stiamo pensando: squadre e listone veri, gli altri sette proprietari li fa il computer. Rilancia, fatti superare, pareggia un restricted, chiudi l'asta da admin. Poi dicci se ti piace."
        aside={
          <Scoreboard
            items={[
              { label: "Rilancio minimo", value: fmt(PROPOSED_RULES.step) },
              { label: "Base d'asta", value: "½", tone: "gold" },
              {
                label: "Cronometro",
                value: `${rules.openSeconds}″/${rules.bidSeconds}″`,
              },
            ]}
          />
        }
      >
        L&apos;asta
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <section className="rise rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="sala-title" style={stagger(1)}>
          <h2 id="sala-title" className="font-display text-3xl leading-none font-extrabold">
            Prepara la sala
          </h2>
          <div className="mt-5 grid gap-5">
            <Field label="La tua squadra" htmlFor="asta-me" hint="Le altre le muove il computer, ognuna col suo carattere.">
              <div className="flex items-center gap-3">
                {props.teams.find((t) => t.id === me) && (
                  <TeamCrest name={props.teams.find((t) => t.id === me)!.name} color={props.teams.find((t) => t.id === me)!.color} size="sm" mine />
                )}
                <select id="asta-me" className={inputClass} value={me} onChange={(e) => setMe(e.target.value)}>
                  {props.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field
              label="Che asta"
              hint={
                mode === "today" ? (
                  <>
                    Riparazione: rose, cap e listone di oggi. Oggi possono comprare{" "}
                    <strong className="font-semibold text-foreground">
                      {buyers} squadre su {props.teams.length}
                    </strong>
                    {examples ? " (più le due che tagliano negli esempi)" : ""}.
                  </>
                ) : (
                  "Da zero: rose vuote e tutti all'asta, per sentire il ritmo di un'asta piena. Chi è in rosa oggi vale il suo stipendio."
                )
              }
            >
              <Segmented
                label="Che asta"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "today", label: "Rose di oggi" },
                  { value: "zero", label: "Da zero" },
                ]}
              />
            </Field>
            <Field
              label="Ritmo"
              hint={`${rules.openSeconds}″ per la prima offerta dopo la chiamata, poi ogni rilancio riporta il cronometro a ${rules.bidSeconds}″.`}
            >
              <Segmented
                label="Ritmo"
                value={pace}
                onChange={setPace}
                options={(Object.keys(PACES) as Pace[]).map((p) => ({
                  value: p,
                  label: `${PACES[p].label} ${PACES[p].open}/${PACES[p].bid}`,
                }))}
              />
            </Field>
            <Check checked={examples} onChange={setExamples}>
              <span>
                Esempi di tagliati e restricted
                <span className="block text-xs text-muted">Due tagliati aprono l&apos;asta, uno dei restricted è tuo: provi il pareggio.</span>
              </span>
            </Check>
            <Button variant="gold" icon="gavel" onClick={start} disabled={!me} className="min-h-13 text-xl">
              Entra in sala
            </Button>
          </div>
        </section>

        <div className="grid content-start gap-6">
          <HowItWorks rules={rules} />
          <Proposals />
        </div>
      </div>
    </>
  );
}

/** Le regole in cinque righe, con gli ID del regolamento. */
function HowItWorks({ rules }: { rules: AuctionRules }) {
  const steps: {
    icon: Parameters<typeof Icon>[0]["name"];
    title: string;
    text: ReactNode;
  }[] = [
    {
      icon: "gavel",
      title: "Si chiama a turno",
      text: "L'ordine è sorteggiato. Chi chiama apre alla base, metà del valore Dunkest (R-51), o più su. Chi non ha posto passa.",
    },
    {
      icon: "plus",
      title: `Si rilancia di ${fmt(rules.step)}`,
      text: "Vince solo chi supera: il pareggio non conta (R-51). Si può saltare di più per farsi sentire.",
    },
    {
      icon: "stopwatch",
      title: `${rules.openSeconds}″, poi ${rules.bidSeconds}″`,
      text: "Ogni rilancio riporta il cronometro a 10″: nessuno vince all'ultimo decimo senza replica.",
    },
    {
      icon: "trophy",
      title: "E uno, e due, e tre",
      text: "Aggiudicato. La durata del contratto si sceglie dopo (R-51), come oggi.",
    },
    {
      icon: "shield",
      title: "Chiude un admin",
      text: "Pausa, annulla l'ultima offerta, aggiudica subito, chiudi l'asta. Nel playground l'admin sei tu.",
    },
  ];
  return (
    <section className="rise rounded-2xl border border-line bg-surface p-5 sm:p-6" style={stagger(2)} aria-labelledby="come-title">
      <h2 id="come-title" className="font-display text-3xl leading-none font-extrabold">
        Come funziona
      </h2>
      <ol className="mt-4 grid gap-3.5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-blue/10 text-brand-blue dark:bg-nav dark:text-gold">
              <Icon name={s.icon} size={18} />
            </span>
            <span className="min-w-0 text-sm leading-5">
              <span className="font-display block text-lg leading-tight font-extrabold">
                <span className="tnum text-muted">{i + 1}.</span> {s.title}
              </span>
              <span className="text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Proposte per tagliati e restricted, da decidere tra gli admin, e la prova di Realtime. */
function Proposals() {
  return (
    <section className="rise rounded-2xl border border-gold/50 bg-gold/6 p-5 sm:p-6" style={stagger(3)} aria-labelledby="proposte-title">
      <div className="flex items-center gap-2">
        <Badge tone="gold" icon="star">
          Proposta
        </Badge>
        <span className="text-xs text-muted">da decidere tra gli admin</span>
      </div>
      <h2 id="proposte-title" className="font-display mt-2 text-3xl leading-none font-extrabold">
        Tagliati e restricted
      </h2>
      <dl className="mt-4 grid gap-3 text-sm leading-5">
        <div>
          <dt className="font-semibold">Tagliati (R-40..R-42)</dt>
          <dd className="text-muted">
            Aprono la sala, uno dopo l&apos;altro, chiamati dall&apos;app. Base: metà del valore, mai sotto metà dell&apos;ultimo stipendio (R-25). L&apos;ex
            proprietario non offre. Nessuna offerta in {PROPOSED_RULES.openSeconds}″: sceglie lui, taglio definitivo o rientro.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Restricted (R-23, R-24)</dt>
          <dd className="text-muted">
            Li chiama chiunque, come gli altri. Chi ha il diritto non rilancia: allo scadere ha {PROPOSED_RULES.matchSeconds}″ per pareggiare l&apos;offerta più
            alta, senza replica. Se nessuno offre, può tenerlo alla base. Il contratto che ne esce è unrestricted (R-24).
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Spesa</dt>
          <dd className="text-muted">Si offre fino allo spazio salariale più la zona della luxury tax (R-12, fino a 270), o fino al budget riserve.</dd>
        </div>
      </dl>
      <div className="mt-5 flex gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm">
        <span className="mt-0.5 shrink-0 text-success">
          <Icon name="bolt" size={18} />
        </span>
        <p className="leading-5 text-muted">
          <span className="font-semibold text-foreground">Il tempo reale regge.</span> Prova del 3 novembre su Supabase gratuito: 9 telefoni simulati nello
          stesso canale, 218 rilanci in un minuto, anche tutti nello stesso istante. Nessuno perso, arrivati a tutti in 53 ms (95%). Il piano gratuito ne regge
          200 collegati e 100 messaggi al secondo.
        </p>
      </div>
    </section>
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** La sala: stato nel reducer, i sette avversari simulati in un giro ogni decimo di secondo. */
function AuctionRoom({ initial, seed, me, onExit, onRestart }: { initial: Room; seed: number; me: string; onExit: () => void; onRestart: () => void }) {
  const [room, dispatch] = useReducer(roomReducer, initial);
  const [now, setNow] = useState(initial.startedAt);
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Avversari simulati: ognuno ha un valore privato per il giocatore in palio e un carattere (rapido, calmo, cecchino).
  useEffect(() => {
    const rand = seeded(seed ^ 0x5bd1e995);
    const bots = makeBots(
      initial.teams.map((t) => t.id).filter((id) => id !== me),
      rand,
    );
    let values = { seq: -1, map: new Map<string, number>() };
    const plans = new Map<string, { key: string; at: number; amount: number }>();
    let callPlan: { key: string; at: number } | null = null;
    let matchPlan: { seq: number; at: number; take: boolean } | null = null;

    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const r = roomRef.current;
      if (r.ended) return;
      const lot = r.lot;
      if (lot && isLive(lot)) {
        if (lot.pausedLeft !== null) return;
        if (t >= lot.deadline) return dispatch({ type: "tick", now: t });
        if (values.seq !== r.lotSeq) {
          values = {
            seq: r.lotSeq,
            map: new Map(
              bots.map((b) => {
                const side = r.teams.find((x) => x.id === b.teamId)!.side;
                const need = bidLimit(side, lot.player.pos, r.settings, r.rules).starter !== null;
                return [b.teamId, botValue(lot.player, need, b, rand, r.rules.step, lot.kind === "restricted" && lot.formerTeamId === b.teamId)];
              }),
            ),
          };
          plans.clear();
        }
        if (lot.phase === "open") {
          const key = `${r.lotSeq}:${lot.bids.length}`;
          const min = minimumBid(lot, r.rules);
          let due: { teamId: string; amount: number; at: number } | null = null;
          for (const b of bots) {
            if (leader(lot)?.teamId === b.teamId || excludedReason(lot, b.teamId)) continue;
            let plan = plans.get(b.teamId);
            if (!plan || plan.key !== key) {
              const top = Math.min(values.map.get(b.teamId) ?? 0, limitFor(r, b.teamId, lot.player.pos));
              plan =
                min <= top
                  ? {
                      key,
                      at: t + botDelay(b, secondsLeft(lot, t), rand),
                      amount: botAmount(min, top, r.rules.step, rand),
                    }
                  : { key, at: Infinity, amount: 0 };
              plans.set(b.teamId, plan);
            }
            if (plan.at <= t && (!due || plan.at < due.at)) due = { teamId: b.teamId, amount: plan.amount, at: plan.at };
          }
          if (due)
            dispatch({
              type: "bid",
              teamId: due.teamId,
              amount: due.amount,
              now: t,
            });
        } else if (lot.phase === "match" && lot.formerTeamId && lot.formerTeamId !== me) {
          if (!matchPlan || matchPlan.seq !== r.lotSeq)
            matchPlan = {
              seq: r.lotSeq,
              at: t + 1500 + rand() * 2500,
              take: (values.map.get(lot.formerTeamId) ?? 0) >= matchPrice(lot),
            };
          if (t >= matchPlan.at)
            dispatch({
              type: matchPlan.take ? "match" : "decline",
              teamId: lot.formerTeamId,
              now: t,
            });
        }
        return;
      }
      if (lot && r.settledAt !== null) {
        if (t - r.settledAt > SETTLE_MS) dispatch({ type: "next", now: t });
        return;
      }
      if (!lot && r.caller && r.caller !== me) {
        const key = `${r.caller}:${r.turnSince}`;
        if (callPlan?.key !== key) callPlan = { key, at: t + 1400 + rand() * 2000 };
        if (t < callPlan.at) return;
        const caller = r.caller;
        const side = r.teams.find((x) => x.id === caller)!.side;
        const byId = new Map(r.pool.map((e) => [e.player.id, e]));
        const affordable = (p: LotPlayer) => {
          const e = byId.get(p.id)!;
          return e.formerTeamId !== caller && limitFor(r, caller, p.pos) >= e.base;
        };
        const players = r.pool.map((e) => e.player);
        const pick =
          botCall(players, (p) => affordable(p) && bidLimit(side, p.pos, r.settings, r.rules).starter !== null, rand) ?? botCall(players, affordable, rand);
        dispatch(
          pick
            ? {
                type: "call",
                teamId: caller,
                playerId: pick.id,
                amount: byId.get(pick.id)!.base,
                now: t,
              }
            : { type: "pass", teamId: caller, now: t },
        );
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [seed, me, initial.teams]);

  const act: Act = (a) => dispatch({ ...a, now: Date.now() } as RoomAction);
  const info = useMemo(() => new Map<string, TeamInfo>(room.teams.map((t) => [t.id, { id: t.id, name: t.name, color: t.color }])), [room.teams]);
  const team = (id: string) => info.get(id);

  // Superato: velo rosso sul palco e una vibrazione sul telefono (dove c'è).
  const lot = room.lot;
  // Solo il rilancio che ti ha tolto il primo posto, non quelli dopo.
  const outbid = lot && isLive(lot) && lot.bids.at(-2)?.teamId === me ? lot.bids.at(-1)! : null;
  const outbidKey = outbid ? `${room.lotSeq}-${outbid.at}` : null;
  useEffect(() => {
    if (outbidKey) navigator.vibrate?.(60);
  }, [outbidKey]);
  const wonKey = lot?.result?.teamId === me ? room.lotSeq : null;
  useEffect(() => {
    if (wonKey !== null) navigator.vibrate?.([40, 60, 120]);
  }, [wonKey]);

  if (room.ended) return <Summary room={room} me={me} team={team} onRestart={onRestart} onExit={onExit} />;

  const s = room.settings;
  const startersMax = s.starters.G + s.starters.A + s.starters.C;
  const rows: BoardRow[] = room.order.map((id) => {
    const t = room.teams.find((x) => x.id === id)!;
    const f = teamFinance(t.side.roster, t.side.cuts, t.side.bonus, s);
    const { spent, sales } = teamSummary(room, id);
    const top = lot ? leader(lot) : null;
    const lastBid = lot?.bids.findLast((b) => b.teamId === id);
    const limit = lot ? limitFor(room, id, lot.player.pos) : null;
    let state: BoardRow["state"] = null;
    if (lot && isLive(lot)) {
      if (top?.teamId === id) state = "leader";
      else if (lot.formerTeamId === id && lot.kind === "restricted") state = "holder";
      else if (excludedReason(lot, id)) state = "excluded";
      else if (limit !== null && limit < minimumBid(lot, room.rules)) state = "out";
    } else if (!lot && room.caller === id) state = "caller";
    return {
      team: info.get(id)!,
      capSpace: f.capSpace,
      starters: t.side.roster.filter((r) => r.slot === "starter").length,
      startersMax,
      reserves: t.side.roster.filter((r) => r.slot === "reserve").length,
      reservesMax: s.reserveMax,
      spent,
      bought: sales.length,
      limit,
      state,
      flash: lastBid && lot && isLive(lot) ? `${room.lotSeq}-${lastBid.at}` : null,
    };
  });

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0">
        <StatusBar room={room} now={now} team={team} me={me} onExit={onExit} act={act} />

        {lot ? (
          <Stage room={room} now={now} me={me} team={team} outbidKey={outbidKey} />
        ) : room.caller === me ? (
          <CallPicker key={room.turnSince} room={room} me={me} team={team} act={act} />
        ) : room.caller ? (
          <BotCalling team={team(room.caller)!} />
        ) : (
          <Stalled act={act} />
        )}

        {lot && <BidDock key={room.lotSeq} room={room} me={me} now={now} act={act} />}

        {lot && (
          <section className="mt-6" aria-labelledby="registro-title">
            <h2 id="registro-title" className="eyebrow mb-2 text-muted">
              Registro del lotto
            </h2>
            <BidFeed lot={lot} team={team} me={me} now={now} />
          </section>
        )}
      </div>

      <aside className="mt-8 grid gap-6 lg:sticky lg:top-24 lg:mt-0">
        <section aria-labelledby="board-title">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="board-title" className="font-display text-2xl leading-none font-extrabold">
              In sala
            </h2>
            <span className="text-xs text-muted">ordine di chiamata</span>
          </div>
          <TeamBoard rows={rows} me={me} />
        </section>
        {room.sales.length > 0 && (
          <section aria-labelledby="presi-title">
            <h2 id="presi-title" className="font-display mb-2 text-2xl leading-none font-extrabold">
              Aggiudicati <span className="tnum text-muted">{room.sales.length}</span>
            </h2>
            <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {[...room.sales]
                .reverse()
                .slice(0, 6)
                .map((sale) => (
                  <SaleRow key={sale.at} sale={sale} team={team} me={me} />
                ))}
            </ol>
          </section>
        )}
      </aside>
    </div>
  );
}

/** Azione della sala senza l'ora: la mette `act` al momento del tocco. */
type WithoutNow<T> = T extends unknown ? Omit<T, "now"> : never;
type Act = (a: WithoutNow<RoomAction>) => void;

/** Riga di stato: blocco (tagliati o free agent), lotto, tempo, ordine di chiamata e comandi dell'admin. */
function StatusBar({
  room,
  now,
  team,
  me,
  onExit,
  act,
}: {
  room: Room;
  now: number;
  team: (id: string) => TeamInfo | undefined;
  me: string;
  onExit: () => void;
  act: Act;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const lot = room.lot;
  const cut = lot?.kind === "cut" || room.cutQueue.length > 0;
  const paused = lot?.pausedLeft !== null && lot?.pausedLeft !== undefined;
  const canUndo = !!lot && lot.phase === "open" && lot.bids.length > 0;
  const hide = () => document.getElementById("asta-admin")?.hidePopover();
  return (
    <div className="mb-3 flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={onExit}
        aria-label="Esci dalla sala"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-foreground"
      >
        <Icon name="arrow-left" size={18} />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-display truncate text-xl font-extrabold sm:text-2xl">{cut ? "Asta dei tagliati" : "Free agent"}</div>
        <div className="tnum truncate text-xs text-muted">
          Lotto {Math.max(1, room.lotSeq)} · {room.sales.length} aggiudicati · {mmss(now - room.startedAt)}
        </div>
      </div>
      <span className="hidden -space-x-1.5 sm:flex" aria-label="Ordine di chiamata">
        {room.order.map((id) => {
          const t = team(id)!;
          const on = (lot ? lot.calledBy : room.caller) === id;
          return (
            <span key={id} className={`transition-transform ${on ? "relative z-[1] -translate-y-1" : "opacity-55"}`} title={t.name}>
              <TeamCrest name={t.name} color={t.color} size="xs" mine={id === me} />
            </span>
          );
        })}
      </span>
      <button
        type="button"
        popoverTarget="asta-admin"
        className="font-display inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-base font-extrabold transition-colors hover:border-brand-blue hover:text-brand-blue"
      >
        <Icon name="shield" size={17} />
        Admin
      </button>
      <div id="asta-admin" popover="auto" className="sheet" onToggle={() => setConfirmEnd(false)}>
        <div className="arena px-5 pt-5 pb-4">
          <div className="relative z-[2] flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-white/60">Comandi dell&apos;admin</p>
              <h2 className="font-display mt-1 text-4xl leading-none font-black">Banditore</h2>
            </div>
            <button
              type="button"
              popoverTarget="asta-admin"
              popoverTargetAction="hide"
              aria-label="Chiudi"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>
        <div className="grid gap-2 p-5">
          <Button
            variant="secondary"
            icon={paused ? "stopwatch" : "clock"}
            disabled={!lot || !isLive(lot)}
            onClick={() => {
              act({ type: paused ? "resume" : "pause" });
              hide();
            }}
          >
            {paused ? "Riprendi" : "Metti in pausa"}
          </Button>
          <Button
            variant="secondary"
            icon="arrow-left"
            disabled={!canUndo}
            onClick={() => {
              act({ type: "undo" });
              hide();
            }}
          >
            Annulla l&apos;ultima offerta
          </Button>
          <Button
            variant="secondary"
            icon="gavel"
            disabled={!lot || !isLive(lot)}
            onClick={() => {
              act({ type: "close" });
              hide();
            }}
          >
            Aggiudica adesso
          </Button>
          <div className="mt-3 border-t border-line pt-4">
            {confirmEnd ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted">L&apos;asta finisce per tutti. Un lotto aperto va a chi è in testa.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                    No
                  </Button>
                  <Button
                    variant="danger"
                    icon="trophy"
                    onClick={() => {
                      act({ type: "end" });
                      hide();
                    }}
                  >
                    Chiudi l&apos;asta
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" icon="trophy" className="w-full" onClick={() => setConfirmEnd(true)}>
                Chiudi l&apos;asta
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Nell&apos;asta vera questi comandi li vedono solo gli admin.</p>
        </div>
      </div>
    </div>
  );
}

/** Palco: il giocatore in palio, l'offerta in testa, lo shot clock; il timbro quando il lotto si chiude. */
function Stage({
  room,
  now,
  me,
  team,
  outbidKey,
}: {
  room: Room;
  now: number;
  me: string;
  team: (id: string) => TeamInfo | undefined;
  outbidKey: string | null;
}) {
  const lot = room.lot!;
  const entry = room.entry!;
  const p = lot.player;
  const caller = lot.calledBy ? team(lot.calledBy) : undefined;
  const lim = bidLimit(room.teams.find((t) => t.id === me)!.side, p.pos, room.settings, room.rules);
  return (
    <section
      key={room.lotSeq}
      className="arena sweep relative -mx-4 overflow-hidden px-5 pt-5 pb-4 sm:mx-0 sm:rounded-3xl sm:px-7 sm:pt-6"
      aria-label={`In palio: ${p.name}`}
    >
      {outbidKey && <span key={outbidKey} aria-hidden className="flash-veil z-[1] bg-brand-red/20" />}
      <div className="relative z-[2]">
        <div className="rise flex flex-wrap items-center gap-2">
          <LotKindBadge entry={entry} team={team} />
          <span className="text-xs text-white/60">
            {caller ? (
              <>
                chiamato da <span className="font-semibold text-white/85">{caller.id === me ? "te" : caller.name}</span>
              </>
            ) : (
              "chiamato dall'app"
            )}
          </span>
        </div>
        <div className="rise mt-3 flex items-center gap-3" style={stagger(1)}>
          <span className="scale-125">
            <PosChip pos={p.pos} />
          </span>
          <h2 className="font-display line-clamp-2 min-w-0 text-[clamp(2rem,8vw,3.5rem)] leading-[0.92] font-black break-words">{p.name}</h2>
        </div>
        <p className="rise mt-1.5 text-sm text-white/65" style={stagger(2)}>
          {[p.nbaTeam, p.pdk !== null ? `PDK ${fmt(Math.round(p.pdk * 10) / 10)}` : null, `${fmt(p.credits)} ${entry.valueLabel}`].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-5 flex items-end justify-between gap-4">
          <PriceBlock lot={lot} team={team} me={me} />
          {isLive(lot) && <ShotClock lot={lot} now={now} rules={room.rules} />}
        </div>
        <div className="mt-4">{isLive(lot) ? <ClockBar lot={lot} now={now} rules={room.rules} /> : <div className="h-1.5" />}</div>

        <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12">
          <StageStat label="Base" value={fmt(lot.base)} />
          <StageStat label="Rilancio" value={`+${fmt(room.rules.step)}`} />
          <StageStat label="Il tuo max" value={lim.max > 0 ? fmt(lim.max) : "–"} tone={lim.max >= minimumBid(lot, room.rules) ? "good" : "bad"} />
        </dl>
      </div>
      {!isLive(lot) && <SoldStamp lot={lot} team={team} me={me} />}
    </section>
  );
}

/** Pulsantiera: offri il minimo con un tocco, o scegli un salto e poi offri. Pareggio per chi ha il diritto. */
function BidDock({ room, me, now, act }: { room: Room; me: string; now: number; act: Act }) {
  const [jump, setJump] = useState<{ key: number; by: number }>({
    key: -1,
    by: 0,
  });
  const lot = room.lot!;
  const min = minimumBid(lot, room.rules);
  const by = jump.key === lot.bids.length ? jump.by : 0;
  const amount = Math.round((min + by) * 10) / 10;
  const lim = bidLimit(room.teams.find((t) => t.id === me)!.side, lot.player.pos, room.settings, room.rules);
  const top = leader(lot);
  const holder = lot.kind === "restricted" && lot.formerTeamId === me;
  const paused = lot.pausedLeft !== null;

  let body: ReactNode;
  if (!isLive(lot)) {
    body = <DockLine icon="clock" text="Prossimo lotto tra un attimo…" />;
  } else if (lot.phase === "match") {
    body = holder ? (
      <div className="grid gap-2">
        <p className="text-sm">
          <span className="font-semibold">Diritto di pareggio (R-23).</span>{" "}
          <span className="text-white/65">Lo tieni a {fmt(matchPrice(lot))}, senza replica.</span>
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="ghost" className="border border-white/15" onClick={() => act({ type: "decline", teamId: me })}>
            Lascia
          </Button>
          <Button variant="gold" icon="hand" disabled={lim.max < matchPrice(lot)} onClick={() => act({ type: "match", teamId: me })}>
            Pareggia a {fmt(matchPrice(lot))}
          </Button>
        </div>
      </div>
    ) : (
      <DockLine
        icon="hand"
        text={`${lot.formerTeamId ? "Chi ha il diritto" : "Il proprietario"} decide se pareggiare (${Math.ceil(secondsLeft(lot, now))}″)`}
      />
    );
  } else if (paused) {
    body = <DockLine icon="clock" text="Asta in pausa: aspetta l'admin." />;
  } else if (holder) {
    body = <DockLine icon="hand" text="Hai il diritto di pareggio: non rilanci, allo scadere decidi tu." tone="accent" />;
  } else if (excludedReason(lot, me)) {
    body = <DockLine icon="lock" text="L'hai tagliato tu: non partecipi a questo lotto (R-41)." />;
  } else if (top?.teamId === me) {
    body = <DockLine icon="crown" text={`Sei in testa a ${fmt(top.amount)}. Tieni duro.`} tone="gold" />;
  } else if (lim.max < min) {
    body = <DockLine icon="lock" text={lim.max > 0 ? `Non hai spazio: arrivi al massimo a ${fmt(lim.max)}.` : "Nessun posto libero per questo ruolo."} />;
  } else {
    const jumps = [1, 2, 5].filter((j) => min + j <= lim.max);
    body = (
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <span className="eyebrow shrink-0 text-white/55">Salta</span>
          <div className="flex flex-1 gap-1.5">
            {jumps.map((j) => {
              const on = by === j;
              return (
                <button
                  key={j}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setJump({ key: lot.bids.length, by: on ? 0 : j })}
                  className={`font-display tnum min-h-10 flex-1 rounded-lg text-lg font-extrabold transition-[background-color,color] ${on ? "bg-gold text-nav" : "bg-white/10 hover:bg-white/15"}`}
                >
                  +{j}
                </button>
              );
            })}
          </div>
        </div>
        <Button className="min-h-14 w-full text-2xl" icon="gavel" onClick={() => act({ type: "bid", teamId: me, amount })}>
          Offri <span className="tnum">{fmt(amount)}</span>
        </Button>
        <p className="tnum text-center text-xs text-white/60">
          Arrivi a {fmt(lim.max)}
          {lim.starter !== null && amount > lim.capSpace && lim.capSpace >= 0 ? (
            <span className="text-arena-warn"> · oltre {fmt(lim.capSpace)} sfori il cap: luxury tax</span>
          ) : null}
        </p>
      </div>
    );
  }

  const error = room.error?.teamId === me && now - room.error.at < 3000 ? room.error.text : null;
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-3 lg:bottom-4">
      <div className="pop chrome rounded-2xl border border-white/10 p-2.5 shadow-[0_10px_30px_rgb(6_10_20/0.2)] backdrop-blur-md dark:shadow-[0_10px_30px_rgb(6_10_20/0.35)]">
        {error && (
          <p role="alert" className="mb-2 rounded-lg bg-brand-red/15 px-3 py-1.5 text-xs font-semibold text-arena-bad">
            {error}
          </p>
        )}
        {body}
      </div>
    </div>
  );
}

function DockLine({ icon, text, tone }: { icon: Parameters<typeof Icon>[0]["name"]; text: string; tone?: "gold" | "accent" }) {
  return (
    <p className="flex min-h-12 items-center gap-3 px-1.5 text-sm">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone === "gold" ? "bg-gold text-nav" : tone === "accent" ? "bg-brand-blue text-white" : "bg-white/10"}`}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">{text}</span>
    </p>
  );
}

/** Tocca a te: scegli chi chiamare e a quanto aprire. */
function CallPicker({ room, me, team, act }: { room: Room; me: string; team: (id: string) => TeamInfo | undefined; act: Act }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "all">("all");
  const [picked, setPicked] = useState<PoolEntry | null>(null);
  const [extra, setExtra] = useState(0);
  const [more, setMore] = useState(40);
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const list = room.pool.filter((e) => (pos === "all" || e.player.pos === pos) && (!q || norm(e.player.name).includes(norm(q))));
  const limit = (e: PoolEntry) => limitFor(room, me, e.player.pos);
  const holder = picked?.kind === "restricted" && picked.formerTeamId === me;
  const opening = picked ? picked.base + extra : 0;

  return (
    <>
      <section className="arena relative -mx-4 overflow-hidden px-5 pt-5 pb-4 sm:mx-0 sm:rounded-3xl sm:px-7 sm:pt-6" aria-labelledby="chiama-title">
        <div className="relative z-[2]">
          <p className="rise eyebrow flex items-center gap-2 text-highlight">
            <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
            Tocca a te
          </p>
          <h2 id="chiama-title" className="rise font-display mt-2 text-[clamp(2.25rem,8vw,3.5rem)] leading-[0.9] font-black" style={stagger(1)}>
            Chiama un giocatore
          </h2>
          <p className="rise mt-2 text-sm text-white/65" style={stagger(2)}>
            Apri alla base o più su: gli altri hanno {room.rules.openSeconds}″ per rilanciare.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca per nome"
              aria-label="Cerca per nome"
              className={`${inputClass} border-white/15 bg-white/8`}
            />
            <Segmented
              label="Ruolo"
              value={pos}
              onChange={setPos}
              options={[
                { value: "all", label: "Tutti" },
                { value: "G", label: "G" },
                { value: "A", label: "A" },
                { value: "C", label: "C" },
              ]}
            />
          </div>
          <ul className="mt-3 max-h-[min(24rem,48dvh)] divide-y divide-white/10 overflow-y-auto overscroll-contain rounded-xl border border-white/12 bg-board">
            {list.slice(0, more).map((e) => {
              const own = e.kind === "restricted" && e.formerTeamId === me;
              const ok = own || limit(e) >= e.base;
              const on = picked === e;
              return (
                <li key={e.player.id}>
                  <button
                    type="button"
                    disabled={!ok}
                    aria-pressed={on}
                    onClick={() => {
                      setPicked(on ? null : e);
                      setExtra(0);
                    }}
                    className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:opacity-40 ${on ? "bg-gold/15" : "hover:bg-white/6"}`}
                  >
                    <PosChip pos={e.player.pos} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-semibold">{e.player.name}</span>
                      <span className="block truncate text-xs text-white/55">
                        {[
                          e.player.nbaTeam,
                          e.player.pdk !== null ? `PDK ${fmt(Math.round(e.player.pdk * 10) / 10)}` : null,
                          `${fmt(e.player.credits)} ${e.valueLabel === "crediti Dunkest" ? "cr" : "stip."}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {!ok && " · fuori budget"}
                      </span>
                    </span>
                    {e.kind !== "free" && <LotKindBadge entry={e} team={team} />}
                    <span className="tnum shrink-0 text-right text-[0.6875rem] leading-tight text-white/55">
                      base
                      <span className="font-display block text-xl leading-none font-extrabold text-white">{fmt(e.base)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length > more && (
              <li>
                <button type="button" onClick={() => setMore((m) => m + 40)} className="min-h-12 w-full text-sm font-bold text-highlight">
                  Altri {Math.min(40, list.length - more)}
                </button>
              </li>
            )}
            {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-white/60">Nessun giocatore con questo filtro.</li>}
          </ul>
        </div>
      </section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-3 lg:bottom-4">
        <div className="pop chrome rounded-2xl border border-white/10 p-2.5 shadow-[0_10px_30px_rgb(6_10_20/0.2)] backdrop-blur-md dark:shadow-[0_10px_30px_rgb(6_10_20/0.35)]">
          {picked && (
            <div className="mb-2 flex min-h-12 items-center gap-3 pl-1">
              <PosChip pos={picked.player.pos} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{picked.player.name}</span>
              {!holder && (
                <div className="flex shrink-0 items-center rounded-lg bg-white/10" role="group" aria-label="Offerta di apertura">
                  <button
                    type="button"
                    aria-label="Meno"
                    disabled={extra <= 0}
                    onClick={() => setExtra((x) => Math.max(0, x - room.rules.step))}
                    className="grid h-11 w-11 place-items-center text-xl disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="font-display tnum min-w-12 text-center text-2xl font-extrabold">{fmt(opening)}</span>
                  <button
                    type="button"
                    aria-label="Più"
                    disabled={opening + room.rules.step > limit(picked)}
                    onClick={() => setExtra((x) => x + room.rules.step)}
                    className="grid h-11 w-11 place-items-center text-xl disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="ghost" className="border border-white/15" onClick={() => act({ type: "pass", teamId: me })}>
              Passo
            </Button>
            {picked ? (
              <Button
                className="min-h-12"
                icon="gavel"
                onClick={() =>
                  act({
                    type: "call",
                    teamId: me,
                    playerId: picked.player.id,
                    amount: opening,
                  })
                }
              >
                {holder ? "Chiama (hai il pareggio)" : `Chiama a ${fmt(opening)}`}
              </Button>
            ) : (
              <p className="flex min-h-12 items-center justify-center text-sm text-white/60">Tocca un giocatore per chiamarlo</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function BotCalling({ team }: { team: TeamInfo }) {
  return (
    <section className="arena -mx-4 grid min-h-[20rem] place-items-center px-5 py-10 text-center sm:mx-0 sm:rounded-3xl" aria-live="polite">
      <div className="relative z-[2] flex flex-col items-center">
        <span key={team.id} className="pop">
          <TeamCrest name={team.name} color={team.color} size="lg" />
        </span>
        <p className="eyebrow mt-4 text-white/60">Tocca a</p>
        <h2 className="font-display mt-1 text-4xl leading-none font-black">{team.name}</h2>
        <p className="mt-3 flex items-center gap-2 text-sm text-white/65">
          <BallLoader size={18} /> sta scegliendo chi chiamare…
        </p>
      </div>
    </section>
  );
}

function Stalled({ act }: { act: Act }) {
  return (
    <section className="arena -mx-4 grid min-h-[18rem] place-items-center px-5 py-10 text-center sm:mx-0 sm:rounded-3xl">
      <div className="relative z-[2] flex max-w-sm flex-col items-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10">
          <Icon name="lock" size={26} />
        </span>
        <h2 className="font-display mt-4 text-4xl leading-none font-black">Sala ferma</h2>
        <p className="mt-2 text-sm text-white/65">Nessuno chiama più: rose piene o tutti hanno passato. Tocca all&apos;admin chiudere.</p>
        <Button variant="gold" icon="trophy" className="mt-5" onClick={() => act({ type: "end" })}>
          Chiudi l&apos;asta
        </Button>
      </div>
    </section>
  );
}

/** Fine dell'asta: numeri, i tre momenti da raccontare, acquisti per squadra. */
function Summary({
  room,
  me,
  team,
  onRestart,
  onExit,
}: {
  room: Room;
  me: string;
  team: (id: string) => TeamInfo | undefined;
  onRestart: () => void;
  onExit: () => void;
}) {
  const sales = room.sales;
  const bids = sales.reduce((n, x) => n + x.bids, 0);
  const total = Math.round(sales.reduce((n, x) => n + x.amount, 0) * 10) / 10;
  const priciest = [...sales].sort((a, b) => b.amount - a.amount)[0];
  const fought = [...sales].sort((a, b) => b.bids - a.bids)[0];
  // L'affare: pagato meno del suo valore, in proporzione (tra chi vale almeno 4).
  const steal = [...sales].filter((x) => x.entry.player.credits >= 4).sort((a, b) => a.amount / a.entry.player.credits - b.amount / b.entry.player.credits)[0];
  const moments = [
    {
      label: "Il più caro",
      sale: priciest,
      value: priciest ? fmt(priciest.amount) : "–",
      note: "crediti",
    },
    {
      label: "Il più conteso",
      sale: fought,
      value: fought ? String(fought.bids) : "–",
      note: "offerte",
    },
    {
      label: "L'affare",
      sale: steal,
      value: steal ? fmt(steal.amount) : "–",
      note: steal ? `valeva ${fmt(steal.entry.player.credits)}` : "",
    },
  ];

  return (
    <>
      <PageTitle
        icon="trophy"
        eyebrow="Playground · niente si è salvato"
        sub="Così sarebbe finita. Nell'asta vera da qui partono i contratti, con la durata da fissare (R-51)."
        aside={
          <Scoreboard
            items={[
              { label: "Aggiudicati", value: sales.length },
              { label: "Offerte", value: bids },
              { label: "Spesa", value: fmt(total), tone: "gold" },
              {
                label: "Durata",
                value: mmss((sales.at(-1)?.at ?? room.startedAt) - room.startedAt),
              },
            ]}
          />
        }
      >
        Asta chiusa
      </PageTitle>

      <div className="grid gap-3 sm:grid-cols-3">
        {moments.map((m, i) => {
          const t = m.sale ? team(m.sale.teamId) : undefined;
          return (
            <div key={m.label} className="pop rounded-2xl border border-line bg-surface p-4" style={stagger(i)}>
              <p className="eyebrow text-muted">{m.label}</p>
              <p className="font-display tnum mt-1 text-5xl leading-none font-black">
                {m.value} <span className="text-base font-bold text-muted">{m.note}</span>
              </p>
              {m.sale && t && (
                <p className="mt-3 flex min-w-0 items-center gap-2 text-sm">
                  <TeamCrest name={t.name} color={t.color} size="xs" mine={t.id === me} />
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{m.sale.entry.player.name}</span>
                    <span className="text-muted"> a {t.id === me ? "te" : t.name}</span>
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        {[me, ...room.order.filter((id) => id !== me)].map((id, i) => {
          const { sales: mine, spent, team: t } = teamSummary(room, id);
          const f = t ? teamFinance(t.side.roster, t.side.cuts, t.side.bonus, room.settings) : null;
          const info = team(id)!;
          return (
            <section key={id} className={`rise overflow-hidden rounded-2xl border bg-surface ${id === me ? "border-gold" : "border-line"}`} style={stagger(i)}>
              <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <TeamCrest name={info.name} color={info.color} size="sm" mine={id === me} />
                <h2 className="font-display min-w-0 flex-1 truncate text-2xl leading-none font-extrabold">{info.name}</h2>
                <span className="tnum text-right text-xs leading-tight text-muted">
                  spesi <span className="font-display block text-xl leading-none font-extrabold text-foreground">{fmt(spent)}</span>
                </span>
                {f && (
                  <span className="tnum text-right text-xs leading-tight text-muted">
                    spazio{" "}
                    <span className={`font-display block text-xl leading-none font-extrabold ${f.capSpace < 0 ? "text-danger" : "text-foreground"}`}>
                      {fmt(f.capSpace)}
                    </span>
                  </span>
                )}
              </header>
              {mine.length ? (
                <ol className="divide-y divide-line">
                  {mine.map((x) => (
                    <SaleRow key={x.at} sale={x} team={team} me={me} showTeam={false} />
                  ))}
                </ol>
              ) : (
                <p className="px-4 py-4 text-sm text-muted">Nessun acquisto.</p>
              )}
            </section>
          );
        })}
      </div>

      {room.unsold.length > 0 && (
        <div className="mt-8">
          <Callout tone="warn" title="Senza offerte">
            {room.unsold.map((u) => u.player.name).join(", ")}: per i tagliati l&apos;ex proprietario sceglie taglio definitivo o rientro (R-42).
          </Callout>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="gold" icon="gavel" onClick={onRestart}>
          Rifai l&apos;asta
        </Button>
        <Button variant="secondary" icon="sliders" onClick={onExit}>
          Cambia impostazioni
        </Button>
      </div>
    </>
  );
}
