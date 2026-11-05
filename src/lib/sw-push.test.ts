import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/*
 * `public/sw.js` carica in una sandbox con un `self` finto: si controllano i gestori delle notifiche push (avviso mostrato, click
 * che apre solo pagine del sito). La prova nel browser vero (Chromium, avviso consegnato con CDP) si fa a mano, vedi PLAN.md.
 */
const SW = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://lega.example";

interface FakeClient {
  focus: () => Promise<FakeClient>;
  navigate?: (url: string) => Promise<unknown>;
}

function load(clients: FakeClient[] = []) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (e: unknown) => void) => (handlers[type] = handler),
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: { matchAll: async () => clients, openWindow: async (url: string) => void opened.push(url) },
  };
  runInNewContext(SW, { self, URL });
  /** Lancia un evento e aspetta ciò che il gestore ha passato a `waitUntil`. */
  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { fire, shown, opened };
}

const pushData = (payload: unknown) => ({ json: () => payload, text: () => String(payload) });

describe("service worker: push", () => {
  it("mostra l'avviso con titolo, testo, tag e pagina da aprire", async () => {
    const sw = load();
    await sw.fire("push", { data: pushData({ title: "Nuova proposta di scambio", body: "Bol Bollerz ti propone uno scambio.", url: "/scambio?vista=proposte", tag: "trade-7" }) });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("Nuova proposta di scambio");
    expect(sw.shown[0].options).toMatchObject({ body: "Bol Bollerz ti propone uno scambio.", tag: "trade-7", renotify: true, icon: "/icon-192.png", data: { url: "/scambio?vista=proposte" } });
  });

  it("senza tag non rinnova; senza titolo usa il nome dell'app", async () => {
    const sw = load();
    await sw.fire("push", { data: pushData({ body: "Ciao" }) });
    expect(sw.shown[0].title).toBe("Fantabasket");
    expect(sw.shown[0].options).toMatchObject({ body: "Ciao", renotify: false, data: { url: "/" } });
  });

  it("un payload che non è JSON mostra comunque un avviso", async () => {
    const sw = load();
    await sw.fire("push", {
      data: {
        json: () => {
          throw new SyntaxError("no");
        },
        text: () => "testo semplice",
      },
    });
    expect(sw.shown[0]).toMatchObject({ title: "Fantabasket", options: { body: "testo semplice" } });
  });

  it("un push senza dati mostra un avviso vuoto ma valido", async () => {
    const sw = load();
    await sw.fire("push", {});
    expect(sw.shown).toHaveLength(1);
  });
});

describe("service worker: click sull'avviso", () => {
  const click = (url: unknown) => ({ notification: { close: () => {}, data: { url } } });

  it("senza finestre aperte ne apre una sulla pagina dell'avviso", async () => {
    const sw = load([]);
    await sw.fire("notificationclick", click("/scambio?vista=proposte"));
    expect(sw.opened).toEqual([`${ORIGIN}/scambio?vista=proposte`]);
  });

  it("con una finestra aperta la porta in primo piano e la sposta sulla pagina", async () => {
    const calls: string[] = [];
    const client: FakeClient = {
      focus: async () => (calls.push("focus"), client),
      navigate: async (url) => calls.push(`navigate ${url}`),
    };
    const sw = load([client]);
    await sw.fire("notificationclick", click("/admin/scambio"));
    expect(calls).toEqual(["focus", `navigate ${ORIGIN}/admin/scambio`]);
    expect(sw.opened).toEqual([]);
  });

  it("un indirizzo di un altro sito ripiega sulla home", async () => {
    const sw = load([]);
    await sw.fire("notificationclick", click("https://altro.example/truffa"));
    expect(sw.opened).toEqual([`${ORIGIN}/`]);
  });

  it("senza indirizzo o con un indirizzo non valido apre la home", async () => {
    const a = load([]);
    await a.fire("notificationclick", { notification: { close: () => {}, data: undefined } });
    expect(a.opened).toEqual([`${ORIGIN}/`]);
    const b = load([]);
    await b.fire("notificationclick", click("http://[::1"));
    expect(b.opened).toEqual([`${ORIGIN}/`]);
  });
});
