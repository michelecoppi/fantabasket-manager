import { describe, expect, it } from "vitest";
import {
  announcementText,
  CLOSINGS,
  escapeHtml,
  HEADLINES,
  JOKE_VARS,
  JOKES,
  parseAnnouncements,
  TELEGRAM_MAX_LENGTH,
  tradeJokes,
  type AnnouncedTrade,
  type JokeKind,
} from "./trade-announce";

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

  it("battute: infortunato rifilato, rapina sul PDK, stella, rookie, contratto lungo, fantasma", () => {
    const t = one({
      moves: [
        { kind: "contract", id: 1, from: "a", to: "b", name: "Big Star", salary: 40, pdk: 20, gp: 9, injury: "Ginocchio" },
        { kind: "contract", id: 2, from: "b", to: "a", name: "Giovane", salary: 4, pdk: 38, gp: 0, rookie: true, years_left: 3 },
      ],
    });
    const jokes = tradeJokes(t);
    expect(jokes.map((j) => j.kind)).toEqual(["injured", "heist", "dump", "star", "rookie", "longContract", "ghost"]);
    expect(jokes[0].vars).toEqual({ X: "Bol Bollerz", Y: "Spaccinos", P: "Big Star" });
    expect(jokes[1].vars).toEqual({ W: "Bol Bollerz", L: "Spaccinos", d: "18" });
    expect(jokes.find((j) => j.kind === "longContract")?.vars).toEqual({ Y: "Bol Bollerz", P: "Giovane", n: "3" });
    expect(announcementText(t)).toContain("• Big Star <i>(40 cr · 🚑)</i>");
    // senza il PDK di tutti i giocatori niente rapina
    expect(tradeJokes(one({ moves: [{ ...row().moves[0], pdk: 40 }, row().moves[1]] })).map((j) => j.kind)).not.toContain("heist");
  });

  // 7.6: talenti come li restituisce trade_announce_claim dalla migrazione 20261030160000 (dati salvati nel payload più il collegato).
  const linked = { kind: "talent", id: 11, version: 1, from: "a", to: "b", label: "Cooper Flagg", draft_year: 2025, entry_credits: 9.5, player_id: 501, name: "Cooper Flagg", nba_team: "DAL" };
  const abroad = { kind: "talent", id: 12, version: 1, from: "b", to: "a", label: "Rogkavopoulos", draft_year: 2024, entry_credits: null, player_id: null };

  it("talenti: lettura, riga dell'annuncio, valore mancante", () => {
    const t = one({ moves: [linked, abroad] });
    expect(t.moves[0]).toMatchObject({ kind: "talent", id: 11, name: "Cooper Flagg", draftYear: 2025, entryCredits: 9.5, playerId: 501, nbaTeam: "DAL" });
    expect(t.moves[1]).toMatchObject({ kind: "talent", label: "Rogkavopoulos", draftYear: 2024, entryCredits: undefined, playerId: undefined });
    const text = announcementText(t);
    expect(text).toContain("➡️ <b>Spaccinos</b> riceve:\n• 🎓 Cooper Flagg <i>(diritti · draft 2025 · val. 9,5 · DAL)</i>");
    expect(text).toContain("➡️ <b>Bol Bollerz</b> riceve:\n• 🎓 Rogkavopoulos <i>(diritti · draft 2024 · val. ?)</i>");
  });

  it("talenti: solo futuri e non «solo pick», diritti e talento fuori dalla NBA", () => {
    const kinds = (moves: unknown[]) => tradeJokes(one({ moves })).map((j) => j.kind);
    expect(kinds([linked, abroad])).toEqual(["onlyFuture", "talentRights", "talentAbroad"]);
    expect(kinds([linked, { kind: "pick", id: 5, from: "b", to: "a" }])).toEqual(["onlyFuture", "talentRights"]);
    expect(kinds([{ kind: "pick", id: 5, from: "b", to: "a" }])).toEqual(["onlyPicks"]);
    // con un giocatore a contratto: niente «solo futuri»; il talento non entra in stipendi, PDK e trasloco
    const withPlayer = tradeJokes(one({ moves: [{ ...linked, from: "b", to: "a" }, { kind: "contract", id: 1, from: "a", to: "b", name: "X", salary: 4, pdk: 10, gp: 5 }] }));
    expect(withPlayer.map((j) => j.kind)).toEqual(["talentRights"]);
    expect(withPlayer[0].vars).toEqual({ X: "Spaccinos", Y: "Bol Bollerz", P: "Cooper Flagg" });
    expect(tradeJokes(one({ moves: [abroad] })).find((j) => j.kind === "talentAbroad")?.vars).toEqual({ Y: "Bol Bollerz", P: "Rogkavopoulos" });
  });

  it("talento senza nome né etichetta e talento infortunato", () => {
    const text = announcementText(one({ moves: [{ kind: "talent", id: 13, from: "a", to: "b", player_id: 7, injury: "Caviglia" }] }));
    expect(text).toContain("• 🎓 Un talento <i>(diritti · val. ? · 🚑)</i>");
  });

  it("annuncio entro il limite di Telegram anche per lo scambio più grande", () => {
    const teams = ["a", "b", "c", "d"].map((id, i) => ({ id, name: `Squadra con un nome lunghissimo ${i}`, season_trades: 1 }));
    const next = (id: string) => ["b", "c", "d", "a"][["a", "b", "c", "d"].indexOf(id)];
    const moves = teams.flatMap(({ id }, i) => [
      ...Array.from({ length: 19 }, (_, k) => ({ kind: "contract", id: i * 100 + k, from: id, to: next(id), name: `Giocatore dal nome lungo ${i}-${k}`, pos: "G", salary: 12.5, injury: "Ginocchio" })),
      ...Array.from({ length: 12 }, (_, k) => ({ ...linked, id: i * 100 + 40 + k, from: id, to: next(id), name: `Talento dal nome lungo ${i}-${k}` })),
      ...Array.from({ length: 15 }, (_, k) => ({ kind: "pick", id: i * 100 + 60 + k, from: id, to: next(id), year: 2027, round: 1, original_team: `Squadra ${i}` })),
    ]);
    const big = one({ teams, moves, cap_override_reason: "x".repeat(1000) });
    const text = announcementText(big, "https://lega.example");
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
    expect(text).toContain("• …e altri 40");
    expect(text).toContain("Storico scambi");
    // uno scambio medio resta con tutti i dettagli
    const medium = one({ moves: [...row().moves, linked, abroad, { kind: "pick", id: 5, from: "b", to: "a", year: 2027, round: 1 }] });
    expect(announcementText(medium)).toContain("(diritti · draft 2025");
    expect(announcementText(medium)).not.toContain("…e altri");
  });

  it("scambio a tre: numeri della battuta", () => {
    const t = one({ teams: [...row().teams, { id: "c", name: "OKCC", season_trades: 1 }] });
    expect(tradeJokes(t).find((j) => j.kind === "multi")?.vars).toEqual({ n: 3, m: 2 });
  });

  it("ogni frase usa solo i segnaposto del suo gruppo, senza doppioni", () => {
    for (const kind of Object.keys(JOKES) as JokeKind[]) {
      const pool: readonly string[] = JOKES[kind];
      expect(new Set(pool).size).toBe(pool.length);
      for (const text of pool) {
        for (const [, v] of text.matchAll(/\{(\w+)\}/g)) expect(JOKE_VARS[kind], `${kind}: ${text}`).toContain(v);
      }
    }
    expect(new Set(HEADLINES).size).toBe(HEADLINES.length);
    expect(new Set(CLOSINGS).size).toBe(CLOSINGS.length);
  });

  it("titolo e chiusura variano tra gli scambi", () => {
    const first = (id: number) => announcementText({ ...one(), id }).split("\n")[0];
    expect((HEADLINES as readonly string[]).map((h) => `<b>${escapeHtml(h)}</b>`)).toContain(first(1));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(first)).size).toBeGreaterThan(2);
    const text = announcementText(one(), "https://lega.example");
    const closing = text.split("\n").at(-2);
    expect((CLOSINGS as readonly string[]).map((c) => `<i>${escapeHtml(c)}</i>`)).toContain(closing);
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
