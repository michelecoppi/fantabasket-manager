"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { markLotterySeen } from "@/app/(lega)/draft/actions";
import { Button } from "@/components/controls";
import { TeamCrest } from "@/components/crest";
import { Icon } from "@/components/icons";
import { Badge, stagger } from "@/components/ui";
import { fmtChance, lotteryOdds, recordEntrants, verifyLottery, type BoardSlot, type LotteryBoard, type LotteryRecord } from "@/lib/draft-lottery";
import { fmtDateTime } from "@/lib/format";

/*
 * Sorteggio del draft (issue #103, R-32). Tre pezzi:
 *  - `LotteryReveal`: la rivelazione a tutto schermo. Presentazione con i biglietti, poi le scelte dall'ultima alla prima: quelle
 *    fuori dalla lottery girano veloci (sono già note), per quelle della lottery un riflettore passa tra le squadre ancora in gara
 *    e si ferma su chi prende la scelta, la carta si gira; la 1ª ha anelli d'oro e coriandoli. Alla fine l'ordine completo.
 *    È teatro su un risultato già estratto dal database: la presentazione lo dice.
 *  - `LotteryOrder`: l'ordine del 1° giro con i numeri di tutti i giri (anche nella pagina del draft).
 *  - `LotteryProof`: seme, biglietti, estrazioni, probabilità e verifica nel browser.
 * Movimento solo con transform e opacity (classi in globals.css); con prefers-reduced-motion niente riflettore né coriandoli.
 */

export interface LotteryTeam {
  id: string;
  name: string;
  color: string;
}

export interface LotteryData {
  record: LotteryRecord;
  board: LotteryBoard;
  teams: LotteryTeam[];
  rounds: number;
}

const ord = (n: number) => `${n}ª`;
/** "dal 5", "dall'1", "dall'8", "dall'11". */
const dal = (n: number) => (n === 1 || n === 11 || String(n).startsWith("8") ? `dall'${n}` : `dal ${n}`);

function useTeams(teams: LotteryTeam[]) {
  return useMemo(() => {
    const byId = new Map(teams.map((t) => [t.id, t]));
    return (id: string) => byId.get(id) ?? { id, name: "?", color: "#555" };
  }, [teams]);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Posti guadagnati o persi rispetto all'ordine senza lottery. */
function MoveBadge({ slot }: { slot: BoardSlot }) {
  if (!slot.lottery) return <span className="text-xs font-semibold text-muted">Classifica</span>;
  if (slot.move > 0) return <Badge tone="good" title={`sale di ${slot.move} rispetto all'ordine di classifica`}>▲ {slot.move}</Badge>;
  if (slot.move < 0) return <Badge tone="bad" title={`scende di ${-slot.move} rispetto all'ordine di classifica`}>▼ {-slot.move}</Badge>;
  return <Badge title="stessa posizione dell'ordine di classifica">=</Badge>;
}

/** "Pick 10 e 26 ora di Bol Bollerz": scelte di un posto passate ad altre squadre. */
function tradedNote(slot: BoardSlot, name: (id: string) => string): string | null {
  if (!slot.traded.length) return null;
  const owners = [...new Set(slot.traded.map((t) => t.ownerId))];
  return owners
    .map((o) => {
      const ns = slot.traded.filter((t) => t.ownerId === o).map((t) => t.number);
      const list = ns.length > 1 ? `${ns.slice(0, -1).join(", ")} e ${ns.at(-1)}` : String(ns[0]);
      return `Pick ${list} ora di ${name(o)}`;
    })
    .join(" · ");
}

// ---------- Ordine e verifica (statici) ----------

export function LotteryOrder({ data }: { data: LotteryData }) {
  const team = useTeams(data.teams);
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {data.board.slots.map((s, i) => {
        const t = team(s.teamId);
        const note = tradedNote(s, (id) => team(id).name);
        return (
          <li key={s.pick} className="rise relative flex items-center gap-3 px-3 py-2.5 sm:px-4" style={stagger(i)}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} />
            <span className={`font-display tnum w-10 shrink-0 text-center text-3xl leading-none font-black ${i === 0 ? "jumbo" : ""}`}>
              {s.pick}
              <span className="sr-only">ª scelta</span>
            </span>
            <TeamCrest name={t.name} color={t.color} size="sm" />
            <span className="min-w-0 flex-1">
              <Link href={`/squadre/${t.id}`} className="block truncate font-semibold hover:underline">
                {t.name}
              </Link>
              <span className="tnum block text-xs text-muted">Scelte {s.numbers.join(" · ")}</span>
              {note && <span className="block truncate text-xs text-highlight">{note}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 text-right">
              {s.lottery && <MoveBadge slot={s} />}
              <span className="text-[0.6875rem] leading-4 text-muted">{s.rank}ª in classifica</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function VerifyButton({ record }: { record: LotteryRecord }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "bad" | "error">("idle");
  const run = async () => {
    setState("busy");
    try {
      setState((await verifyLottery(record)) ? "ok" : "bad");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" icon="check" pending={state === "busy"} onClick={run}>
        Verifica nel browser
      </Button>
      <span role="status" className="text-sm">
        {state === "ok" && <span className="font-semibold text-success">Rifatto qui dal seme: stesso risultato.</span>}
        {state === "bad" && <span className="font-semibold text-danger">Il risultato salvato non torna con il seme.</span>}
        {state === "error" && <span className="text-muted">Questo browser non può fare il calcolo (serve una pagina sicura).</span>}
      </span>
    </div>
  );
}

export function LotteryProof({ data }: { data: LotteryData }) {
  const team = useTeams(data.teams);
  const { record, board } = data;
  const entrants = recordEntrants(record);
  const odds = lotteryOdds(entrants);
  const lotterySlots = board.slots.filter((s) => s.draw).sort((a, b) => a.draw!.step - b.draw!.step);
  const m = entrants.length;
  return (
    <div className="space-y-5 text-sm leading-6">
      <p className="text-muted">
        Estratto da <b className="text-foreground">{record.drawnBy}</b> il {fmtDateTime(record.drawnAt)}, una volta sola. Il seme casuale l&apos;ha generato il
        database, non il telefono di chi ha premuto il pulsante:
      </p>
      <p className="rounded-lg border border-line bg-surface-subtle px-3 py-2 font-mono text-xs break-all">{record.seed}</p>
      <p className="text-muted">
        Per la scelta <i>n</i> si calcola SHA-256 di «seme:<i>n</i>», si prendono i primi 4 byte come numero e si divide per i biglietti ancora in gara: il resto è
        il biglietto uscito. Chi esce prende la scelta e le altre restano con gli stessi biglietti; l&apos;ultima rimasta prende la {ord(m)}.
      </p>

      <div>
        <h3 className="eyebrow mb-2 text-muted">Estrazioni</h3>
        <ol className="space-y-1.5">
          {lotterySlots.map((s) => {
            const t = team(s.teamId);
            const d = s.draw!;
            return (
              <li key={s.pick} className="flex items-start gap-2.5">
                <TeamCrest name={t.name} color={t.color} size="xs" />
                <span className="min-w-0">
                  <b>{ord(s.pick)} scelta: {t.name}</b>{" "}
                  <span className="text-muted">
                    {d.roll === null
                      ? "· ultima rimasta, nessuna estrazione"
                      : `· uscito il ${d.roll + 1} su ${d.total} biglietti (suoi: ${d.from === d.to ? `il ${d.from}` : `${dal(d.from)} al ${d.to}`})`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <h3 className="eyebrow mb-2 text-muted">Probabilità di partenza</h3>
        <div role="region" aria-label="Probabilità di ogni scelta, scorri in orizzontale" tabIndex={0} className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[22rem] text-xs">
            <thead>
              <tr className="eyebrow border-b border-line bg-surface-subtle/60 text-left text-muted">
                <th scope="col" className="px-3 py-1.5 font-bold">Squadra</th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">Biglietti</th>
                {entrants.map((_, k) => (
                  <th key={k} scope="col" className="px-2 py-1.5 text-right font-bold">{ord(k + 1)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entrants.map((e, i) => {
                const t = team(e.teamId);
                const got = board.slots.find((s) => s.teamId === e.teamId)?.pick;
                return (
                  <tr key={e.teamId}>
                    <th scope="row" className="px-3 py-1.5 text-left font-semibold whitespace-nowrap">
                      {t.name} <span className="font-normal text-muted">({e.rank}ª)</span>
                    </th>
                    <td className="tnum px-2 py-1.5 text-right">{e.weight}</td>
                    {odds[i].map((p, k) => (
                      <td key={k} className={`tnum px-2 py-1.5 text-right ${got === k + 1 ? "font-bold text-brand-blue" : "text-muted"}`}>
                        {fmtChance(p)}
                        {got === k + 1 && <span className="sr-only"> (uscita)</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-muted">In blu la scelta che ognuna ha avuto.</p>
      </div>

      <VerifyButton record={record} />
    </div>
  );
}

// ---------- Rivelazione ----------

type Phase = "intro" | "show" | "done";
type Kind = "fixed" | "lottery" | "winner";

/** Coriandoli: posizioni fisse (calcolate una volta), colori della squadra, oro e bianco. */
const CONFETTI = Array.from({ length: 30 }, (_, i) => {
  const angle = (i / 30) * Math.PI * 2 + (i % 3) * 0.35;
  const dist = 120 + ((i * 37) % 90);
  return {
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist * 0.75 - 40),
    rot: ((i * 83) % 540) - 270,
    delay: (i % 5) * 40,
    tone: i % 3,
    w: 6 + (i % 3) * 2,
  };
});

function Confetti({ color }: { color: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="confetti absolute block rounded-[2px]"
          style={
            {
              width: c.w,
              height: c.w * 0.45,
              background: c.tone === 0 ? color : c.tone === 1 ? "var(--gold)" : "var(--foreground)",
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              "--rot": `${c.rot}deg`,
              "--delay": `${c.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Carta della scelta in evidenza: coperta col numero a contorno, scoperta con la squadra. */
function PickCard({ slot, kind, flipped, team, draftYear, celebrate }: {
  slot: BoardSlot;
  kind: Kind;
  flipped: boolean;
  team: LotteryTeam;
  draftYear: number;
  celebrate: boolean;
}) {
  const winner = kind === "winner";
  const d = slot.draw;
  return (
    <div className="flip relative h-[13.5rem] w-full sm:h-[16rem] [@media(max-height:700px)]:h-[11.5rem] sm:[@media(max-height:700px)]:h-[12.5rem]">
      <div className="flip-inner" data-flipped={flipped}>
        <div className="flip-face grid place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-white/25 bg-board text-center">
          <div>
            <div className="eyebrow text-white/55">{kind === "fixed" ? "Ordine di classifica" : winner ? `Draft ${draftYear}` : "Lottery"}</div>
            <div className="font-display outline-text text-[7.5rem] leading-[0.85] font-black text-white/70 sm:text-[9rem] [@media(max-height:700px)]:text-[6rem]">{slot.pick}</div>
            <div className="eyebrow text-white/55">{winner ? "Prima scelta assoluta" : `${ord(slot.pick)} scelta`}</div>
          </div>
        </div>
        {/* La 1ª: bordo oro e, quando si gira, il riflesso di luce delle testate (.sweep) una volta sola. */}
        <div
          className={`flip-face flip-back flex flex-col overflow-hidden rounded-3xl border bg-board ${winner ? "border-2 border-gold" : "border-white/15"} ${celebrate ? "sweep" : ""}`}
        >
          <span aria-hidden className="absolute inset-0" style={{ background: `color-mix(in oklab, ${team.color} 16%, transparent)` }} />
          <span aria-hidden className="relative h-1.5 shrink-0" style={{ background: team.color }} />
          <div className="relative flex flex-1 flex-col justify-between p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`font-display tnum text-5xl leading-none font-black sm:text-6xl ${winner ? "jumbo" : ""}`}>{ord(slot.pick)}</div>
                <div className="eyebrow mt-1 text-white/60">{winner ? `scelta del draft ${draftYear}` : "scelta"}</div>
              </div>
              <MoveBadge slot={slot} />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative grid place-items-center">
                {celebrate && (
                  <>
                    <span aria-hidden className="ring-burst absolute h-20 w-20 rounded-full border-2 border-gold" />
                    <span aria-hidden className="ring-burst absolute h-20 w-20 rounded-full border border-gold" style={{ animationDelay: "220ms" }} />
                  </>
                )}
                <TeamCrest name={team.name} color={team.color} size="lg" />
              </span>
              <div className="min-w-0">
                <div className="font-display line-clamp-2 text-[1.75rem] leading-[0.92] font-black break-words sm:text-4xl">{team.name}</div>
                <div className="mt-1.5 text-xs leading-5 text-white/70">
                  {slot.rank}ª in classifica
                  {slot.weight !== null && d && ` · ${slot.weight} ${slot.weight === 1 ? "biglietto" : "biglietti"} su ${d.total}`}
                </div>
                {kind === "fixed" && <div className="text-xs leading-5 text-white/70">Fuori dalla lottery: sceglie in ordine inverso di classifica</div>}
                {slot.chance !== null && (
                  <div className="text-xs leading-5 text-white/70">
                    Aveva il <b className="text-white">{fmtChance(slot.chance)}</b> di prendere questa scelta
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {celebrate && <Confetti color={team.color} />}
    </div>
  );
}

function RevealScreen({ data, onClose, markSeen }: { data: LotteryData; onClose: () => void; markSeen: boolean }) {
  const team = useTeams(data.teams);
  const { record, board } = data;
  const slots = board.slots;
  const n = slots.length;
  const m = board.entrants.length;
  const lotterySlots = slots.filter((s) => s.lottery);
  const kindOf = (s: BoardSlot): Kind => (s.pick === 1 ? "winner" : s.lottery ? "lottery" : "fixed");
  // Dall'ultima alla prima.
  const beats = useMemo(() => [...slots].reverse(), [slots]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [revealed, setRevealed] = useState<number[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [ended, setEnded] = useState(false);
  const [said, setSaid] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "show") return;
    let alive = true;
    const timers: number[] = [];
    const reduced = prefersReducedMotion();
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));
    const pickOf = new Map(slots.map((s) => [s.teamId, s.pick]));

    // Il riflettore passa tra le squadre ancora in gara (quelle con una scelta ≤ k) rallentando, e si ferma su chi prende la k.
    const scan = async (k: number, target: string) => {
      const pool = board.entrants.map((e) => e.teamId).filter((id) => (pickOf.get(id) ?? 0) <= k);
      if (pool.length < 2) return;
      const hops: string[] = [];
      for (let i = pool.indexOf(target) + 1; hops.length < 9 + pool.length * 2 || hops.at(-1) !== target; i++) hops.push(pool[i % pool.length]);
      for (let h = 0; h < hops.length; h++) {
        if (!alive) return;
        setLit(hops[h]);
        const t = h / (hops.length - 1);
        await wait(70 + 420 * t * t * t);
      }
      await wait(500);
    };

    const run = async () => {
      setRevealed([]);
      setEnded(false);
      for (const [i, s] of beats.entries()) {
        if (!alive) return;
        const kind = kindOf(s);
        const t = team(s.teamId);
        setFocus(s.pick);
        setFlipped(false);
        setLit(null);
        setCelebrate(false);
        setBreathing(kind !== "fixed");
        if (kind === "fixed") {
          await wait(i === 0 ? 1100 : 450);
        } else {
          await wait(kind === "winner" ? 1900 : 1300);
          if (!alive) return;
          if (!reduced) await scan(s.pick, s.teamId);
        }
        if (!alive) return;
        setBreathing(false);
        setLit(s.teamId);
        setFlipped(true);
        await wait(kind === "fixed" ? 300 : 420);
        if (!alive) return;
        setRevealed((r) => [...r, s.pick]);
        setSaid(`${ord(s.pick)} scelta: ${t.name}`);
        if (kind === "winner") {
          setCelebrate(!reduced);
          await wait(1600);
          if (alive) setEnded(true);
          return;
        }
        await wait(kind === "fixed" ? 650 : 1900);
      }
    };
    run();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    // `beats`, `slots` e `board` sono stabili per tutta la vita della rivelazione.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // A ogni schermata si torna in cima e il focus va sul pulsante principale (showModal lo darebbe al primo, «Salta»).
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    scroller.current?.parentElement?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [phase, ended]);

  const focusSlot = focus === null ? null : slots.find((s) => s.pick === focus) ?? null;
  const focusKind = focusSlot ? kindOf(focusSlot) : "fixed";
  const inRace = focus === null ? lotterySlots.length : lotterySlots.filter((s) => s.pick <= focus).length;
  const headline = !focusSlot
    ? ""
    : focusKind === "fixed"
      ? `${ord(focusSlot.pick)} scelta`
      : focusKind === "winner"
        ? revealed.includes(1)
          ? "Prima scelta!"
          : "E la 1ª scelta va a…"
        : `La ${ord(focusSlot.pick)} scelta va a…`;
  const eyebrow = !focusSlot
    ? ""
    : focusKind === "fixed"
      ? "Ordine inverso di classifica"
      : focusKind === "winner"
        ? `Prima scelta assoluta · Draft ${record.draftYear}`
        : inRace === 2
          ? "Restano in due"
          : `Lottery · ${inRace} squadre in gara`;

  const close = () => {
    if (markSeen) void markLotterySeen(record.seasonId);
    onClose();
  };

  return (
    <div className="arena flex h-full flex-col">
      {/* Filo broadcast in alto, come sotto l'header. */}
      <div aria-hidden className="relative z-[2] h-[3px] shrink-0 bg-linear-to-r from-brand-red via-[#1d47b5] to-gold" />
      <div className="relative z-[2] flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-8">
        <span className="flex min-w-0 items-center gap-2.5 text-white/65">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold text-nav">
            <Icon name="ticket" size={18} />
          </span>
          <span className="eyebrow truncate">Draft {record.draftYear} · Sorteggio</span>
        </span>
        {phase === "done" ? (
          <button onClick={close} aria-label="Chiudi" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <Icon name="x" size={22} />
          </button>
        ) : (
          <button onClick={() => setPhase("done")} className="font-display min-h-11 rounded-lg px-3 text-lg font-extrabold tracking-wide text-white/70 hover:bg-white/10 hover:text-white">
            Salta
          </button>
        )}
      </div>

      <div ref={scroller} className="relative z-[2] min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 [@media(max-height:700px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {phase === "intro" && (
          <div className="relative isolate mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center py-6 text-center">
            <span aria-hidden className="font-display outline-text pointer-events-none absolute inset-x-0 top-[8%] -z-[1] text-center text-[28vw] leading-none font-black text-white/[0.06] select-none lg:text-[18rem]">
              {record.draftYear}
            </span>
            <h2 id="lottery-title" className="rise font-display text-[clamp(3.75rem,15vw,8rem)] leading-[0.82] font-black">
              La lottery
            </h2>
            <p className="rise mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base" style={stagger(1)}>
              Estratta da {record.drawnBy} il {fmtDateTime(record.drawnAt)}, una volta sola. Le prime {m} scelte del draft {record.draftYear} si scoprono dall&apos;ultima alla
              prima.
            </p>
            <ul className="mt-7 grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {board.entrants.map((e, i) => {
                const t = team(e.teamId);
                return (
                  <li key={e.teamId} className="rise flex flex-col items-center rounded-2xl border border-white/12 bg-board px-2 pt-3.5 pb-3" style={stagger(i + 2)}>
                    <span className="pop" style={stagger(i + 4)}>
                      <TeamCrest name={t.name} color={t.color} size="md" />
                    </span>
                    <span className="mt-2 w-full truncate text-sm font-semibold">{t.name}</span>
                    <span className="tnum text-xs text-white/60">
                      {e.rank}ª · {e.weight} {e.weight === 1 ? "biglietto" : "biglietti"}
                    </span>
                    <span aria-hidden className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <span className="meter-fill block h-full rounded-full" style={{ width: `${e.chanceFirst * 100}%`, background: t.color }} />
                    </span>
                    <span className="mt-1.5 text-xs">
                      <b className="font-display tnum text-lg">{fmtChance(e.chanceFirst)}</b> <span className="text-white/60">per la 1ª</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="rise mt-4 max-w-xl text-xs leading-5 text-white/60" style={stagger(8)}>
              {n > m && `Dalla ${ord(m + 1)} alla ${ord(n)} si sceglie in ordine inverso di classifica. `}Lo stesso ordine vale per tutti i {data.rounds} giri.
            </p>
            <div className="rise mt-7 flex flex-col items-center gap-2 sm:flex-row" style={stagger(9)}>
              <Button variant="gold" icon="ticket" onClick={() => setPhase("show")} data-autofocus>
                Scopri l&apos;ordine
              </Button>
              <Button variant="ghost" onClick={() => setPhase("done")}>
                Vai al risultato
              </Button>
            </div>
          </div>
        )}

        {phase === "show" && focusSlot && (
          <div className="mx-auto grid min-h-full max-w-6xl content-center gap-6 py-3 sm:py-6 [@media(max-height:700px)]:gap-3 [@media(max-height:700px)]:py-1 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-10">
            <div className="flex min-w-0 flex-col items-center">
              <div key={`cap-${focus}`} className="rise w-full text-center">
                <div className="eyebrow text-white/60">{eyebrow}</div>
                <h2 id="lottery-title" className="font-display mt-1 text-[clamp(2.25rem,8vw,3.75rem)] leading-[0.9] font-black">
                  {headline}
                </h2>
              </div>

              <ul className="mt-5 flex w-full max-w-md justify-center gap-2 sm:gap-4 [@media(max-height:700px)]:mt-3" aria-label="Squadre della lottery">
                {board.entrants.map((e) => {
                  const t = team(e.teamId);
                  const slot = slots.find((s) => s.teamId === e.teamId)!;
                  const out = revealed.includes(slot.pick) && slot.pick !== focus;
                  const on = lit === e.teamId;
                  return (
                    <li
                      key={e.teamId}
                      data-lit={on}
                      className={`spot relative flex w-[4.75rem] flex-col items-center pt-1 ${out ? "scale-90 opacity-35" : on ? "scale-110" : focusKind === "fixed" ? "opacity-80" : ""}`}
                    >
                      <span aria-hidden className="spot-ring absolute top-0 h-[3.4rem] w-[3.4rem] rounded-full border-2 border-gold" />
                      <TeamCrest name={t.name} color={t.color} size="md" />
                      <span className="mt-1.5 w-full truncate text-center text-[0.6875rem] font-semibold [@media(max-height:700px)]:hidden">{t.name}</span>
                      <span className="eyebrow leading-4 text-white/55">{out ? ord(slot.pick) : `${e.weight} bigl.`}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 w-full max-w-sm sm:max-w-md [@media(max-height:700px)]:mt-3">
                <div key={`card-${focus}`} className="pop">
                  <div className={breathing ? "breathe" : ""}>
                    <PickCard
                      slot={focusSlot}
                      kind={focusKind}
                      flipped={flipped}
                      team={team(focusSlot.teamId)}
                      draftYear={record.draftYear}
                      celebrate={celebrate}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 h-11 [@media(max-height:700px)]:mt-3">
                {ended && (
                  <Button variant="gold" className="rise" onClick={() => setPhase("done")} data-autofocus>
                    Vedi l&apos;ordine completo
                  </Button>
                )}
              </div>
            </div>

            {/* Tabellone del 1° giro: striscia su telefono, colonna da `lg`. */}
            <div>
              <div className="eyebrow mb-2 hidden text-white/55 lg:block">Primo giro · uguale in tutti i {data.rounds}</div>
              <ol className="grid grid-cols-8 gap-1 lg:grid-cols-1 lg:gap-1.5" aria-label="Primo giro">
                {slots.map((s) => {
                  const shown = revealed.includes(s.pick);
                  const active = focus === s.pick;
                  const t = team(s.teamId);
                  return (
                    <li
                      key={s.pick}
                      className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 transition-colors duration-300 lg:flex-row lg:gap-3 lg:px-3 lg:py-2 ${
                        active ? "border-gold bg-gold/12" : shown ? "border-white/12 bg-board" : "border-dashed border-white/15"
                      }`}
                    >
                      <span className={`font-display tnum text-base leading-none font-black lg:w-7 lg:text-2xl ${s.pick === 1 && shown ? "jumbo" : ""}`}>{s.pick}</span>
                      {shown ? (
                        <span className="slot-in grid place-items-center">
                          <TeamCrest name={t.name} color={t.color} size="xs" />
                        </span>
                      ) : (
                        <span aria-hidden className="grid h-[26px] w-[22px] place-items-center rounded-md border border-dashed border-white/20 text-xs font-bold text-white/35">
                          ?
                        </span>
                      )}
                      <span className="hidden min-w-0 flex-1 truncate text-sm font-semibold lg:block">
                        {shown ? t.name : <span className="font-normal text-white/45">{s.lottery ? "Lottery" : "Classifica"}</span>}
                      </span>
                      <span className="sr-only">{shown ? `: ${t.name}` : ": da scoprire"}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <p className="sr-only" aria-live="polite">
              {said}
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="mx-auto max-w-3xl py-4 sm:py-8">
            <div className="rise text-center">
              <div className="eyebrow text-white/60">Draft {record.draftYear} · Ordine ufficiale</div>
              <h2 id="lottery-title" className="font-display mt-1 text-[clamp(2.5rem,9vw,4.5rem)] leading-[0.88] font-black">
                L&apos;ordine del draft
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/70">
                Lo stesso in tutti i {data.rounds} giri: chi sceglie per primo ha le scelte {slots[0]?.numbers.join(", ")}.
              </p>
            </div>
            <div className="mt-6">
              <LotteryOrder data={data} />
            </div>
            <details className="group mt-4 rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold text-brand-blue [&::-webkit-details-marker]:hidden">
                <Icon name="info" size={18} />
                Come è stato estratto
                <Icon name="chevron" size={18} className="ml-auto rotate-90 transition-transform group-open:-rotate-90" />
              </summary>
              <div className="border-t border-line px-4 py-4">
                <LotteryProof data={data} />
              </div>
            </details>
            <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <Button variant="secondary" onClick={close} data-autofocus>
                Chiudi
              </Button>
              <Link href="/draft" onClick={close} className="font-display inline-flex min-h-11 items-center gap-1.5 px-4 text-lg font-extrabold tracking-wide text-brand-blue hover:underline">
                Vai al draft <Icon name="chevron" size={18} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * `auto`: si apre da sola (primo accesso dopo l'estrazione) e alla chiusura segna la rivelazione come vista. Senza `auto` è il
 * pulsante «Rivedi la lottery» della pagina del draft.
 */
export function LotteryReveal({ data, auto = false, children }: { data: LotteryData; auto?: boolean; children?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(auto);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!open) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    // La pagina sotto non scorre finché la rivelazione è aperta.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  return (
    <>
      {!auto && (
        <Button
          variant="secondary"
          icon="ticket"
          onClick={() => {
            setRun((r) => r + 1);
            setOpen(true);
          }}
        >
          {children ?? "Rivedi la lottery"}
        </Button>
      )}
      <dialog
        ref={dialog}
        className="lottery-dialog"
        aria-labelledby="lottery-title"
        onCancel={(e) => {
          // Esc: si chiude come con la X (e per la prima volta conta come vista).
          e.preventDefault();
          if (auto) void markLotterySeen(data.record.seasonId);
          setOpen(false);
        }}
      >
        {open && <RevealScreen key={run} data={data} markSeen={auto} onClose={() => setOpen(false)} />}
      </dialog>
    </>
  );
}
