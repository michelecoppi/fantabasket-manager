/**
 * Bot Telegram: annuncio dei cambi titolari ↔ riserve approvati (R-04, docs/product/PIANO-CAMBI-RISERVE.md). Messaggio di testo
 * con chi sale e chi scende e una battuta, come gli scambi. Puro e testato: l'invio sta in `telegram.ts`. Lo stesso cambio pesca
 * sempre le stesse frasi.
 */
import { escapeHtml } from "./trade-announce";

export interface AnnouncedSwapPlayer {
  name: string;
  pos: string | null;
  salary: number | null;
  /** dove va il giocatore */
  slot: "starter" | "reserve";
}

export interface AnnouncedSlotSwap {
  id: number;
  team: string;
  teamId: string;
  /** cambi approvati della squadra in stagione, questo compreso */
  seasonSwaps: number;
  players: AnnouncedSwapPlayer[];
}

/** I cambi approvati più vecchi di così non si annunciano più (canale configurato tardi, cron fermo). */
export const SLOT_SWAP_MAX_AGE_HOURS = 72;

export const SWAP_HEADLINES = [
  "🔁 SU E GIÙ DALLE RISERVE",
  "📋 LAVAGNA DEL COACH",
  "🪑 GIRO DI SEDIE",
  "🧑‍🏫 IL COACH HA DECISO",
  "📣 CAMBIO TITOLARI/RISERVE",
] as const;

/** `{team}`: la squadra in grassetto. */
export const SWAP_LINES = [
  "{team} rimescola le carte: qualcuno sale tra i titolari, qualcuno scopre il fascino della squadra riserve.",
  "Rosa ritoccata per {team}. Il coach giura che è tutto calcolato.",
  "{team} cambia le gerarchie. Gli esclusi parlano di «scelta tecnica», gli altri non parlano.",
  "Riunione tecnica a casa {team}: lavagna, pennarello, due occhiaie e una decisione.",
  "{team} manda un messaggio allo spogliatoio: il posto da titolare non è per sempre.",
  "A {team} si cambia: il budget riserve ringrazia, l'ego di qualcuno un po' meno.",
] as const;

export const SWAP_CLOSINGS = [
  "Già fatto anche su Dunkest. Lamentele al coach, non al moderatore.",
  "Dalla squadra riserve si torna, dicono. Qualcuno ci spera già.",
  "Nessuno è stato maltrattato durante il cambio. Forse.",
  "Chi passa alle riserve può consolarsi: almeno lo stipendio adesso lo paga il budget riserve.",
  "Il moderatore ha firmato. Ora si gioca.",
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pickFor = <T>(s: AnnouncedSlotSwap, what: string, pool: readonly T[]): T => pool[hash(`swap:${s.id}:${what}`) % pool.length];

/** Legge la risposta di `slot_swap_announce_claim`; scarta ciò che non ha squadra o giocatori. */
export function parseSlotSwapAnnouncements(data: unknown): AnnouncedSlotSwap[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw): AnnouncedSlotSwap[] => {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const id = Number(r.id);
    const team = typeof r.team === "string" ? r.team : "";
    const players = (Array.isArray(r.items) ? r.items : []).flatMap((x): AnnouncedSwapPlayer[] => {
      const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
      if (typeof o.name !== "string" || !o.name || (o.slot !== "starter" && o.slot !== "reserve")) return [];
      const salary = o.salary === null || o.salary === undefined ? null : Number(o.salary);
      return [{ name: o.name, pos: typeof o.pos === "string" ? o.pos : null, salary: Number.isFinite(salary) ? salary : null, slot: o.slot }];
    });
    if (!Number.isFinite(id) || !team || players.length === 0) return [];
    return [{ id, team, teamId: typeof r.team_id === "string" ? r.team_id : "", seasonSwaps: Number(r.season_swaps) || 1, players }];
  });
}

const line = (p: AnnouncedSwapPlayer) =>
  `• ${p.pos ? `${escapeHtml(p.pos)} · ` : ""}${escapeHtml(p.name)}${p.salary !== null ? ` (${String(p.salary).replace(".", ",")})` : ""}`;

/**
 * Avviso privato agli admin quando una squadra manda una richiesta: squadra, chi sale e chi passa alle riserve, avvisi (luxury tax)
 * e link alla coda in /admin/rose. Niente battute: è un promemoria di lavoro.
 */
export function slotSwapAlertText(team: string, players: AnnouncedSwapPlayer[], warnings: string[], siteUrl?: string | null): string {
  const up = players.filter((p) => p.slot === "starter");
  const down = players.filter((p) => p.slot === "reserve");
  const lines = ["🔔 <b>Richiesta di cambio titolari/riserve</b>", `<b>${escapeHtml(team)}</b>`, ""];
  if (up.length) lines.push("⬆️ <b>Salgono titolari</b>", ...up.map(line));
  if (down.length) lines.push("⬇️ <b>Passano alle riserve</b>", ...down.map(line));
  if (warnings.length) lines.push("", ...warnings.map((w) => `⚠️ ${escapeHtml(w)}`));
  lines.push("", "Fallo su Dunkest, poi approvalo nell'app.");
  const site = siteUrl?.replace(/\/+$/, "");
  if (site) lines.push(`<a href="${escapeHtml(`${site}/admin/rose#cambi`)}">Cambi richiesti</a>`);
  return lines.join("\n");
}

/** Messaggio HTML per Telegram: titolo, squadra, chi sale e chi scende, battuta, link alla squadra. */
export function slotSwapText(s: AnnouncedSlotSwap, siteUrl?: string | null): string {
  const team = `<b>${escapeHtml(s.team)}</b>`;
  const up = s.players.filter((p) => p.slot === "starter");
  const down = s.players.filter((p) => p.slot === "reserve");
  const lines = [`<b>${escapeHtml(pickFor(s, "headline", SWAP_HEADLINES))}</b>`, team, ""];
  if (up.length) lines.push("⬆️ <b>Salgono titolari</b>", ...up.map(line));
  if (down.length) lines.push("⬇️ <b>Passano alle riserve</b>", ...down.map(line));
  lines.push("", pickFor(s, "line", SWAP_LINES).replace("{team}", () => team));
  if (s.seasonSwaps > 1) lines.push(`È il ${s.seasonSwaps}° cambio della stagione per ${team}.`);
  lines.push("", `<i>${escapeHtml(pickFor(s, "closing", SWAP_CLOSINGS))}</i>`);
  const site = siteUrl?.replace(/\/+$/, "");
  if (site && s.teamId) lines.push(`<a href="${escapeHtml(`${site}/squadre/${s.teamId}`)}">La rosa di ${escapeHtml(s.team)}</a>`);
  return lines.join("\n");
}
