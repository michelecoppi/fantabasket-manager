/**
 * Bot Telegram: «rumors di trade». Quando tutte le squadre di una proposta hanno accettato e manca l'approvazione dell'admin, sul
 * canale esce un messaggio che nomina solo le squadre coinvolte (mai giocatori o pick: le proposte restano private). Serve agli
 * admin per accorgersi che c'è una richiesta da approvare e alla lega per l'hype. Puro e testato: l'invio sta in `telegram.ts`.
 * Come per gli annunci, la stessa proposta pesca sempre le stesse frasi.
 */
import { escapeHtml } from "./trade-announce";

export interface TradeRumor {
  id: number;
  /** nomi delle squadre coinvolte, nell'ordine della proposta */
  teams: string[];
}

/** Proposte accettate più vecchie di così non fanno più rumor. */
export const RUMOR_MAX_AGE_HOURS = 24;

export const RUMOR_HEADLINES = [
  "🚨 RUMORS DI MERCATO",
  "👀 SI VOCIFERA…",
  "📡 INDISCREZIONI DAL MERCATO",
  "🕵️ FONTI VICINE ALLA TRATTATIVA",
  "🔥 AVVISTAMENTO IN CORSO",
  "📞 TELEFONI ROVENTI",
  "🗞️ SCOOP DELL'ULTIM'ORA",
] as const;

/** `{teams}`: le squadre con «e» tra le ultime due. */
export const RUMOR_LINES = [
  "Telefonate a tarda ora tra {teams}. Si parla di un accordo vicino. Anzi, vicinissimo.",
  "Fonti vicine alla trattativa: {teams} avrebbero trovato la quadra. Manca solo la firma del notaio.",
  "{teams} sono state viste insieme al bar. Nessuno ha ordinato da bere, hanno ordinato un contratto.",
  "Gli agenti di {teams} escono dalla stanza con un sorriso. Il che, in un mercato serio, non promette niente di buono per qualcuno.",
  "Aria di grandi manovre tra {teams}: ci sarebbe una stretta di mano, ma bisogna ancora fare i conti con la burocrazia.",
  "Dicono che {teams} abbiano già deciso tutto. Dicono anche che chi lo dice sia ben informato.",
  "Si muove qualcosa tra {teams}. Più che un'indiscrezione, un fruscio di carte sotto il tavolo.",
  "{teams}: la trattativa è chiusa, o quasi. Resta solo da capire chi dei due sta già fingendo che sia stata un'idea sua.",
  "Qualcosa bolle in pentola tra {teams}. L'odore è quello di uno scambio, il gusto lo diremo a cose fatte.",
] as const;

export const RUMOR_CLOSINGS = [
  "Nessuna conferma, nessuna smentita. 🍿",
  "I diretti interessati non commentano. Ma stanno ridendo.",
  "Seguiranno aggiornamenti, se qualcuno si decide a firmare.",
  "Il moderatore è stato avvisato e sta cercando la penna. 🖊️",
  "Restate sintonizzati. Il fax è già in stampa.",
  "Tutto ancora da confermare dal moderatore. La suspense è gratis.",
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pickFor = <T>(r: TradeRumor, what: string, pool: readonly T[]): T => pool[hash(`${r.id}:${what}`) % pool.length];

/** «A», «A e B», «A, B e C». */
function joinTeams(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Legge la risposta di `trade_rumor_claim`; scarta ciò che non ha almeno due squadre. */
export function parseRumors(data: unknown): TradeRumor[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw): TradeRumor[] => {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const id = Number(r.id);
    const teams = (Array.isArray(r.teams) ? r.teams : []).filter((t): t is string => typeof t === "string" && t.length > 0);
    return Number.isFinite(id) && teams.length >= 2 ? [{ id, teams }] : [];
  });
}

/** Messaggio HTML per Telegram: titolo, riga con le squadre in grassetto, chiusura. Niente link al sito: non c'è ancora nulla da vedere. */
export function rumorText(r: TradeRumor): string {
  const names = r.teams.map((t) => `<b>${escapeHtml(t)}</b>`);
  const line = pickFor(r, "line", RUMOR_LINES).replace("{teams}", () => joinTeams(names));
  return [`<b>${escapeHtml(pickFor(r, "headline", RUMOR_HEADLINES))}</b>`, "", line, "", `<i>${escapeHtml(pickFor(r, "closing", RUMOR_CLOSINGS))}</i>`].join("\n");
}
