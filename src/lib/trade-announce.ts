/**
 * Bot Telegram (Fase 7.5): testo dell'annuncio di uno scambio eseguito, con una o due battute che prendono in giro chi ha
 * scambiato (decisione dell'utente 2026-10-29: sul canale solo gli scambi eseguiti, «con frasi divertenti»). Puro e testato:
 * l'invio sta in `telegram.ts`. Le soglie qui sotto scelgono solo la battuta, non sono regole di lega.
 */
import { fmt } from "./format";

/** Scambi più vecchi di così non si annunciano (canale configurato tardi, cron fermo): niente arretrato sul canale. */
export const ANNOUNCE_MAX_AGE_HOURS = 72;

/** Differenza di monte ingaggi da cui uno scambio è uno «scarico» (solo per la battuta). */
const DUMP_CREDITS = 8;
/** Scambi in stagione da cui una squadra è «seriale» (solo per la battuta). */
const SERIAL_TRADES = 3;
/** Giocatori in movimento da cui lo scambio è un «trasloco» (solo per la battuta). */
const BIG_SWAP_PLAYERS = 5;

export interface AnnouncedTeam {
  id: string;
  name: string;
  /** scambi eseguiti in stagione dalla squadra, questo compreso */
  seasonTrades: number;
}
export interface AnnouncedMove {
  kind: "contract" | "pick";
  id: number;
  from: string;
  to: string;
  /** slot di arrivo scelto nello scambio */
  slot?: "starter" | "reserve";
  /** nome salvato nello scambio, se il contratto non c'è più */
  label?: string;
  name?: string;
  pos?: string | null;
  salary?: number;
  year?: number;
  round?: number;
  originalTeam?: string;
}
export interface AnnouncedTrade {
  id: number;
  createdAt: string;
  capOverrideReason: string | null;
  teams: AnnouncedTeam[];
  moves: AnnouncedMove[];
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);
const num = (x: unknown) => (x === null || x === undefined || x === "" ? undefined : Number.isFinite(Number(x)) ? Number(x) : undefined);

/** Legge la risposta di `trade_announce_claim`; scarta ciò che non è uno scambio completo. */
export function parseAnnouncements(data: unknown): AnnouncedTrade[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    const r = obj(raw);
    const id = num(r.id);
    const teams = (Array.isArray(r.teams) ? r.teams : []).flatMap((x) => {
      const t = obj(x);
      const tid = str(t.id);
      return tid ? [{ id: tid, name: str(t.name) ?? "?", seasonTrades: num(t.season_trades) ?? 1 }] : [];
    });
    const ids = new Set(teams.map((t) => t.id));
    const moves = (Array.isArray(r.moves) ? r.moves : []).flatMap((x): AnnouncedMove[] => {
      const m = obj(x);
      const mid = num(m.id);
      const from = str(m.from);
      const to = str(m.to);
      if ((m.kind !== "contract" && m.kind !== "pick") || mid === undefined || !from || !to || !ids.has(from) || !ids.has(to)) return [];
      return [{
        kind: m.kind,
        id: mid,
        from,
        to,
        slot: m.slot === "starter" || m.slot === "reserve" ? m.slot : undefined,
        label: str(m.label),
        name: str(m.name),
        pos: str(m.pos) ?? null,
        salary: num(m.salary),
        year: num(m.year),
        round: num(m.round),
        originalTeam: str(m.original_team),
      }];
    });
    if (id === undefined || teams.length < 2 || !moves.length) return [];
    return [{ id, createdAt: str(r.created_at) ?? "", capOverrideReason: str(r.cap_override_reason) ?? null, teams, moves }];
  });
}

// ---------- Battute ----------
// Segnaposto: {X} e {Y} nomi di squadra, {n} un numero. Si sceglie sempre la stessa battuta per lo stesso scambio, così un
// nuovo tentativo d'invio non cambia il testo.
const JOKES = {
  capOverride: [
    "Il cap è sforato, ma il moderatore ha guardato dall'altra parte. Si accettano offerte per il suo silenzio.",
    "Eccezione al cap concessa: le regole valgono per tutti, tranne che per chi chiede con gli occhi dolci.",
    "Il cap piange in un angolo. Il moderatore gli ha detto che passa.",
  ],
  multi: [
    "Scambio a {n} squadre: nemmeno il moderatore ha capito chi ha fregato chi.",
    "Triangolazione da manuale. Del manuale di chi non sa cosa sta facendo.",
    "{n} squadre, un solo scambio, zero idee chiare.",
  ],
  dump: [
    "{X} si libera di {n} crediti di monte ingaggi e li scarica su {Y}. Il commercialista di {X} stappa lo spumante.",
    "{Y} si accolla {n} crediti in più: qualcuno da {Y} ha scambiato il cap per un obiettivo da raggiungere.",
    "Svuota-cantine di {X}: {n} crediti finiscono nel garage di {Y}.",
  ],
  serial: [
    "Già {n} scambi in stagione per {X}: la rosa ormai è un bed & breakfast.",
    "{X} arriva a quota {n} scambi. Qualcuno gli nasconda il telefono.",
    "Scambio numero {n} per {X}. Il moderatore chiede le ferie.",
  ],
  picks: [
    "{X} ipoteca il futuro: la pick parte, i rimpianti arriveranno puntuali al draft.",
    "{X} cede una pick come se il futuro fosse un'opinione.",
    "Una pick di {X} cambia casa. Tra qualche anno qualcuno glielo rinfaccerà, e avrà ragione.",
  ],
  bigSwap: [
    "Più che uno scambio, un trasloco: {n} giocatori con le valigie in mano.",
    "{n} giocatori in movimento. Serviva un pullman, non uno scambio.",
  ],
  onlyPicks: [
    "Si scambiano solo pick: fantabasket per chi non ha il coraggio di toccare la rosa.",
    "Nessun giocatore coinvolto, solo promesse sul futuro. Come in politica.",
  ],
  oneForOne: [
    "Uno per uno, stipendi quasi uguali: scambio di figurine all'intervallo.",
    "Pari e patta sulla carta. Ora tocca al campo dire chi ha preso la sola.",
  ],
  firstTrade: [
    "Primo scambio della stagione per {X}: si è fatto coraggio. Non abituiamoci.",
    "{X} scopre il mercato. Gli altri dirigenti affilano i coltelli.",
  ],
  generic: [
    "Entrambe le squadre sono convinte di aver vinto. Almeno una si sbaglia.",
    "Le due dirigenze si stringono la mano. Dietro la schiena, le dita incrociate.",
    "Scambio ufficiale. Tra un mese vedremo chi ha bisogno di uno psicologo.",
    "Il mercato si muove, la dignità un po' meno.",
    "Applausi in sala. Per chi, si saprà a fine stagione.",
  ],
} as const;
export type JokeKind = keyof typeof JOKES;

interface Joke {
  kind: JokeKind;
  vars: Record<string, string | number>;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fill(t: AnnouncedTrade, j: Joke): string {
  const pool = JOKES[j.kind];
  const text = pool[hash(`${t.id}:${j.kind}`) % pool.length];
  return text.replace(/\{(\w)\}/g, (_, k: string) => String(j.vars[k] ?? ""));
}

/** Monte ingaggi in entrata e in uscita per squadra (solo i giocatori con stipendio noto). */
function salaryFlow(t: AnnouncedTrade) {
  return t.teams.map((team) => {
    const sum = (list: AnnouncedMove[]) => list.reduce((n, m) => n + (m.kind === "contract" ? (m.salary ?? 0) : 0), 0);
    return { team, net: sum(t.moves.filter((m) => m.to === team.id)) - sum(t.moves.filter((m) => m.from === team.id)) };
  });
}

/** Le battute adatte a questo scambio, dalla più specifica; sempre almeno una. */
export function tradeJokes(t: AnnouncedTrade): Joke[] {
  const out: Joke[] = [];
  const players = t.moves.filter((m) => m.kind === "contract");
  const picks = t.moves.filter((m) => m.kind === "pick");

  if (t.capOverrideReason) out.push({ kind: "capOverride", vars: {} });
  if (t.teams.length > 2) out.push({ kind: "multi", vars: { n: t.teams.length } });
  const flow = salaryFlow(t).sort((a, b) => a.net - b.net);
  const giver = flow[0];
  const taker = flow[flow.length - 1];
  if (t.teams.length === 2 && taker.net >= DUMP_CREDITS) {
    out.push({ kind: "dump", vars: { X: giver.team.name, Y: taker.team.name, n: fmt(taker.net) } });
  }
  const serial = [...t.teams].sort((a, b) => b.seasonTrades - a.seasonTrades)[0];
  if (serial.seasonTrades >= SERIAL_TRADES) out.push({ kind: "serial", vars: { X: serial.name, n: serial.seasonTrades } });
  if (players.length === 0) out.push({ kind: "onlyPicks", vars: {} });
  else if (picks.length) {
    const from = t.teams.find((team) => picks.some((p) => p.from === team.id));
    if (from) out.push({ kind: "picks", vars: { X: from.name } });
  }
  if (players.length >= BIG_SWAP_PLAYERS) out.push({ kind: "bigSwap", vars: { n: players.length } });
  if (
    t.teams.length === 2 && !picks.length && players.length === 2 && players[0].from !== players[1].from &&
    players.every((p) => p.salary !== undefined) && Math.abs((players[0].salary ?? 0) - (players[1].salary ?? 0)) <= 1
  ) {
    out.push({ kind: "oneForOne", vars: {} });
  }
  const rookie = t.teams.find((team) => team.seasonTrades === 1);
  if (rookie && !out.length) out.push({ kind: "firstTrade", vars: { X: rookie.name } });
  if (!out.length) out.push({ kind: "generic", vars: {} });
  return out;
}

// ---------- Messaggio ----------
/** Testo per `parse_mode: HTML` di Telegram: solo &, < e > vanno protetti. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function moveText(m: AnnouncedMove, t: AnnouncedTrade): string {
  const from = t.teams.length > 2 ? ` · da ${t.teams.find((x) => x.id === m.from)?.name ?? "?"}` : "";
  if (m.kind === "pick") {
    const what = m.year && m.round ? `Pick ${m.year} · ${m.round}° giro${m.originalTeam ? ` (${m.originalTeam})` : ""}` : (m.label ?? "Una pick");
    return `${escapeHtml(what)}${escapeHtml(from)}`;
  }
  const details = [m.pos, m.salary !== undefined ? `${fmt(m.salary)} cr` : null, m.slot === "reserve" ? "riserva" : null].filter(Boolean).join(" · ");
  return `${escapeHtml(m.name ?? m.label ?? "Un giocatore")}${details ? ` <i>(${escapeHtml(details)})</i>` : ""}${escapeHtml(from)}`;
}

/** Messaggio completo: squadre, chi riceve cosa, eventuale eccezione al cap, al massimo due battute, link allo storico. */
export function announcementText(t: AnnouncedTrade, siteUrl?: string | null): string {
  const lines = [`🔁 <b>SCAMBIO UFFICIALE</b>`, t.teams.map((x) => `<b>${escapeHtml(x.name)}</b>`).join(" ⇄ "), ""];
  for (const team of t.teams) {
    const got = t.moves.filter((m) => m.to === team.id);
    lines.push(`➡️ <b>${escapeHtml(team.name)}</b> riceve:`);
    lines.push(...(got.length ? got.map((m) => `• ${moveText(m, t)}`) : ["• niente, solo la gioia di aver fatto spazio"]));
  }
  if (t.capOverrideReason) lines.push("", `⚖️ Eccezione al cap: <i>${escapeHtml(t.capOverrideReason)}</i>`);
  lines.push("", ...tradeJokes(t).slice(0, 2).map((j) => `😏 ${escapeHtml(fill(t, j))}`));
  const site = siteUrl?.replace(/\/+$/, "");
  if (site) lines.push("", `<a href="${escapeHtml(`${site}/storico-scambi`)}">Storico scambi</a>`);
  return lines.join("\n");
}
