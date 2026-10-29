// Bot Telegram (Fase 7.5): l'unico punto dell'app che chiama Telegram. Annuncia sul canale della lega gli scambi eseguiti.
// Lo usano le action admin subito dopo uno scambio (sessione admin, segreto null, dentro `after`) e il cron giornaliero
// (`/api/dunkest`, con il segreto) come rete per gli invii falliti. Senza TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID non fa nulla:
// gli scambi restano in coda (`trades.announced_at` vuoto) fino a ANNOUNCE_MAX_AGE_HOURS.
import type { createClient } from "@/lib/supabase/server";
import { ANNOUNCE_MAX_AGE_HOURS, announcementText, parseAnnouncements } from "./trade-announce";

type Db = Awaited<ReturnType<typeof createClient>>;

const TIMEOUT_MS = 10_000;

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export function telegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

/** Un messaggio HTML sul canale. Non lancia: l'errore torna come testo (mai il token). */
export async function sendTelegram(cfg: TelegramConfig, html: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    return { ok: false, error: `Telegram ha risposto HTTP ${res.status}${body?.description ? `: ${body.description}` : ""}` };
  } catch (e) {
    return { ok: false, error: `Telegram non risponde (${e instanceof Error ? e.name : "errore"})` };
  }
}

export type AnnounceResult = { skipped: true } | { skipped: false; sent: number; errors: string[] };

/** Prende gli scambi da annunciare, li pubblica uno alla volta e segna l'esito (un invio fallito si riprova al giro dopo). */
export async function announceTrades(db: Db, secret: string | null): Promise<AnnounceResult> {
  const cfg = telegramConfig();
  if (!cfg) return { skipped: true };
  const claim = await db.rpc("trade_announce_claim", { p_secret: secret, p_max_age_hours: ANNOUNCE_MAX_AGE_HOURS });
  if (claim.error) return { skipped: false, sent: 0, errors: [claim.error.message] };
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  let sent = 0;
  const errors: string[] = [];
  for (const trade of parseAnnouncements(claim.data)) {
    const res = await sendTelegram(cfg, announcementText(trade, site));
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
