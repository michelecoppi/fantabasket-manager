/**
 * Bot Telegram (Fase 7.5): testo dell'annuncio di uno scambio eseguito, con una o due battute che prendono in giro chi ha
 * scambiato (decisione dell'utente 2026-10-29: sul canale solo gli scambi eseguiti, «con frasi divertenti»). Puro e testato:
 * l'invio sta in `telegram.ts`. Le soglie qui sotto scelgono solo la battuta, non sono regole di lega: sono tarate sulla lega
 * del 2026-10-29 (stipendio mediano dei titolari 14,5, il 90% sotto 36; PDK mediano 21,5).
 */
import { fmt } from "./format";

/** Scambi più vecchi di così non si annunciano (canale configurato tardi, cron fermo): niente arretrato sul canale. */
export const ANNOUNCE_MAX_AGE_HOURS = 72;

/** Differenza di monte ingaggi da cui uno scambio è uno «scarico». */
const DUMP_CREDITS = 10;
/** Differenza di PDK a partita (somma dei giocatori) da cui uno scambio è una «rapina». */
const HEIST_PDK = 12;
/** Stipendio da cui un giocatore è la «stella» della squadra che lo cede. */
const STAR_CREDITS = 35;
/** Stagioni di contratto rimaste da cui chi arriva è un «mutuo». */
const LONG_YEARS = 3;
/** Scambi in stagione da cui una squadra è «seriale». */
const SERIAL_TRADES = 3;
/** Giocatori in movimento da cui lo scambio è un «trasloco». */
const BIG_SWAP_PLAYERS = 5;
/** Battute per annuncio. */
const MAX_JOKES = 2;

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
  yearsLeft?: number;
  rookie?: boolean;
  /** punteggio Dunkest medio e partite giocate (assenti se il giocatore non è collegato) */
  pdk?: number;
  gp?: number;
  /** infortunio in corso secondo Dunkest */
  injury?: string;
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
        yearsLeft: num(m.years_left),
        rookie: m.rookie === true,
        pdk: num(m.pdk),
        gp: num(m.gp),
        injury: str(m.injury),
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
// Scritte per la lega, con riferimenti a mercato NBA e calciomercato italiano. Si scherza sulle scelte di mercato, mai sulle
// persone. Segnaposto (quelli di ogni gruppo sono in JOKE_VARS, un test li controlla): {X} chi cede, {Y} chi riceve, {W} chi ci
// guadagna, {L} chi ci perde, {P} un giocatore, {n} e {m} numeri, {d} una differenza. Lo stesso scambio pesca sempre le stesse
// frasi, così un nuovo tentativo d'invio non cambia il testo; scambi diversi pescano frasi diverse.

export const HEADLINES = [
  "🚨 SCAMBIO UFFICIALE",
  "🔁 HERE WE GO!",
  "📣 COMUNICATO DELLA LEGA",
  "🗞️ ULTIM'ORA DAL MERCATO",
  "💣 BOMBA DI MERCATO",
  "💨 FUMATA BIANCA",
  "🧾 CONTRATTI DEPOSITATI IN LEGA",
  "🔔 È UFFICIALE",
  "📠 È ARRIVATO IL FAX",
  "🤝 STRETTA DI MANO (E DITA INCROCIATE)",
] as const;

export const CLOSINGS = [
  "Il moderatore ha già preparato i popcorn. 🍿",
  "Visite mediche superate. Più o meno.",
  "Screenshot fatto: verrà rinfacciato a tempo debito. 📸",
  "Ora fatelo anche su Dunkest, prima di vantarvene in chat.",
  "Chi ha vinto lo scambio lo dirà la classifica. Chi l'ha perso lo dirà la chat.",
  "Reclami all'ufficio competente, aperto il 30 febbraio dalle 3:00 alle 3:05.",
  "La lega prende atto e si riserva il diritto di ridere.",
  "Nessun dirigente è stato maltrattato durante la trattativa. Forse.",
  "Tra poco le dichiarazioni dei diretti interessati, rigorosamente in difesa.",
  "Archiviato nello storico scambi, sezione «ne riparliamo a fine stagione».",
  "Le conferenze stampa di presentazione si terranno al bar, offre chi ha perso.",
  "Il notaio della lega ha firmato senza leggere. Come qualcun altro, a quanto pare.",
] as const;

export const JOKES = {
  capOverride: [
    "Il cap è sforato, ma il moderatore ha guardato dall'altra parte. Si accettano offerte per il suo silenzio.",
    "Eccezione al cap concessa: le regole valgono per tutti, tranne che per chi chiede con gli occhi dolci.",
    "Il cap piange in un angolo. Il moderatore gli ha detto che passa.",
    "Sforamento autorizzato. Il regolamento è stato visto uscire dalla stanza sbattendo la porta.",
    "Il cap? Più che un tetto, un suggerimento.",
    "Eccezione al cap: la luxury tax ringrazia e prepara la fattura.",
    "Il moderatore ha firmato l'eccezione con la mano sinistra, così domani può dire che non era lui.",
    "Da oggi il cap è ufficialmente un concetto filosofico.",
  ],
  injured: [
    "{X} rifila {P} a {Y} con l'infermeria inclusa nel prezzo. Garanzia scaduta, scontrino perso.",
    "{Y} accoglie {P} direttamente dall'infermeria. Le visite mediche le ha fatte su Google.",
    "{P} cambia squadra in barella: {X} ringrazia, il fisioterapista di {Y} un po' meno.",
    "Vendere un infortunato è un'arte. {X} oggi espone al Louvre.",
    "{Y} si porta a casa {P}: il pacco è arrivato, peccato sia ammaccato.",
    "{X} ha venduto {P} come «momentaneamente indisponibile». Momentaneamente, come i lavori in autostrada.",
    "Nel contratto di {P} c'è anche un abbonamento alla fisioterapia. Lo paga {Y}.",
    "Pacco, doppio pacco e contropaccotto: {Y} si prende {P} col cerotto.",
    "{X} ha ceduto {P} con la formula «visto e piaciuto». {Y} l'ha visto. Piaciuto, si vedrà.",
  ],
  heist: [
    "Rapina a mano armata: {W} si prende {d} PDK a partita in più. {L} ha firmato senza leggere.",
    "{L} ha fatto il suo scambio alla Minnesota per Gobert: il conto arriva dopo, ed è salato.",
    "Sulla carta {W} guadagna {d} PDK a partita. {L} guadagna esperienza, che però non fa punti.",
    "Chi l'ha visto? cerca il buon senso di {L}, smarrito durante la trattativa con {W}.",
    "{W} ringrazia {L} per la gentile donazione di {d} PDK a partita. Ricevuta fiscale in arrivo.",
    "Nemmeno i Celtics con i Nets del 2013 erano stati così spietati: {W} su {L}, +{d} PDK a partita.",
    "{L} esce dalla trattativa senza portafoglio, senza orologio e con {d} PDK in meno. {W} offre il caffè, almeno quello.",
    "Il Condor in confronto era un dilettante: {W} porta a casa {d} PDK a partita più di {L}.",
    "Se {L} è contento così, siamo contenti anche noi. Soprattutto {W}.",
    "L'Antitrust ha aperto un fascicolo: {W} contro {L}, {d} PDK a partita di differenza.",
    "{W} ha chiamato {L} alle due di notte. Mai fare affari alle due di notte: +{d} PDK per {W}.",
  ],
  multi: [
    "Scambio a {n} squadre: nemmeno il moderatore ha capito chi ha fregato chi.",
    "Triangolazione da manuale. Del manuale di chi non sa cosa sta facendo.",
    "{n} squadre, un solo scambio, zero idee chiare.",
    "Più squadre coinvolte che idee chiare: telenovela di mercato in prima serata.",
    "Per spiegare questo scambio servono una lavagna, un pennarello e uno psicologo.",
    "Le trattative a {n} sono come le cene a {n}: alla fine nessuno sa chi deve pagare cosa.",
    "Scambio a {n}: ognuno è convinto di aver fregato gli altri {m}. Statisticamente, auguri.",
  ],
  dump: [
    "{X} si libera di {n} crediti di monte ingaggi e li scarica su {Y}. Il commercialista di {X} stappa lo spumante.",
    "{Y} si accolla {n} crediti in più: qualcuno da {Y} ha scambiato il cap per un obiettivo da raggiungere.",
    "Svuota-cantine di {X}: {n} crediti finiscono nel garage di {Y}.",
    "{X} fa il cambio di stagione nell'armadio e regala a {Y} i maglioni da {n} crediti che non metteva più.",
    "Operazione Svuotatutto: {X} alleggerisce il monte ingaggi di {n} crediti, {Y} lo appesantisce col sorriso.",
    "{Y} si prende {n} crediti di stipendi in più. Il cap di {Y} ha chiesto di parlare con un avvocato.",
    "{X} ha scoperto che il modo migliore per risparmiare è far pagare {Y}. Rivoluzionario.",
    "{n} crediti traslocano da {X} a {Y}. Il commercialista di {Y} ha cambiato numero di telefono.",
  ],
  star: [
    "{X} saluta {P}: le sue maglie sono già in saldo allo store.",
    "{P} lascia {X}. A {X} parte la ricostruzione, a {Y} parte il sogno. Uno dei due si sveglierà presto.",
    "Il volto della franchigia cambia indirizzo: {P} da {X} a {Y}. A {X} bruciano le maglie, virtualmente.",
    "{Y} si regala {P}. Natale è arrivato in anticipo, scontrino intestato a {X}.",
    "{X} scambia {P}. Da oggi a {X} si parla di «progetto», che è il modo elegante di dire «anno di transizione».",
    "{P} arriva a {Y}: «sono qui per vincere». Lo diceva anche a {X}.",
    "Kobe passò da Charlotte ai Lakers in una notte d'estate. {P} va da {X} a {Y} in una notte qualunque, ma il brivido è lo stesso.",
    "{X} rinuncia a {P}. Il busto in bronzo nell'atrio verrà rimosso entro sera.",
  ],
  serial: [
    "Già {n} scambi in stagione per {X}: la rosa ormai è un bed & breakfast.",
    "{X} arriva a quota {n} scambi. Qualcuno gli nasconda il telefono.",
    "Scambio numero {n} per {X}. Il moderatore chiede le ferie.",
    "{n} scambi per {X} in una stagione: più che una rosa, un aeroporto.",
    "{X} tocca quota {n} scambi. Il prossimo arrivato chiederà di firmare a matita.",
    "A {X} sono al {n}° scambio: i giocatori non disfano più le valigie.",
    "Hinkie chiedeva di fidarsi del processo. {X}, al {n}° scambio, non si fida nemmeno del giovedì.",
    "{n} scambi per {X}. Qualcuno avvisi la famiglia: è entrato in modalità deadline permanente.",
  ],
  picks: [
    "{X} ipoteca il futuro: la pick parte, i rimpianti arriveranno puntuali al draft.",
    "{X} cede una pick come se il futuro fosse un'opinione.",
    "Una pick di {X} cambia casa. Tra qualche anno qualcuno glielo rinfaccerà, e avrà ragione.",
    "{X} cede una pick. Tra qualche anno sarà un MVP, e {X} lo guarderà in TV.",
    "Tatum e Brown sono arrivati a Boston grazie a pick cedute con leggerezza. {X}, ci siamo capiti.",
    "{X} vende il futuro per il presente. Il futuro non si offende: si vendica.",
    "Le pick sono il fondo pensione del fantabasket: {X} ha deciso di spenderlo tutto adesso.",
    "{X} rinuncia a una pick. Il draft prende nota e se la lega al dito.",
  ],
  onlyPicks: [
    "Si scambiano solo pick: fantabasket per chi non ha il coraggio di toccare la rosa.",
    "Nessun giocatore coinvolto, solo promesse sul futuro. Come in campagna elettorale.",
    "Scambio di sole pick: come scambiarsi biglietti della lotteria e chiamarlo investimento.",
    "Nessun giocatore toccato, solo carta: fantabasket in modalità Piazza Affari.",
    "Pick per pick, come figurine al bar: ce l'ho, ce l'ho, mi manca.",
  ],
  rookie: [
    "{X} rinuncia al giovane {P}: la pazienza non è mai stata il suo forte.",
    "{P} non ha ancora imparato la strada per lo spogliatoio e l'hanno già scambiato. Benvenuto nel fantabasket.",
    "{Y} si prende il rookie {P}: tra tre anni sarà un fenomeno o una domanda da quiz.",
    "{X} scambia un rookie. Molti GM l'hanno fatto prima: alcuni ci hanno costruito una carriera da opinionisti.",
    "{P} è giovane, costa poco e promette bene. Infatti {X} l'ha dato via.",
  ],
  longContract: [
    "{Y} si accolla {P} per altre {n} stagioni. Più che un contratto, un mutuo a tasso fisso.",
    "{n} stagioni di {P} per {Y}: un matrimonio senza possibilità di divorzio.",
    "{Y} si tiene {P} per {n} stagioni. Se va male, lo chiameranno «progetto pluriennale».",
    "{Y} prende {P} con {n} anni di contratto. Il vero ergastolo è il monte ingaggi.",
  ],
  ghost: [
    "{Y} prende {P}, che in stagione si è visto quanto Babbo Natale: tutti sanno che esiste, nessuno l'ha visto.",
    "{P} finora non ha giocato una partita. {Y} punta tutto sull'effetto sorpresa.",
    "{Y} investe su {P}, avvistato l'ultima volta sul parquet insieme al mostro di Loch Ness.",
    "Le statistiche di {P} in stagione stanno su un post-it. Vuoto. {Y} ci crede lo stesso.",
  ],
  bigSwap: [
    "Più che uno scambio, un trasloco: {n} giocatori con le valigie in mano.",
    "{n} giocatori in movimento. Serviva un pullman, non uno scambio.",
    "{n} giocatori in un colpo solo: servono un notaio, un pullman e un'agenzia di traslochi.",
    "Non è uno scambio, è un rimpasto di governo: {n} giocatori cambiano poltrona.",
    "{n} giocatori in un'operazione sola: anche Daryl Morey prende appunti.",
  ],
  oneForOne: [
    "Uno per uno, stipendi quasi uguali: scambio di figurine all'intervallo.",
    "Pari e patta sulla carta. Ora tocca al campo dire chi ha preso la sola.",
    "Scambio perfettamente equilibrato. Sospetto, molto sospetto.",
    "Stipendi pari, rischio pari, ansia pari: lo scambio più democratico della stagione.",
  ],
  firstTrade: [
    "Primo scambio della stagione per {X}: si è fatto coraggio. Non abituiamoci.",
    "{X} scopre il mercato. Gli altri dirigenti affilano i coltelli.",
    "{X} rompe il ghiaccio: primo scambio della stagione. Si sentiva solo al telefono.",
    "Debutto sul mercato per {X}. Come tutti i debutti: emozionato, impacciato, probabilmente fregato.",
  ],
  generic: [
    "Entrambe le squadre sono convinte di aver vinto. Almeno una si sbaglia.",
    "Le due dirigenze si stringono la mano. Dietro la schiena, le dita incrociate.",
    "Scambio ufficiale. Tra un mese vedremo chi ha bisogno di uno psicologo.",
    "Il mercato si muove, la dignità un po' meno.",
    "Applausi in sala. Per chi, si saprà a fine stagione.",
    "Le parti dichiarano: «un'occasione per tutti». Traduzione: uno dei due ha preso una sola.",
    "Stretta di mano, sorrisi, foto di rito. Il rancore arriva con la prossima giornata.",
    "Scambio chiuso. Ora parte la fase più importante: convincere la chat di aver vinto.",
    "Gli esperti sono divisi: metà dice che è un affare, l'altra metà gioca a fantacalcio.",
  ],
} as const;
export type JokeKind = keyof typeof JOKES;

/** Segnaposto che ogni gruppo riceve: una frase può usarne solo questi. */
export const JOKE_VARS: Record<JokeKind, readonly string[]> = {
  capOverride: [],
  injured: ["X", "Y", "P"],
  heist: ["W", "L", "d"],
  multi: ["n", "m"],
  dump: ["X", "Y", "n"],
  star: ["X", "Y", "P"],
  serial: ["X", "n"],
  picks: ["X"],
  onlyPicks: [],
  rookie: ["X", "Y", "P"],
  longContract: ["Y", "P", "n"],
  ghost: ["Y", "P"],
  bigSwap: ["n"],
  oneForOne: [],
  firstTrade: ["X"],
  generic: [],
};

export interface Joke {
  kind: JokeKind;
  vars: Record<string, string | number>;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pickFor = <T>(t: AnnouncedTrade, what: string, pool: readonly T[]): T => pool[hash(`${t.id}:${what}`) % pool.length];

export function fillJoke(t: AnnouncedTrade, j: Joke): string {
  return pickFor(t, j.kind, JOKES[j.kind]).replace(/\{(\w)\}/g, (_, k: string) => String(j.vars[k] ?? ""));
}

/** Somma di un valore dei giocatori in entrata meno quelli in uscita, per squadra. */
function net(t: AnnouncedTrade, value: (m: AnnouncedMove) => number) {
  return t.teams
    .map((team) => {
      const sum = (list: AnnouncedMove[]) => list.reduce((n, m) => n + (m.kind === "contract" ? value(m) : 0), 0);
      return { team, net: sum(t.moves.filter((m) => m.to === team.id)) - sum(t.moves.filter((m) => m.from === team.id)) };
    })
    .sort((a, b) => b.net - a.net);
}

/** Le battute adatte a questo scambio, dalla più specifica; sempre almeno una. */
export function tradeJokes(t: AnnouncedTrade): Joke[] {
  const out: Joke[] = [];
  const name = (id: string) => t.teams.find((x) => x.id === id)?.name ?? "?";
  const players = t.moves.filter((m) => m.kind === "contract");
  const picks = t.moves.filter((m) => m.kind === "pick");
  const player = (m: AnnouncedMove) => m.name ?? m.label ?? "un giocatore";
  const two = t.teams.length === 2;

  if (t.capOverrideReason) out.push({ kind: "capOverride", vars: {} });
  const hurt = players.find((m) => m.injury);
  if (hurt) out.push({ kind: "injured", vars: { X: name(hurt.from), Y: name(hurt.to), P: player(hurt) } });
  if (two && players.length && players.every((m) => m.pdk !== undefined)) {
    const [win, lose] = net(t, (m) => m.pdk ?? 0);
    if (win.net >= HEIST_PDK) out.push({ kind: "heist", vars: { W: win.team.name, L: lose.team.name, d: fmt(Math.round(win.net * 10) / 10) } });
  }
  if (!two) out.push({ kind: "multi", vars: { n: t.teams.length, m: t.teams.length - 1 } });
  if (two) {
    const [taker, giver] = net(t, (m) => m.salary ?? 0);
    if (taker.net >= DUMP_CREDITS) out.push({ kind: "dump", vars: { X: giver.team.name, Y: taker.team.name, n: fmt(taker.net) } });
  }
  const star = players.filter((m) => (m.salary ?? 0) >= STAR_CREDITS).sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0))[0];
  if (star) out.push({ kind: "star", vars: { X: name(star.from), Y: name(star.to), P: player(star) } });
  const serial = [...t.teams].sort((a, b) => b.seasonTrades - a.seasonTrades)[0];
  if (serial.seasonTrades >= SERIAL_TRADES) out.push({ kind: "serial", vars: { X: serial.name, n: serial.seasonTrades } });
  if (!players.length) out.push({ kind: "onlyPicks", vars: {} });
  else if (picks.length) out.push({ kind: "picks", vars: { X: name(picks[0].from) } });
  const rookie = players.find((m) => m.rookie);
  if (rookie) out.push({ kind: "rookie", vars: { X: name(rookie.from), Y: name(rookie.to), P: player(rookie) } });
  const long = players.filter((m) => (m.yearsLeft ?? 0) >= LONG_YEARS).sort((a, b) => (b.yearsLeft ?? 0) - (a.yearsLeft ?? 0))[0];
  if (long) out.push({ kind: "longContract", vars: { Y: name(long.to), P: player(long), n: fmt(long.yearsLeft ?? 0) } });
  const ghost = players.find((m) => m.gp === 0);
  if (ghost) out.push({ kind: "ghost", vars: { Y: name(ghost.to), P: player(ghost) } });
  if (players.length >= BIG_SWAP_PLAYERS) out.push({ kind: "bigSwap", vars: { n: players.length } });
  if (
    two && !picks.length && players.length === 2 && players[0].from !== players[1].from &&
    players.every((p) => p.salary !== undefined) && Math.abs((players[0].salary ?? 0) - (players[1].salary ?? 0)) <= 1
  ) {
    out.push({ kind: "oneForOne", vars: {} });
  }
  const debut = t.teams.find((team) => team.seasonTrades === 1);
  if (debut && !out.length) out.push({ kind: "firstTrade", vars: { X: debut.name } });
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
  const details = [
    m.pos,
    m.salary !== undefined ? `${fmt(m.salary)} cr` : null,
    m.slot === "reserve" ? "riserva" : null,
    m.injury ? "🚑" : null,
  ].filter(Boolean).join(" · ");
  return `${escapeHtml(m.name ?? m.label ?? "Un giocatore")}${details ? ` <i>(${escapeHtml(details)})</i>` : ""}${escapeHtml(from)}`;
}

/** Messaggio completo: titolo, squadre, chi riceve cosa, eventuale eccezione al cap, battute, chiusura, link allo storico. */
export function announcementText(t: AnnouncedTrade, siteUrl?: string | null): string {
  const lines = [`<b>${escapeHtml(pickFor(t, "headline", HEADLINES))}</b>`, t.teams.map((x) => `<b>${escapeHtml(x.name)}</b>`).join(" ⇄ "), ""];
  for (const team of t.teams) {
    const got = t.moves.filter((m) => m.to === team.id);
    lines.push(`➡️ <b>${escapeHtml(team.name)}</b> riceve:`);
    lines.push(...(got.length ? got.map((m) => `• ${moveText(m, t)}`) : ["• niente, solo la gioia di aver fatto spazio"]));
  }
  if (t.capOverrideReason) lines.push("", `⚖️ Eccezione al cap: <i>${escapeHtml(t.capOverrideReason)}</i>`);
  lines.push("", ...tradeJokes(t).slice(0, MAX_JOKES).map((j) => `😏 ${escapeHtml(fillJoke(t, j))}`));
  lines.push("", `<i>${escapeHtml(pickFor(t, "closing", CLOSINGS))}</i>`);
  const site = siteUrl?.replace(/\/+$/, "");
  if (site) lines.push(`<a href="${escapeHtml(`${site}/storico-scambi`)}">Storico scambi</a>`);
  return lines.join("\n");
}
