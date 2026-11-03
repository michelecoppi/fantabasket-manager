import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SourceFormatError } from "./dunkest";
import {
  buildRoundsPayload,
  countdownParts,
  countdownText,
  dayTiming,
  followingDay,
  nextRound,
  parseScheduleConfig,
  parseScheduleMatchday,
  roundDaysToRead,
  type KnownRoundDay,
  type RoundInfo,
} from "./dunkest-rounds";

// Risposte vere del calendario NBA di Fantaking (2026-11-03): giornata 5 giocata, 6 da giocare, 19 senza partite.
const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "dunkest-schedule.json"), "utf8"));

describe("parseScheduleConfig", () => {
  it("legge il calendario della stagione e le giornate", () => {
    const c = parseScheduleConfig(fx.config);
    expect(c.scheduleId).toBe(57);
    expect(c.matchdayIds.slice(0, 3)).toEqual([1858, 1859, 1860]);
  });
  it("si ferma se manca il calendario", () => {
    expect(() => parseScheduleConfig({ data: { matchdays: [] } })).toThrow(SourceFormatError);
    expect(() => parseScheduleConfig({ data: { current_schedule_id: 57 } })).toThrow(SourceFormatError);
  });
});

describe("parseScheduleMatchday", () => {
  it("giornata giocata: tre round con inizio, fine e partite giocate", () => {
    const r = parseScheduleMatchday(fx.matchdays["1862"], 1862);
    expect(r.map((x) => [x.round, x.games, x.played])).toEqual([
      [1, 7, 7],
      [2, 4, 4],
      [3, 8, 8],
    ]);
    expect(r[0].startsAt).toBe("2026-10-31T19:00:00.000Z");
    expect(r[0].endsAt).toBe("2026-11-01T00:30:00.000Z");
    expect(r[0].dunkestRoundId).toBe(2901);
  });
  it("giornata da giocare: round con zero partite giocate", () => {
    const r = parseScheduleMatchday(fx.matchdays["1863"], 1863);
    expect(r.map((x) => [x.round, x.games, x.played])).toEqual([
      [1, 14, 0],
      [2, 2, 0],
    ]);
    expect(r[0].startsAt).toBe("2026-11-05T00:00:00.000Z");
  });
  it("giornata senza partite: nessun round", () => {
    expect(parseScheduleMatchday(fx.matchdays["1876"], 1876)).toEqual([]);
  });
  it("si ferma se la risposta è di un'altra giornata o ha una partita senza orario", () => {
    expect(() => parseScheduleMatchday(fx.matchdays["1862"], 1863)).toThrow(SourceFormatError);
    const broken = { data: { id: 1, rounds: [{ id: 9, number: 1, matches: [{ status: "played", started_at: null }] }] } };
    expect(() => parseScheduleMatchday(broken, 1)).toThrow(SourceFormatError);
  });
});

describe("roundDaysToRead", () => {
  const now = new Date("2026-11-03T08:00:00Z");
  const day = (matchday: number, rounds: number, completed: number): KnownRoundDay => ({ dunkestMatchdayId: 1857 + matchday, matchday, rounds, completed });
  const known = [day(1, 3, 3), day(2, 2, 2), day(3, 3, 3), day(4, 3, 3), day(5, 3, 3), day(6, 2, 0), day(7, 3, 0), day(8, 2, 0), day(9, 3, 0), day(19, 0, 0)];

  it("tutto se non c'è niente o la lettura completa è vecchia", () => {
    expect(roundDaysToRead([], null, now).full).toBe(true);
    expect(roundDaysToRead(known, null, now).full).toBe(true);
    expect(roundDaysToRead(known, "2026-10-26T08:00:00Z", now).full).toBe(true);
  });
  it("altrimenti la prima non finita, quella prima e le due dopo", () => {
    const plan = roundDaysToRead(known, "2026-11-01T08:00:00Z", now);
    expect(plan.full).toBe(false);
    expect(plan.days.map((d) => d.matchday)).toEqual([5, 6, 7, 8]);
  });
  it("a stagione finita solo l'ultima giornata con round", () => {
    const done = known.map((d) => ({ ...d, completed: d.rounds }));
    expect(roundDaysToRead(done, "2026-11-01T08:00:00Z", now).days.map((d) => d.matchday)).toEqual([9]);
  });
});

describe("buildRoundsPayload", () => {
  it("una riga per round, con la giornata della lega", () => {
    const rounds = parseScheduleMatchday(fx.matchdays["1863"], 1863);
    const p = buildRoundsPayload(7, false, [
      { dunkestMatchdayId: 1863, matchday: 6, rounds },
      { dunkestMatchdayId: 1876, matchday: 19, rounds: [] },
    ]);
    expect(p.season_id).toBe(7);
    expect(p.matchdays[0]).toMatchObject({ dunkest_matchday_id: 1863, matchday: 6 });
    expect(p.matchdays[0].rounds[1]).toEqual({ round: 2, dunkest_round_id: 2905, starts_at: "2026-11-06T02:00:00.000Z", ends_at: "2026-11-06T03:00:00.000Z", games: 2, played: 0 });
    expect(p.matchdays[1].rounds).toEqual([]);
  });
});

describe("dayTiming e nextRound", () => {
  const r = (round: number, startsAt: string, games: number, played: number): RoundInfo => ({ round, startsAt, endsAt: startsAt, games, played });
  const g6 = [r(1, "2026-11-05T00:00:00Z", 14, 0), r(2, "2026-11-06T02:00:00Z", 2, 0)];

  it("senza round non si sa", () => {
    expect(dayTiming([], new Date())).toEqual({ kind: "none" });
  });
  it("prima del primo round: da iniziare", () => {
    expect(dayTiming(g6, new Date("2026-11-03T08:00:00Z"))).toEqual({ kind: "upcoming", total: 2, startsAt: "2026-11-05T00:00:00Z" });
  });
  it("in corso: round finiti e prossimo round", () => {
    const live = [r(1, "2026-11-05T00:00:00Z", 14, 14), g6[1]];
    expect(dayTiming(live, new Date("2026-11-05T09:00:00Z"))).toEqual({ kind: "live", total: 2, completed: 1, next: g6[1] });
    // Iniziati tutti, l'ultimo non ancora segnato come finito dall'aggiornamento della mattina.
    expect(dayTiming(live, new Date("2026-11-06T04:00:00Z"))).toMatchObject({ kind: "live", completed: 1, next: null });
  });
  it("chiusa quando tutte le partite sono giocate", () => {
    const done = [r(1, "2026-10-31T19:00:00Z", 7, 7), r(2, "2026-11-01T20:30:00Z", 4, 4)];
    expect(dayTiming(done, new Date("2026-11-02T08:00:00Z"))).toEqual({ kind: "done", total: 2, completed: 2 });
  });
  it("una partita rinviata tiene aperta la giornata solo fino a un giorno e mezzo dopo l'ultima partita", () => {
    const postponed = [r(1, "2026-10-31T19:00:00Z", 7, 7), r(2, "2026-11-01T20:30:00Z", 4, 3)];
    expect(dayTiming(postponed, new Date("2026-11-02T08:00:00Z"))).toMatchObject({ kind: "live", completed: 1, next: null });
    expect(dayTiming(postponed, new Date("2026-11-03T09:00:00Z"))).toEqual({ kind: "done", total: 2, completed: 1 });
  });
  it("prossimo round tra più giornate", () => {
    const g5 = [r(1, "2026-10-31T19:00:00Z", 7, 7)];
    const days = [{ matchday: 6, rounds: g6 }, { matchday: 5, rounds: g5 }];
    expect(nextRound(days, new Date("2026-11-03T08:00:00Z"))).toEqual({ matchday: 6, round: g6[0], total: 2 });
    expect(nextRound(days, new Date("2026-11-05T08:00:00Z"))).toEqual({ matchday: 6, round: g6[1], total: 2 });
    expect(nextRound(days, new Date("2026-11-07T08:00:00Z"))).toBeNull();
  });
  it("giornata dopo: salta quelle senza round", () => {
    const g20 = [r(1, "2026-12-12T22:00:00Z", 8, 0)];
    const map = new Map([[18, g6], [19, []], [20, g20]]);
    expect(followingDay(map, 18)).toEqual({ matchday: 20, rounds: g20 });
    expect(followingDay(map, 20)).toBeNull();
  });
});

describe("countdownParts", () => {
  const units = (ms: number) => countdownParts(ms).map((p) => `${p.value}${p.unit}`).join(" ");
  it("giorni solo se ce ne sono, sotto l'ora minuti e secondi", () => {
    expect(units(((2 * 24 + 5) * 3600 + 120 + 7) * 1000)).toBe("2g 5h 2m 7s");
    expect(units((5 * 3600 + 12 * 60 + 9) * 1000)).toBe("5h 12m 9s");
    expect(units(3600 * 1000)).toBe("1h 0m 0s");
    expect(units((12 * 60 + 30) * 1000)).toBe("12m 30s");
    expect(units(-5)).toBe("0m 0s");
  });
});

describe("countdownText", () => {
  it("due unità al massimo", () => {
    expect(countdownText(((2 * 24 + 5) * 3600 + 120) * 1000)).toBe("2g 5h");
    expect(countdownText((5 * 3600 + 12 * 60 + 9) * 1000)).toBe("5h 12m");
    expect(countdownText((12 * 60 + 30) * 1000)).toBe("12m 30s");
    expect(countdownText(30_400)).toBe("30s");
    expect(countdownText(-5)).toBe("0s");
  });
});
