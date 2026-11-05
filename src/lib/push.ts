// Notifiche push (docs/product/PIANO-NOTIFICHE-PUSH.md): l'unico punto dell'app che chiama i servizi di notifica dei browser.
// Le action (proposte, risposte, approvazioni) lo chiamano subito dopo aver scritto, dentro `after()`, e il cron giornaliero come
// rete. Prende gli eventi nuovi del registro delle proposte (`push_claim`), decide chi avvisare (`push-notify.ts`), spedisce con le
// chiavi VAPID e toglie le iscrizioni scadute. Senza chiavi VAPID non fa nulla. Mai il testo di un'iscrizione nei log: l'indirizzo
// di notifica è riservato.
import webpush from "web-push";
import type { createClient } from "@/lib/supabase/server";
import { parsePushClaim, pushMessages, type PushPayload } from "./push-notify";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Eventi più vecchi di così non si notificano più (il sito era fermo, le chiavi mancavano): un avviso in ritardo di ore non serve. */
export const PUSH_MAX_AGE_HOURS = 12;
/** Quanto il servizio di notifica tiene l'avviso per un telefono spento o senza rete. */
const TTL_SECONDS = 6 * 3600;
const SEND_TIMEOUT_MS = 8_000;
/** Spedizioni in parallelo: otto proprietari con qualche dispositivo, ma meglio non aprire cento connessioni. */
const BATCH = 10;

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` o indirizzo https del sito: i servizi di notifica lo vogliono per contattare chi spedisce */
  subject: string;
}

/** Chiavi VAPID dall'ambiente (`npx web-push generate-vapid-keys`, vedi docs/DEPLOY.md). Senza, le notifiche sono spente. */
export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const site = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  const subject = env.VAPID_SUBJECT?.trim() || (site && site.startsWith("https://") ? site : "");
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone`: il servizio dice che l'iscrizione non esiste più (404/410), va tolta dal database. */
export type PushSendResult = { ok: true } | { ok: false; gone: boolean; error: string };
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<PushSendResult>;

/** Chi spedisce davvero (nei test se ne passa uno finto). Non lancia: l'esito torna come valore, senza indirizzo né chiavi. */
export function webPushSender(cfg: PushConfig): PushSender {
  return async (target, payload) => {
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
        TTL: TTL_SECONDS,
        urgency: "high",
        timeout: SEND_TIMEOUT_MS,
      });
      return { ok: true };
    } catch (e) {
      const status = typeof e === "object" && e !== null && "statusCode" in e ? Number((e as { statusCode: unknown }).statusCode) : 0;
      return { ok: false, gone: status === 404 || status === 410, error: status ? `HTTP ${status}` : e instanceof Error ? e.name : "errore" };
    }
  };
}

export type PushResult = { skipped: true } | { skipped: false; events: number; sent: number; pruned: number; errors: string[] };

/** Spedisce a tutti i bersagli, `BATCH` alla volta; torna gli esiti nello stesso ordine. */
async function sendAll(send: PushSender, jobs: { target: PushTarget; payload: PushPayload }[]): Promise<PushSendResult[]> {
  const out: PushSendResult[] = [];
  for (let i = 0; i < jobs.length; i += BATCH) {
    out.push(...(await Promise.all(jobs.slice(i, i + BATCH).map((j) => send(j.target, j.payload)))));
  }
  return out;
}

/**
 * Prende gli eventi nuovi, avvisa i dispositivi giusti e toglie le iscrizioni scadute. `secret`: segreto del job (CRON_SECRET) o
 * null per la sessione di un admin; le action dei proprietari passano il segreto, che sta solo sul server.
 */
export async function announcePush(
  db: Db,
  secret: string | null,
  cfg: PushConfig | null = pushConfig(),
  send: PushSender | null = cfg ? webPushSender(cfg) : null,
  now: () => number = Date.now,
): Promise<PushResult> {
  if (!cfg || !send) return { skipped: true };
  const claim = await db.rpc("push_claim", { p_secret: secret, p_max_age_hours: PUSH_MAX_AGE_HOURS });
  if (claim.error) return { skipped: false, events: 0, sent: 0, pruned: 0, errors: [claim.error.message] };
  const { events, subs } = parsePushClaim(claim.data);
  const jobs = events.flatMap((e) => pushMessages(e, subs, now())).map((m) => ({ target: m.sub, payload: m.payload }));
  const results = await sendAll(send, jobs);

  const errors: string[] = [];
  const gone = new Set<string>();
  let sent = 0;
  results.forEach((r, i) => {
    if (r.ok) sent++;
    else if (r.gone) gone.add(jobs[i].target.endpoint);
    else errors.push(`avviso non consegnato (${r.error})`);
  });
  let pruned = 0;
  if (gone.size) {
    const res = await db.rpc("push_prune", { p_secret: secret, p_endpoints: [...gone] });
    if (res.error) errors.push(`iscrizioni scadute non tolte: ${res.error.message}`);
    else pruned = Number(res.data) || 0;
  }
  return { skipped: false, events: events.length, sent, pruned, errors };
}

/** Per le action e il cron: avvisa senza mai far fallire chi la chiama. Il segreto del job viene dall'ambiente del server. */
export async function announcePushQuietly(db: Db): Promise<void> {
  try {
    const res = await announcePush(db, process.env.CRON_SECRET ?? null);
    if (!res.skipped && res.errors.length) console.error(`[push] ${res.errors.join("; ")}`);
  } catch (e) {
    console.error(`[push] avvisi non riusciti: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Avviso di prova ai dispositivi dell'utente (letti con la sua sessione: la RLS dà solo i suoi). */
export async function sendPushTest(
  db: Db,
  cfg: PushConfig | null = pushConfig(),
  send: PushSender | null = cfg ? webPushSender(cfg) : null,
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  if (!cfg || !send) return { ok: false, error: "Le notifiche non sono ancora attive sul sito (mancano le chiavi sul server)." };
  const own = await db.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (own.error) return { ok: false, error: "Non riesco a leggere i tuoi dispositivi. Riprova tra poco." };
  const targets = (own.data ?? []) as PushTarget[];
  if (!targets.length) return { ok: false, error: "Nessun dispositivo attivo: attiva prima le notifiche da questo telefono." };
  const payload: PushPayload = { title: "Notifiche attive", body: "Se leggi questo avviso, le notifiche funzionano.", url: "/account", tag: "test" };
  const results = await sendAll(send, targets.map((target) => ({ target, payload })));
  // Le iscrizioni scadute si tolgono: sono dell'utente stesso, quindi basta la sua sessione.
  await Promise.all(results.flatMap((r, i) => (!r.ok && r.gone ? [db.rpc("push_unsubscribe", { p_endpoint: targets[i].endpoint })] : [])));
  const sent = results.filter((r) => r.ok).length;
  return sent ? { ok: true, sent } : { ok: false, error: "Il servizio di notifica non ha accettato l'avviso: riattiva le notifiche da questo telefono." };
}
