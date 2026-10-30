import { describe, expect, it } from "vitest";
import { SourceFormatError } from "./dunkest";
import { addDays, dunkestDayUrl, dunkestRoundUrl, gameDaysToRead, gameRows, nbaToday, parseGames, seasonStartDay, summarizeGames, weekRows, weeksToRead, type GameLine } from "./dunkest-games";

// Riga come la dà /api/stats/table per un giorno (2026-10-29, Alexander-Walker): valori quasi tutti stringhe.
const row = (over: Record<string, unknown> = {}) => ({
  id: "575", gp: "1", first_name: "Nickeil", last_name: "Alexander-Walker", team_code: "ATL", position: "G", cr: "11.0", pdk: "28.4", min: "31.4",
  starter: "1", pts: "25.0", ast: "1.0", reb: "3.0", stl: "0.0", blk: "1.0", tov: "0.0", tpm_tot: 0, ...over,
});

describe("parseGames", () => {
  it("legge una partita", () => {
    const [g] = parseGames([row()], true);
    expect(g).toMatchObject({ dunkestId: 575, firstName: "Nickeil", teamCode: "ATL", pos: "G", gp: 1, pdk: 28.4, min: 31.4, starter: true, pts: 25, reb: 3, ast: 1, stl: 0, blk: 1, tov: 0 });
  });

  it("traduce il ruolo F in A (ali)", () => {
    expect(parseGames([row({ position: "F" })], true)[0].pos).toBe("A");
  });

  it("accetta la lista vuota: giorno senza partite", () => {
    expect(parseGames([], true)).toEqual([]);
  });

  it("rifiuta ciò che non è una lista, come la risposta di errore di Dunkest", () => {
    expect(() => parseGames({ error: "DB error" }, true)).toThrow(SourceFormatError);
  });

  it("rifiuta una riga senza id o con gp zero", () => {
    expect(() => parseGames([row({ id: "x" })], true)).toThrow(SourceFormatError);
    expect(() => parseGames([row({ gp: "0" })], true)).toThrow(SourceFormatError);
  });

  it("per un giorno rifiuta gp diverso da 1: sarebbe una media di due partite", () => {
    expect(() => parseGames([row({ gp: "2" })], true)).toThrow(/gp 2/);
    expect(parseGames([row({ gp: "2" })], false)[0].gp).toBe(2);
  });

  it("tiene una riga sola per giocatore", () => {
    expect(parseGames([row(), row({ pdk: "1.0" })], true)).toHaveLength(1);
  });
});

describe("url", () => {
  it("giorno: stesso endpoint delle medie, con la data come intervallo", () => {
    const u = dunkestDayUrl(29, "2026-10-29");
    expect(u).toContain("season_id=29&mode=nba&stats_type=avg&date_from=2026-10-29&date_to=2026-10-29");
    expect(u).toContain("positions[]=3");
  });

  it("round: un round solo per richiesta", () => {
    expect(dunkestRoundUrl(29, 4, 2)).toContain("mode=dunkest&stats_type=tot&weeks[]=4&rounds[]=2&");
  });
});

describe("date", () => {
  it("addDays attraversa il mese", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-31", -2)).toBe("2026-10-29");
  });

  it("nbaToday usa il fuso americano: alle 9:00 italiane è ancora il giorno prima dopo mezzanotte ET", () => {
    expect(nbaToday(new Date("2026-10-30T08:00:00Z"))).toBe("2026-10-30");
    expect(nbaToday(new Date("2026-10-31T02:00:00Z"))).toBe("2026-10-30"); // 22:00 a New York
  });

  it("seasonStartDay segue l'anno della stagione", () => {
    expect(seasonStartDay(2026)).toBe("2026-10-15");
  });
});

describe("gameDaysToRead", () => {
  const start = "2026-10-15";
  it("senza dati parte dall'inizio della stagione", () => {
    expect(gameDaysToRead(null, "2026-10-17", start)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"]);
  });

  it("con dati riparte da due giorni prima dell'ultimo, fino a oggi", () => {
    expect(gameDaysToRead("2026-10-29", "2026-10-30", start)).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  });

  it("non va prima dell'inizio della stagione", () => {
    expect(gameDaysToRead("2026-10-15", "2026-10-16", start)).toEqual(["2026-10-15", "2026-10-16"]);
  });

  it("oltre il massimo prende i più vecchi: il recupero avanza a ogni giro", () => {
    expect(gameDaysToRead(null, "2026-11-30", start, 3)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"]);
  });

  it("niente giorni se l'ultimo salvato è nel futuro rispetto a oggi", () => {
    expect(gameDaysToRead("2026-11-10", "2026-10-30", start)).toEqual([]);
  });
});

describe("weeksToRead", () => {
  it("senza giornate con punti non legge niente", () => {
    expect(weeksToRead(null, [])).toEqual([]);
  });

  it("a regime: la giornata in corso e la precedente", () => {
    expect(weeksToRead(4, [1, 2, 3])).toEqual([3, 4]);
  });

  it("primo giro: le più vecchie per prime, la giornata in corso c'è sempre", () => {
    expect(weeksToRead(4, [])).toEqual([1, 2, 4]);
    expect(weeksToRead(4, [1, 2])).toEqual([3, 4]);
  });

  it("prima giornata", () => {
    expect(weeksToRead(1, [])).toEqual([1]);
  });
});

describe("weekRows", () => {
  const g = (id: number, pdk: number, over = {}) => parseGames([row({ id: String(id), pdk: String(pdk), ...over })], true)[0];

  it("somma i round dello stesso giocatore", () => {
    const [w] = weekRows([[g(1, 40.5, { pts: "30.0" })], [g(1, 12.25, { pts: "10.0" })]]);
    expect(w).toMatchObject({ dunkest_id: 1, gp: 2, pdk: 52.75, pts: 40 });
  });

  it("tiene separati i giocatori e prende la squadra dell'ultimo round", () => {
    const rows = weekRows([[g(1, 10), g(2, 20)], [g(1, 5, { team_code: "BOS" })]]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.dunkest_id === 1)).toMatchObject({ gp: 2, pdk: 15, team_code: "BOS" });
  });
});

describe("gameRows", () => {
  it("mette il nome intero e la data", () => {
    const [r] = gameRows("2026-10-29", parseGames([row()], true));
    expect(r).toMatchObject({ dunkest_id: 575, game_date: "2026-10-29", name: "Nickeil Alexander-Walker", team_code: "ATL", pdk: 28.4 });
  });
});

describe("summarizeGames", () => {
  const line = (pdk: number, i = 0): GameLine => ({ date: `2026-10-${20 + i}`, pdk, min: 30, starter: true, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 });

  it("nessuna partita", () => {
    expect(summarizeGames([])).toBeNull();
  });

  it("media, migliore e andamento sulle ultime 5", () => {
    const s = summarizeGames([10, 10, 10, 10, 10, 20, 20, 20, 20, 20].map(line))!;
    expect(s).toMatchObject({ games: 10, avg: 15, last5: 20, trend: 5 });
    expect(s.best.pdk).toBe(20);
  });

  it("con meno di 5 partite l'andamento è zero", () => {
    expect(summarizeGames([12, 18].map(line))).toMatchObject({ avg: 15, last5: 15, trend: 0 });
  });
});
