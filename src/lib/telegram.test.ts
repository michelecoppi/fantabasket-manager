import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceOne, announceTrades, sendTelegramPhoto, type CardRenderer } from "./telegram";
import { parseAnnouncements } from "./trade-announce";

const CFG = { token: "123:SECRET", chatId: "-100200" };
const raw = (id: number) => ({
  id,
  created_at: "2026-10-29T20:00:00Z",
  cap_override_reason: null,
  teams: [
    { id: "a", name: "Bol Bollerz", season_trades: 2, color_index: 1 },
    { id: "b", name: "Spaccinos", season_trades: 2, color_index: 4 },
  ],
  moves: [
    { kind: "contract", id: 1, from: "a", to: "b", name: "Jalen Brunson", pos: "G", salary: 20 },
    { kind: "contract", id: 2, from: "b", to: "a", name: "Ausar Thompson", pos: "A", salary: 3.5 },
  ],
});
const trade = () => parseAnnouncements([raw(7)])[0];

const render: CardRenderer = async () => new Uint8Array([137, 80, 78, 71]).buffer;
const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const rejected = (description = "Bad Request: wrong file") => new Response(JSON.stringify({ ok: false, description }), { status: 400 });
const timeout = () => new DOMException("timeout", "TimeoutError");

let calls: { url: string; body: unknown }[];
const stubFetch = (...answers: (Response | Error)[]) => {
  calls = [];
  const queue = [...answers];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: unknown }) => {
      calls.push({ url, body: init?.body });
      const next = queue.shift() ?? okResponse();
      if (next instanceof Error) throw next;
      return next;
    }),
  );
};
const method = (c: { url: string }) => c.url.split("/").pop();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendTelegramPhoto", () => {
  it("manda la foto come multipart con didascalia HTML", async () => {
    stubFetch(okResponse());
    const res = await sendTelegramPhoto(CFG, new Uint8Array([1, 2, 3]).buffer, "<b>Ciao</b>", "scambio-7.png");
    expect(res).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:SECRET/sendPhoto");
    const form = calls[0].body as FormData;
    expect(form.get("chat_id")).toBe("-100200");
    expect(form.get("caption")).toBe("<b>Ciao</b>");
    expect(form.get("parse_mode")).toBe("HTML");
    const photo = form.get("photo") as File;
    expect(photo.name).toBe("scambio-7.png");
    expect(photo.type).toBe("image/png");
    expect(photo.size).toBe(3);
  });

  it("distingue il rifiuto di Telegram dalla rete che non risponde, senza mai mostrare il token", async () => {
    stubFetch(rejected());
    expect(await sendTelegramPhoto(CFG, new ArrayBuffer(1), "x", "a.png")).toEqual({ ok: false, error: "Telegram ha risposto HTTP 400: Bad Request: wrong file", rejected: true });
    stubFetch(timeout());
    const res = await sendTelegramPhoto(CFG, new ArrayBuffer(1), "x", "a.png");
    expect(res).toMatchObject({ ok: false, rejected: false });
    expect(JSON.stringify(res)).not.toContain("SECRET");
  });
});

describe("announceOne", () => {
  it("di solito basta un messaggio: la foto con la didascalia", async () => {
    stubFetch(okResponse());
    expect(await announceOne(CFG, trade(), "https://lega.example", render)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(method(calls[0])).toBe("sendPhoto");
    expect((calls[0].body as FormData).get("caption")).toContain("<b>Bol Bollerz</b> ⇄ <b>Spaccinos</b>");
  });

  it("se Telegram rifiuta la foto ripiega sul testo con l'elenco completo", async () => {
    stubFetch(rejected(), okResponse());
    expect(await announceOne(CFG, trade(), undefined, render)).toEqual({ ok: true });
    expect(calls.map(method)).toEqual(["sendPhoto", "sendMessage"]);
    expect(JSON.parse(calls[1].body as string).text).toContain("Jalen Brunson");
  });

  it("se la card non si disegna manda il testo", async () => {
    stubFetch(okResponse());
    const res = await announceOne(CFG, trade(), undefined, async () => {
      throw new Error("font mancante");
    });
    expect(res).toEqual({ ok: true });
    expect(calls.map(method)).toEqual(["sendMessage"]);
  });

  it("se la foto non risponde non manda il testo: potrebbe essere già arrivata, e si riprova al giro dopo", async () => {
    stubFetch(timeout());
    const res = await announceOne(CFG, trade(), undefined, render);
    expect(res).toMatchObject({ ok: false, rejected: false });
    expect(calls).toHaveLength(1);
  });
});

describe("announceTrades", () => {
  const db = (claim: unknown) => {
    const rpc = vi.fn(async (name: string, args?: unknown) => (args !== null && name === "trade_announce_claim" ? { data: claim, error: null } : { data: true, error: null }));
    return { rpc } as unknown as Parameters<typeof announceTrades>[0] & { rpc: typeof rpc };
  };

  it("senza token e canale non fa nulla e non prende niente dalla coda", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    const d = db([]);
    expect(await announceTrades(d, null, render)).toEqual({ skipped: true });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("annuncia ogni scambio della coda e segna l'esito", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:SECRET");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100200");
    stubFetch(okResponse(), timeout());
    const d = db([raw(7), raw(8)]);
    const res = await announceTrades(d, "segreto", render);
    expect(res).toMatchObject({ skipped: false, sent: 1 });
    expect((res as { errors: string[] }).errors).toEqual(["scambio n. 8: Telegram non risponde (TimeoutError)"]);
    const done = d.rpc.mock.calls.filter(([name]) => name === "trade_announce_done").map(([, args]) => args);
    expect(done).toEqual([
      { p_secret: "segreto", p_id: 7, p_ok: true },
      { p_secret: "segreto", p_id: 8, p_ok: false },
    ]);
  });
});
