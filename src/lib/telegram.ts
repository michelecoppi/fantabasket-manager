// Bot Telegram (Fase 7.5): l'unico punto dell'app che chiama Telegram. Annuncia sul canale della lega gli scambi eseguiti, come
// foto (la card di `components/card-scambio.tsx`) con una didascalia breve; se la foto non si può disegnare o Telegram la rifiuta,
// come messaggio di testo con l'elenco completo.
// Lo usano le action admin subito dopo uno scambio (sessione admin, segreto null, dentro `after`) e il cron giornaliero
// (`/api/dunkest`, con il segreto) come rete per gli invii falliti. Senza TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID non fa nulla:
// gli scambi restano in coda (`trades.announced_at` vuoto) fino a ANNOUNCE_MAX_AGE_HOURS.
import type { createClient } from "@/lib/supabase/server";
import { announcedTeamColor, cardFromAnnounced, type TradeCardModel } from "./trade-card";
import { ANNOUNCE_MAX_AGE_HOURS, announcementCaption, announcementText, parseAnnouncements, type AnnouncedTrade } from "./trade-announce";

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

/** Per le action: annuncia senza mai far fallire chi la chiama. */
export async function announceTradesQuietly(db: Db): Promise<void> {
  try {
    const res = await announceTrades(db, null);
    if (!res.skipped && res.errors.length) console.error(`[telegram] ${res.errors.join("; ")}`);
  } catch (e) {
    console.error(`[telegram] annuncio non riuscito: ${e instanceof Error ? e.message : String(e)}`);
  }
}
