// Bot Telegram (Fase 7.5): l'unico punto dell'app che chiama Telegram. Annuncia sul canale della lega gli scambi eseguiti, come
// foto (la card di `components/card-scambio.tsx`) con una didascalia breve; se la foto non si può disegnare o Telegram la rifiuta,
// come messaggio di testo con l'elenco completo.
// Prima dell'approvazione manda anche un «rumor» (solo i nomi delle squadre) quando tutte hanno accettato una proposta (`announceRumors`).
// Lo usano le action admin subito dopo uno scambio (sessione admin, segreto null, dentro `after`) e il cron giornaliero
// (`/api/dunkest`, con il segreto) come rete per gli invii falliti. Senza TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID non fa nulla:
// gli scambi restano in coda (`trades.announced_at` vuoto) fino a ANNOUNCE_MAX_AGE_HOURS.
import type { createClient } from "@/lib/supabase/server";
import { announcedTeamColor, cardFromAnnounced, type TradeCardModel } from "./trade-card";
import { ANNOUNCE_MAX_AGE_HOURS, announcementCaption, announcementText, parseAnnouncements, type AnnouncedTrade } from "./trade-announce";
import { RUMOR_MAX_AGE_HOURS, parseRumors, rumorText } from "./trade-rumor";
import { SLOT_SWAP_MAX_AGE_HOURS, parseSlotSwapAnnouncements, slotSwapText } from "./slot-swap-announce";
import { talentPromotionText, type AnnouncedTalentPromotion } from "./talent-announce";

type Db = Awaited<ReturnType<typeof createClient>>;

const TIMEOUT_MS = 10_000;
/** Disegnare e caricare un PNG da ~250 KB costa più di un messaggio. */
const PHOTO_TIMEOUT_MS = 25_000;

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export function telegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

/**
 * Chat private degli admin che ricevono gli avvisi (`TELEGRAM_ADMIN_ALERT`: id numerici Telegram separati da virgola). Gli id non
 * numerici si scartano. Il bot può scrivere solo a chi gli ha già mandato /start.
 */
export function adminAlertChats(raw = process.env.TELEGRAM_ADMIN_ALERT): string[] {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^-?\d+$/.test(s)))];
}

/**
 * Esito di un invio. `rejected`: Telegram ha risposto con un errore, quindi nulla è stato pubblicato; senza (rete, timeout) non si sa
 * se il messaggio sia arrivato, e ritentarlo con un'altra forma potrebbe pubblicarlo due volte.
 */
export type SendResult = { ok: true } | { ok: false; error: string; rejected: boolean };

async function telegramFailure(res: Response): Promise<SendResult> {
  const body = (await res.json().catch(() => null)) as { description?: string } | null;
  return { ok: false, error: `Telegram ha risposto HTTP ${res.status}${body?.description ? `: ${body.description}` : ""}`, rejected: true };
}

const unreachable = (e: unknown): SendResult => ({ ok: false, error: `Telegram non risponde (${e instanceof Error ? e.name : "errore"})`, rejected: false });

/** Un messaggio HTML sul canale. Non lancia: l'errore torna come testo (mai il token). */
export async function sendTelegram(cfg: TelegramConfig, html: string): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? { ok: true } : await telegramFailure(res);
  } catch (e) {
    return unreachable(e);
  }
}

/** Una foto PNG con didascalia HTML (al massimo 1024 caratteri) sul canale. Non lancia. */
export async function sendTelegramPhoto(cfg: TelegramConfig, png: ArrayBuffer, caption: string, filename: string): Promise<SendResult> {
  try {
    const form = new FormData();
    form.set("chat_id", cfg.chatId);
    form.set("caption", caption);
    form.set("parse_mode", "HTML");
    form.set("photo", new Blob([png], { type: "image/png" }), filename);
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendPhoto`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    });
    return res.ok ? { ok: true } : await telegramFailure(res);
  } catch (e) {
    return unreachable(e);
  }
}

export type AnnounceResult = { skipped: true } | { skipped: false; sent: number; errors: string[] };

/** Chi disegna la card (nei test se ne passa uno finto). */
export type CardRenderer = (model: TradeCardModel) => Promise<ArrayBuffer>;

/** Il disegno vero (JSX, `next/og`) si carica solo quando serve: chi importa questo file per l'invio di testo non lo paga. */
const renderCard: CardRenderer = async (model) => (await import("./card-render")).renderTradeCardPng(model);

/**
 * Annuncia uno scambio: foto con didascalia; se la card non si disegna o Telegram rifiuta la foto, messaggio di testo con
 * l'elenco completo. Se la foto non ha risposto (timeout) non si ripiega sul testo: potrebbe essere già arrivata.
 */
export async function announceOne(cfg: TelegramConfig, trade: AnnouncedTrade, site: string | undefined, render: CardRenderer): Promise<SendResult> {
  const text = () => sendTelegram(cfg, announcementText(trade, site));
  let model: TradeCardModel;
  let png: ArrayBuffer;
  try {
    model = cardFromAnnounced(trade, (t) => announcedTeamColor(trade, t));
    png = await render(model);
  } catch (e) {
    console.error(`[telegram] card dello scambio n. ${trade.id} non disegnata, annuncio di testo: ${e instanceof Error ? e.message : String(e)}`);
    return text();
  }
  const extras = model.teams.filter((t) => t.hidden.length > 0).map((t) => ({ team: t.name, labels: t.hidden }));
  const photo = await sendTelegramPhoto(cfg, png, announcementCaption(trade, extras, site), `scambio-${trade.id}.png`);
  if (photo.ok || !photo.rejected) return photo;
  console.error(`[telegram] foto dello scambio n. ${trade.id} rifiutata, annuncio di testo: ${photo.error}`);
  return text();
}

/** Prende gli scambi da annunciare, li pubblica uno alla volta e segna l'esito (un invio fallito si riprova al giro dopo). */
export async function announceTrades(db: Db, secret: string | null, render: CardRenderer = renderCard): Promise<AnnounceResult> {
  const cfg = telegramConfig();
  if (!cfg) return { skipped: true };
  const claim = await db.rpc("trade_announce_claim", { p_secret: secret, p_max_age_hours: ANNOUNCE_MAX_AGE_HOURS });
  if (claim.error) return { skipped: false, sent: 0, errors: [claim.error.message] };
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  let sent = 0;
  const errors: string[] = [];
  for (const trade of parseAnnouncements(claim.data)) {
    const res = await announceOne(cfg, trade, site, render);
    if (res.ok) sent++;
    else errors.push(`scambio n. ${trade.id}: ${res.error}`);
    const done = await db.rpc("trade_announce_done", { p_secret: secret, p_id: trade.id, p_ok: res.ok });
    if (done.error) errors.push(`scambio n. ${trade.id}: esito non salvato (${done.error.message})`);
  }
  return { skipped: false, sent, errors };
}

/**
 * Rumors di trade: per ogni proposta accettata da tutte le squadre e in attesa dell'admin, un messaggio con i soli nomi delle
 * squadre. La presa segna subito l'ora (niente doppi messaggi); se l'invio fallisce si libera e si riprova al giro dopo.
 * `secret` null: sessione di un admin o di un proprietario (vede solo le proposte della sua squadra).
 */
export async function announceRumors(db: Db, secret: string | null): Promise<AnnounceResult> {
  const cfg = telegramConfig();
  if (!cfg) return { skipped: true };
  const claim = await db.rpc("trade_rumor_claim", { p_secret: secret, p_max_age_hours: RUMOR_MAX_AGE_HOURS });
  if (claim.error) return { skipped: false, sent: 0, errors: [claim.error.message] };
  let sent = 0;
  const errors: string[] = [];
  for (const rumor of parseRumors(claim.data)) {
    const res = await sendTelegram(cfg, rumorText(rumor));
    if (res.ok) sent++;
    else {
      errors.push(`rumor della proposta n. ${rumor.id}: ${res.error}`);
      const done = await db.rpc("trade_rumor_done", { p_secret: secret, p_id: rumor.id, p_ok: false });
      if (done.error) errors.push(`rumor della proposta n. ${rumor.id}: presa non liberata (${done.error.message})`);
    }
  }
  return { skipped: false, sent, errors };
}

/** Per le action dei proprietari: fa uscire il rumore senza mai far fallire chi risponde. */
export async function announceRumorsQuietly(db: Db): Promise<void> {
  try {
    const res = await announceRumors(db, null);
    if (!res.skipped && res.errors.length) console.error(`[telegram] ${res.errors.join("; ")}`);
  } catch (e) {
    console.error(`[telegram] rumor non riuscito: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Cambi titolari ↔ riserve approvati (R-04): un messaggio di testo per cambio, con chi sale e chi scende. Stessa coda degli scambi
 * (presa di 5 minuti, esito segnato; un invio fallito si riprova al giro dopo). `secret` null: sessione di un admin.
 */
export async function announceSlotSwaps(db: Db, secret: string | null): Promise<AnnounceResult> {
  const cfg = telegramConfig();
  if (!cfg) return { skipped: true };
  const claim = await db.rpc("slot_swap_announce_claim", { p_secret: secret, p_max_age_hours: SLOT_SWAP_MAX_AGE_HOURS });
  if (claim.error) return { skipped: false, sent: 0, errors: [claim.error.message] };
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  let sent = 0;
  const errors: string[] = [];
  for (const swap of parseSlotSwapAnnouncements(claim.data)) {
    const res = await sendTelegram(cfg, slotSwapText(swap, site));
    if (res.ok) sent++;
    else errors.push(`cambio n. ${swap.id}: ${res.error}`);
    const done = await db.rpc("slot_swap_announce_done", { p_secret: secret, p_id: swap.id, p_ok: res.ok });
    if (done.error) errors.push(`cambio n. ${swap.id}: esito non salvato (${done.error.message})`);
  }
  return { skipped: false, sent, errors };
}

/**
 * Avviso privato agli admin di `TELEGRAM_ADMIN_ALERT` (per ora: una squadra ha chiesto un cambio titolari/riserve). Un messaggio per
 * admin; senza token o senza id non fa nulla. Non si riprova: l'avviso resta anche nel badge su «Admin».
 */
export async function alertAdmins(html: string): Promise<AnnounceResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chats = adminAlertChats();
  if (!token || chats.length === 0) return { skipped: true };
  let sent = 0;
  const errors: string[] = [];
  for (const chatId of chats) {
    const res = await sendTelegram({ token, chatId }, html);
    if (res.ok) sent++;
    else errors.push(`avviso all'admin ${chatId}: ${res.error}`);
  }
  return { skipped: false, sent, errors };
}

/** Per le action: avvisa gli admin senza mai far fallire chi la chiama. */
export async function alertAdminsQuietly(html: string): Promise<void> {
  try {
    const res = await alertAdmins(html);
    if (!res.skipped && res.errors.length) console.error(`[telegram] ${res.errors.join("; ")}`);
  } catch (e) {
    console.error(`[telegram] avviso agli admin non riuscito: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Per le action admin: annuncia i cambi senza mai far fallire chi la chiama. */
export async function announceSlotSwapsQuietly(db: Db): Promise<void> {
  try {
    const res = await announceSlotSwaps(db, null);
    if (!res.skipped && res.errors.length) console.error(`[telegram] ${res.errors.join("; ")}`);
  } catch (e) {
    console.error(`[telegram] annuncio del cambio non riuscito: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Per le action: annuncia senza mai far fallire chi la chiama. */
export async function announceTradesQuietly(db: Db): Promise<void> {
  try {
    const res = await announceTrades(db, null);
    if (!res.skipped && res.errors.length) console.error(`[telegram] ${res.errors.join("; ")}`);
  } catch (e) {
    console.error(`[telegram] annuncio non riuscito: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Annuncio della promozione di un rookie dalla squadra talenti (le promesse) alla prima squadra o riserve.
 */
export async function announceTalentPromotion(cfg: TelegramConfig, promo: AnnouncedTalentPromotion, siteUrl?: string | null): Promise<SendResult> {
  const html = talentPromotionText(promo, siteUrl);
  return sendTelegram(cfg, html);
}

/** Per le action admin: annuncia la promozione di un rookie senza mai far fallire chi la chiama. */
export async function announceTalentPromotionQuietly(promo: AnnouncedTalentPromotion): Promise<void> {
  try {
    const cfg = telegramConfig();
    if (!cfg) return;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    const res = await announceTalentPromotion(cfg, promo, site);
    if (!res.ok) console.error(`[telegram] annuncio promozione talento non riuscito: ${res.error}`);
  } catch (e) {
    console.error(`[telegram] annuncio promozione talento non riuscito: ${e instanceof Error ? e.message : String(e)}`);
  }
}
