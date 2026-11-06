/**
 * Bot Telegram: annuncio della promozione di un rookie dalla squadra talenti (le promesse) alla rosa della squadra
 * (titolari / prima squadra o squadra riserve). Messaggio di testo con dettagli del rookie, contratto e una battuta,
 * nello stile degli altri annunci della lega. Puro e testato: l'invio sta in `telegram.ts`.
 */
import { escapeHtml } from "./trade-announce";

export interface AnnouncedTalentPromotion {
  talentId: number;
  teamId: string;
  team: string;
  playerName: string;
  pos: string | null;
  nbaTeam: string | null;
  slot: "starter" | "reserve";
  salary: number;
  years: number | null;
  teamOption: boolean;
  draftYear: number | null;
}

export const TALENT_HEADLINES_STARTER = [
  "🎓 DALLE PROMESSE ALLA PRIMA SQUADRA",
  "🌟 IL ROOKIE SALE TRA I GRANDI",
  "🚀 PROMOZIONE IN PRIMA SQUADRA",
  "🐣 DALLE PROMESSE AL QUINTETTO",
  "⭐ DEBUTTO TRA I TITOLARI",
] as const;

export const TALENT_HEADLINES_RESERVE = [
  "🎓 DALLE PROMESSE ALLA SQUADRA RISERVE",
  "🌟 NUOVO INNESTO DALLE PROMESSE",
  "🐣 IL ROOKIE ENTRA IN ROSA",
  "⭐ PROMOSSO NELLE RISERVE",
] as const;

/** `{team}`: la squadra in grassetto. */
export const TALENT_LINES = [
  "{team} decide che è ora di fare sul serio: fine del parcheggio tra le promesse, il rookie fa il grande salto.",
  "Dalle promesse al campo vero: {team} lancia il suo pupillo. Il GM giura che l'aveva previsto già ai tempi dell'high school.",
  "Spazio ai giovani per {team}. I veterani dello spogliatoio stanno già preparando lo scherzo con la borsa piena di popcorn.",
  "Promozione ufficiale in casa {team}: il ragazzo prodigio lascia la squadra talenti. Se fa bene è merito dello scouting, se floppa colpa del coach.",
  "{team} lancia il rookie nel basket dei grandi: cifre da star al college, ma adesso tocca difendere sui blocchi ciechi.",
  "Chiamata al piano di sopra per {team}: la promessa diventa realtà. O almeno lo spera chi ha firmato l'assegno.",
  "Il GM di {team} si gioca la carta del giovane rampante: fine della gavetta tra le promesse, adesso contano i PDK su Dunkest.",
  "{team} promuove il suo gioiellino. In conferenza stampa dicono «ha un talento generazionale», vedremo dopo tre palle perse consecutive.",
  "Basta svernare tra le promesse: {team} promuove il rookie. Il contabile ha controllato tre volte che ci stesse dentro il cap.",
  "Firma e promozione per {team}: un altro talento delle promesse sbarca tra i grandi. Le aspettative sono modeste: salvare la stagione.",
  "A casa {team} si apre lo scrigno delle promesse: speriamo sia un tesoro e non un pacco postale.",
  "{team} pesca dal suo vivaio: il rookie è pronto a spaccare il mondo (o a fare il portaborse fino a Natale).",
] as const;

export const TALENT_CLOSINGS = [
  "I veterani hanno già mandato il ragazzo a prendere i cornetti alle sei del mattino.",
  "Dalle promesse alla gloria (o al taglio a febbraio): il confine è sottilissimo.",
  "Registrato nell'app. Ora palla al campo.",
  "Se diventa un All-Star il GM dirà che l'ha scoperto lui. Se scalda la panca dirà che non l'ha mai visto prima.",
  "Benvenuto tra i grandi: niente alibi, niente sconti.",
  "Il futuro è adesso. O al massimo dalla prossima giornata Dunkest.",
  "Il moderatore ha firmato il contratto. Il rookie ha già chiesto il numero di maglia.",
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pickFor = <T>(p: AnnouncedTalentPromotion, what: string, pool: readonly T[]): T =>
  pool[hash(`talent:${p.talentId}:${what}`) % pool.length];

function durationString(years: number | null, teamOption: boolean): string {
  if (years === null) return "durata da fissare";
  if (years === 0.5) return "½ stagione";
  const num = `${years}${teamOption ? "+1" : ""}`;
  const unit = years === 1 && !teamOption ? "anno" : "anni";
  return `${num} ${unit}${teamOption ? " (team option)" : ""}`;
}

/** Messaggio HTML per Telegram: titolo, squadra, rookie, contratto, battuta e link alla squadra. */
export function talentPromotionText(p: AnnouncedTalentPromotion, siteUrl?: string | null): string {
  const team = `<b>${escapeHtml(p.team)}</b>`;
  const isStarter = p.slot === "starter";
  const headlines = isStarter ? TALENT_HEADLINES_STARTER : TALENT_HEADLINES_RESERVE;
  const headline = pickFor(p, "headline", headlines);

  const playerLine = `• ${p.pos ? `${escapeHtml(p.pos)} · ` : ""}<b>${escapeHtml(p.playerName)}</b>${p.nbaTeam ? ` (${escapeHtml(p.nbaTeam)})` : ""}`;
  const contractLine = `Contratto rookie · ${durationString(p.years, p.teamOption)} · ${String(p.salary).replace(".", ",")} crediti${p.draftYear ? ` · Draft ${p.draftYear}` : ""}`;
  const slotLine = isStarter
    ? "Destinazione: <b>Titolare (prima squadra)</b>"
    : "Destinazione: <b>Squadra riserve</b>";

  const lines = [
    `<b>${escapeHtml(headline)}</b>`,
    team,
    "",
    playerLine,
    contractLine,
    slotLine,
  ];

  if (isStarter) {
    lines.push("<i>⚠️ Da inserire anche nella formazione su Dunkest!</i>");
  }

  lines.push("", pickFor(p, "line", TALENT_LINES).replace("{team}", () => team));
  lines.push("", `<i>${escapeHtml(pickFor(p, "closing", TALENT_CLOSINGS))}</i>`);

  const site = siteUrl?.replace(/\/+$/, "");
  if (site && p.teamId) {
    lines.push(`<a href="${escapeHtml(`${site}/squadre/${p.teamId}`)}">La rosa di ${escapeHtml(p.team)}</a>`);
  }

  return lines.join("\n");
}
