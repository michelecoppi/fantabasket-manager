import { describe, expect, it } from "vitest";
import { announcementText, escapeHtml, parseAnnouncements, tradeJokes, type AnnouncedTrade } from "./trade-announce";

// Come la restituisce trade_announce_claim (migrazione 20261029210000).
const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  created_at: "2026-10-29T20:00:00Z",
  cap_override_reason: null,
  teams: [
    { id: "a", name: "Bol Bollerz", season_trades: 2 },
    { id: "b", name: "Spaccinos", season_trades: 2 },
  ],
  moves: [
    { kind: "contract", id: 1, version: 1, from: "a", to: "b", label: "Vecchio nome", name: "Jalen Brunson", pos: "G", salary: 20 },
    { kind: "contract", id: 2, version: 1, from: "b", to: "a", slot: "reserve", name: "Ausar Thompson", pos: "A", salary: 3.5 },
  ],
  ...over,
});
const one = (over: Record<string, unknown> = {}) => parseAnnouncements([row(over)])[0];

describe("annuncio Telegram degli scambi (Fase 7.5)", () => {
  it("legge la risposta della RPC", () => {
    const t = one();
    expect(t.teams).toEqual([
      { id: "a", name: "Bol Bollerz", seasonTrades: 2 },
      { id: "b", name: "Spaccinos", seasonTrades: 2 },
    ]);
    expect(t.moves[0]).toMatchObject({ kind: "contract", id: 1, from: "a", to: "b", name: "Jalen Brunson", pos: "G", salary: 20 });
    expect(t.moves[1].slot).toBe("reserve");
  });

  it("scarta scambi senza squadre o movimenti e movimenti verso squadre estranee", () => {
    expect(parseAnnouncements(null)).toEqual([]);
    expect(parseAnnouncements([row({ teams: [{ id: "a", name: "X" }] })])).toEqual([]);
    expect(parseAnnouncements([row({ moves: [] })])).toEqual([]);
    const t = one({ moves: [...row().moves, { kind: "pick", id: 9, from: "a", to: "zz" }] });
    expect(t.moves).toHaveLength(2);
  });

  it("messaggio: squadre, chi riceve cosa, slot di arrivo, link allo storico", () => {
    const text = announcementText(one(), "https://lega.example/");
    expect(text).toContain("<b>Bol Bollerz</b> ⇄ <b>Spaccinos</b>");
    expect(text).toContain("➡️ <b>Spaccinos</b> riceve:\n• Jalen Brunson <i>(G · 20 cr)</i>");
    expect(text).toContain("• Ausar Thompson <i>(A · 3,5 cr · riserva)</i>");
    expect(text).toContain('<a href="https://lega.example/storico-scambi">Storico scambi</a>');
    expect(announcementText(one())).not.toContain("<a href");
  });

  it("protegge l'HTML dei nomi", () => {
    expect(escapeHtml("A&B <C>")).toBe("A&amp;B &lt;C&gt;");
    const text = announcementText(one({ teams: [{ id: "a", name: "<Bad> & Co" }, { id: "b", name: "Spaccinos" }] }));
    expect(text).toContain("<b>&lt;Bad&gt; &amp; Co</b>");
    expect(text).not.toContain("<Bad>");
  });

  it("pick, giocatori senza dati e squadra che non riceve niente", () => {
    const t = one({
      moves: [
        { kind: "pick", id: 5, from: "a", to: "b", year: 2027, round: 1, original_team: "OKCC" },
        { kind: "contract", id: 3, from: "a", to: "b", label: "Tagliato poi" },
      ],
    });
    const text = announcementText(t);
    expect(text).toContain("• Pick 2027 · 1° giro (OKCC)");
    expect(text).toContain("• Tagliato poi\n");
    expect(text).toContain("➡️ <b>Bol Bollerz</b> riceve:\n• niente");
  });

  it("scambio a tre: da chi arriva ogni pezzo", () => {
    const t = one({
      teams: [...row().teams, { id: "c", name: "OKCC", season_trades: 1 }],
      moves: [...row().moves, { kind: "contract", id: 4, from: "c", to: "a", name: "Chet", pos: "C", salary: 10 }],
    });
    expect(announcementText(t)).toContain("• Chet <i>(C · 10 cr)</i> · da OKCC");
    expect(tradeJokes(t).map((j) => j.kind)).toContain("multi");
  });

  it("eccezione al cap: motivo e battuta", () => {
    const t = one({ cap_override_reason: "Infortunio lungo" });
    expect(announcementText(t)).toContain("⚖️ Eccezione al cap: <i>Infortunio lungo</i>");
    expect(tradeJokes(t)[0].kind).toBe("capOverride");
  });

  it("battute: scarico di stipendio con i nomi giusti", () => {
    const [j] = tradeJokes(one());
    expect(j.kind).toBe("dump");
    expect(j.vars).toEqual({ X: "Bol Bollerz", Y: "Spaccinos", n: "16,5" });
  });

  it("battute: seriale, pick, solo pick, trasloco, figurine, primo scambio, generica", () => {
    const kinds = (over: Record<string, unknown>) => tradeJokes(one(over)).map((j) => j.kind);
    const even = [
      { kind: "contract", id: 1, from: "a", to: "b", salary: 10 },
      { kind: "contract", id: 2, from: "b", to: "a", salary: 10.5 },
    ];
    expect(kinds({ teams: [{ id: "a", name: "A", season_trades: 4 }, { id: "b", name: "B", season_trades: 1 }], moves: even })).toEqual(["serial", "oneForOne"]);
    expect(kinds({ moves: [...even, { kind: "pick", id: 5, from: "b", to: "a" }] })).toEqual(["picks"]);
    expect(kinds({ moves: [{ kind: "pick", id: 5, from: "b", to: "a" }] })).toEqual(["onlyPicks"]);
    const swap = [1, 2, 3, 4, 5].map((id) => ({ kind: "contract", id, from: id % 2 ? "a" : "b", to: id % 2 ? "b" : "a", salary: 4 }));
    expect(kinds({ moves: swap })).toContain("bigSwap");
    const uneven = [
      { kind: "contract", id: 1, from: "a", to: "b", salary: 10 },
      { kind: "contract", id: 2, from: "b", to: "a", salary: 14 },
    ];
    expect(kinds({ teams: [{ id: "a", name: "A", season_trades: 1 }, { id: "b", name: "B", season_trades: 2 }], moves: uneven })).toEqual(["firstTrade"]);
    expect(kinds({ moves: uneven })).toEqual(["generic"]);
  });

  it("al massimo due battute, sempre le stesse per lo stesso scambio", () => {
    const t: AnnouncedTrade = one({ cap_override_reason: "x", teams: [{ id: "a", name: "A", season_trades: 5 }, { id: "b", name: "B", season_trades: 5 }] });
    const jokes = (s: string) => s.split("\n").filter((l) => l.startsWith("😏"));
    expect(tradeJokes(t).length).toBeGreaterThan(2);
    expect(jokes(announcementText(t))).toHaveLength(2);
    expect(announcementText(t)).toBe(announcementText(t));
    expect(jokes(announcementText(t)).every((l) => !/\{\w\}/.test(l))).toBe(true);
    // scambi diversi pescano battute diverse dallo stesso gruppo
    const texts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => jokes(announcementText({ ...t, id }))[0]));
    expect(texts.size).toBeGreaterThan(1);
  });
});
