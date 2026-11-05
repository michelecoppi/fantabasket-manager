import { describe, expect, it, vi } from "vitest";
import { announcePush, PUSH_MAX_AGE_HOURS, pushConfig, sendPushTest, type PushConfig, type PushSender } from "./push";

const CFG: PushConfig = { publicKey: "pub", privateKey: "priv", subject: "mailto:lega@example.com" };
const NOW = Date.parse("2026-11-05T10:00:00Z");

const claimData = {
  events: [
    {
      id: 1, kind: "sent", note: null, proposal_id: 7, actor: "u-a", team_id: "a", proposer: "a", counter: false,
      expires_at: "2026-11-05T13:00:00Z", completes: false, teams: [{ id: "a", name: "Bol" }, { id: "b", name: "Spa" }],
    },
  ],
  subs: [
    { user_id: "u-b", team_id: "b", admin: false, endpoint: "https://push.example/b1", p256dh: "k1", auth: "a1" },
    { user_id: "u-b", team_id: "b", admin: false, endpoint: "https://push.example/b2", p256dh: "k2", auth: "a2" },
    { user_id: "u-a", team_id: "a", admin: false, endpoint: "https://push.example/a1", p256dh: "k3", auth: "a3" },
  ],
};

/** Finto client: registra le chiamate `rpc` e risponde con quello che si è preparato. */
function fakeDb(answers: Record<string, { data?: unknown; error?: { message: string } | null }>, own?: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async (name: string) => ({ data: null, error: null, ...answers[name] }));
  const select = vi.fn(async () => ({ data: null, error: null, ...own }));
  const db = { rpc, from: vi.fn(() => ({ select })) };
  return { db: db as unknown as Parameters<typeof announcePush>[0], rpc };
}

describe("pushConfig", () => {
  it("serve la coppia di chiavi e un contatto", () => {
    expect(pushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "mailto:a@b.it" })).toEqual({ publicKey: "p", privateKey: "s", subject: "mailto:a@b.it" });
  });
  it("senza VAPID_SUBJECT usa il sito, se è https", () => {
    expect(pushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", NEXT_PUBLIC_SITE_URL: "https://lega.example/" })?.subject).toBe("https://lega.example");
    expect(pushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBeNull();
  });
  it("senza chiavi le notifiche sono spente", () => {
    expect(pushConfig({})).toBeNull();
    expect(pushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_SUBJECT: "mailto:a@b.it" })).toBeNull();
    expect(pushConfig({ VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "mailto:a@b.it" })).toBeNull();
  });
});

describe("announcePush", () => {
  it("senza chiavi non chiama nemmeno il database", async () => {
    const { db, rpc } = fakeDb({});
    expect(await announcePush(db, "segreto", null, null)).toEqual({ skipped: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("prende gli eventi col segreto del job e avvisa i dispositivi dell'altra squadra", async () => {
    const { db, rpc } = fakeDb({ push_claim: { data: claimData } });
    const send = vi.fn<PushSender>(async () => ({ ok: true }));
    const res = await announcePush(db, "segreto-del-job-123", CFG, send, () => NOW);
    expect(rpc).toHaveBeenCalledWith("push_claim", { p_secret: "segreto-del-job-123", p_max_age_hours: PUSH_MAX_AGE_HOURS });
    expect(res).toEqual({ skipped: false, events: 1, sent: 2, pruned: 0, errors: [] });
    expect(send.mock.calls.map(([t]) => t.endpoint).sort()).toEqual(["https://push.example/b1", "https://push.example/b2"]);
    expect(send.mock.calls[0][1]).toMatchObject({ title: "Nuova proposta di scambio", tag: "trade-7", url: "/scambio?vista=proposte" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("toglie le iscrizioni scadute e non le segnala come errori", async () => {
    const { db, rpc } = fakeDb({ push_claim: { data: claimData }, push_prune: { data: 1 } });
    const send: PushSender = async (t) => (t.endpoint.endsWith("b1") ? { ok: false, gone: true, error: "HTTP 410" } : { ok: true });
    const res = await announcePush(db, "segreto-del-job-123", CFG, send, () => NOW);
    expect(res).toEqual({ skipped: false, events: 1, sent: 1, pruned: 1, errors: [] });
    expect(rpc).toHaveBeenCalledWith("push_prune", { p_secret: "segreto-del-job-123", p_endpoints: ["https://push.example/b1"] });
  });

  it("un errore del servizio di notifica va nei log senza indirizzo né chiavi", async () => {
    const { db } = fakeDb({ push_claim: { data: claimData } });
    const send: PushSender = async () => ({ ok: false, gone: false, error: "HTTP 503" });
    const res = await announcePush(db, "segreto-del-job-123", CFG, send, () => NOW);
    expect(res).toMatchObject({ skipped: false, sent: 0, errors: ["avviso non consegnato (HTTP 503)", "avviso non consegnato (HTTP 503)"] });
    expect(JSON.stringify(res)).not.toContain("push.example");
  });

  it("se la presa fallisce lo dice e non spedisce niente", async () => {
    const { db } = fakeDb({ push_claim: { error: { message: "FORBIDDEN: segreto del job non valido" } } });
    const send = vi.fn<PushSender>();
    const res = await announcePush(db, null, CFG, send, () => NOW);
    expect(res).toEqual({ skipped: false, events: 0, sent: 0, pruned: 0, errors: ["FORBIDDEN: segreto del job non valido"] });
    expect(send).not.toHaveBeenCalled();
  });

  it("senza eventi non spedisce e non toglie nulla", async () => {
    const { db, rpc } = fakeDb({ push_claim: { data: { events: [], subs: [] } } });
    const send = vi.fn<PushSender>();
    expect(await announcePush(db, null, CFG, send, () => NOW)).toEqual({ skipped: false, events: 0, sent: 0, pruned: 0, errors: [] });
    expect(send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("sendPushTest", () => {
  const own = { data: [{ endpoint: "https://push.example/me1", p256dh: "k", auth: "a" }, { endpoint: "https://push.example/me2", p256dh: "k", auth: "a" }] };

  it("senza chiavi sul server lo dice", async () => {
    const { db } = fakeDb({});
    expect(await sendPushTest(db, null, null)).toMatchObject({ ok: false, error: expect.stringContaining("non sono ancora attive") });
  });

  it("senza dispositivi chiede di attivarle", async () => {
    const { db } = fakeDb({}, { data: [] });
    expect(await sendPushTest(db, CFG, async () => ({ ok: true }))).toMatchObject({ ok: false, error: expect.stringContaining("attiva prima") });
  });

  it("manda l'avviso a tutti i dispositivi dell'utente", async () => {
    const { db } = fakeDb({}, own);
    const send = vi.fn<PushSender>(async () => ({ ok: true }));
    expect(await sendPushTest(db, CFG, send)).toEqual({ ok: true, sent: 2 });
    expect(send.mock.calls[0][1]).toMatchObject({ title: "Notifiche attive", url: "/account" });
  });

  it("toglie il dispositivo scaduto e riesce se un altro risponde", async () => {
    const { db, rpc } = fakeDb({}, own);
    const send: PushSender = async (t) => (t.endpoint.endsWith("me1") ? { ok: false, gone: true, error: "HTTP 404" } : { ok: true });
    expect(await sendPushTest(db, CFG, send)).toEqual({ ok: true, sent: 1 });
    expect(rpc).toHaveBeenCalledWith("push_unsubscribe", { p_endpoint: "https://push.example/me1" });
  });

  it("se nessuno accetta l'avviso lo dice", async () => {
    const { db } = fakeDb({}, own);
    expect(await sendPushTest(db, CFG, async () => ({ ok: false, gone: false, error: "HTTP 500" }))).toMatchObject({ ok: false });
  });
});

describe("webPushSender", () => {
  // Il vero scambio con un servizio di notifica (cifratura, VAPID, 410 → iscrizione tolta) è stato provato a mano contro un finto
  // servizio HTTPS; qui solo come si leggono gli errori.
  it("404 e 410 vuol dire iscrizione scaduta; gli altri errori no, e nel testo non c'è l'indirizzo", async () => {
    vi.resetModules();
    const sendNotification = vi.fn();
    vi.doMock("web-push", () => ({ default: { sendNotification } }));
    const { webPushSender: sender } = await import("./push");
    const send = sender(CFG);
    const target = { endpoint: "https://push.example/secret-endpoint", p256dh: "k", auth: "a" };
    const payload = { title: "t", body: "b", url: "/", tag: "x" };

    sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    expect(await send(target, payload)).toEqual({ ok: true });
    expect(sendNotification.mock.calls[0][0]).toEqual({ endpoint: target.endpoint, keys: { p256dh: "k", auth: "a" } });
    expect(sendNotification.mock.calls[0][1]).toBe(JSON.stringify(payload));
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ vapidDetails: { subject: CFG.subject, publicKey: "pub", privateKey: "priv" }, urgency: "high" });

    for (const statusCode of [404, 410]) {
      sendNotification.mockRejectedValueOnce(Object.assign(new Error(`risposta con ${target.endpoint}`), { statusCode }));
      expect(await send(target, payload)).toEqual({ ok: false, gone: true, error: `HTTP ${statusCode}` });
    }
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("x"), { statusCode: 503 }));
    expect(await send(target, payload)).toEqual({ ok: false, gone: false, error: "HTTP 503" });
    sendNotification.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await send(target, payload)).toEqual({ ok: false, gone: false, error: "TypeError" });
    vi.doUnmock("web-push");
  });
});
