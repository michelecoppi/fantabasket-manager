import { describe, expect, it } from "vitest";
import { announcementCaption, escapeHtml, fillJoke, parseAnnouncements, TELEGRAM_CAPTION_MAX, tradeJokes } from "./trade-announce";

// Come la restituisce trade_announce_claim (migrazioni 20261029210000 e 20261030180000).
const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  created_at: "2026-10-29T20:00:00Z",
  cap_override_reason: null,
  teams: [
    { id: "a", name: "Bol Bollerz", season_trades: 2 },
    { id: "b", name: "Spaccinos", season_trades: 2 },
  ],
  moves: [
    { kind: "contract", id: 1, from: "a", to: "b", name: "Jalen Brunson", pos: "G", salary: 20 },
    { kind: "contract", id: 2, from: "b", to: "a", slot: "reserve", name: "Ausar Thompson", pos: "A", salary: 3.5 },
  ],
  ...over,
});
const one = (over: Record<string, unknown> = {}) => parseAnnouncements([row(over)])[0];

describe("didascalia della card su Telegram", () => {
  it("ha titolo, squadre, battute e link, ma non l'elenco (sta nell'immagine)", () => {
    const text = announcementCaption(one({ cap_override_reason: "ok del moderatore" }), [], "https://lega.example/");
    expect(text).toContain("<b>Bol Bollerz</b> ⇄ <b>Spaccinos</b>");
    expect(text).toContain("😏");
    expect(text).toContain('<a href="https://lega.example/storico-scambi">Storico scambi</a>');
    expect(text).not.toContain("Jalen Brunson");
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_CAPTION_MAX);
  });

  it("non ripete la battuta già scritta sulla card", () => {
    const t = one({ cap_override_reason: "ok del moderatore" });
    const [first, second] = tradeJokes(t);
    expect(announcementCaption(t)).not.toContain(escapeHtml(fillJoke(t, first)));
    expect(announcementCaption(t)).toContain(escapeHtml(fillJoke(t, second)));
  });

  it("elenca ciò che nella card non entra", () => {
    const text = announcementCaption(one(), [{ team: "Spaccinos", labels: ["Pick 2027 · 2° giro", "Cam Thomas"] }]);
    expect(text).toContain("➕ <b>Spaccinos</b> riceve anche: Pick 2027 · 2° giro, Cam Thomas");
  });

  it("segnala l'eccezione al cap e protegge l'HTML", () => {
    const text = announcementCaption(one({ cap_override_reason: "ok <b>del</b> moderatore" }));
    expect(text).toContain("⚖️ Eccezione al cap: <i>ok &lt;b&gt;del&lt;/b&gt; moderatore</i>");
  });

  it("sta sempre nei 1024 caratteri, anche con una motivazione lunghissima e molti extra", () => {
    for (let id = 1; id <= 60; id++) {
      const t = one({ id, cap_override_reason: "x".repeat(900) });
      const extras = [{ team: "Bol Bollerz", labels: Array.from({ length: 12 }, (_, i) => `Giocatore Numero ${i}`) }];
      expect(announcementCaption(t, extras, "https://lega.example").length).toBeLessThanOrEqual(TELEGRAM_CAPTION_MAX);
    }
  });

  it("è sempre la stessa per lo stesso scambio", () => {
    expect(announcementCaption(one())).toBe(announcementCaption(one()));
  });

  it("legge l'indice del colore della squadra, se la RPC lo dà", () => {
    const t = one({ teams: [{ id: "a", name: "A", season_trades: 1, color_index: 3 }, { id: "b", name: "B", season_trades: 1 }] });
    expect(t.teams.map((x) => x.colorIndex)).toEqual([3, undefined]);
  });
});
