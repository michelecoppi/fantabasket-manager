import { describe, expect, it } from "vitest";
import { botAmount, botCall, botDelay, botValue, makeBots, seeded, type Bot } from "./auction-bots";

const p = (id: number, credits: number, pos: "G" | "A" | "C" = "G") => ({ id, name: `P${id}`, pos, nbaTeam: null, credits, pdk: null });
const bot = (style: Bot["style"]): Bot => ({ teamId: "b", style, greed: 1 });

describe("bot del playground", () => {
  it("il generatore con seme è ripetibile", () => {
    const a = seeded(42);
    const b = seeded(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(makeBots(["x", "y"], seeded(1))).toEqual(makeBots(["x", "y"], seeded(1)));
  });

  it("il valore resta tra 0 e 1,75 volte i crediti, sul mezzo credito", () => {
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) {
      const v = botValue(p(1, 20), i % 2 === 0, { teamId: "b", style: "calmo", greed: 1.22 }, rand, 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(20 * 1.75);
      expect((v * 2) % 1).toBe(0);
    }
    expect(botValue(p(1, 20), false, bot("calmo"), () => 0.99, 0.5, true)).toBeGreaterThan(0);
  });

  it("rilancia sempre prima dello scadere", () => {
    const rand = seeded(3);
    for (const style of ["rapido", "calmo", "cecchino"] as const) {
      for (let i = 0; i < 100; i++) {
        const left = 1 + rand() * 14;
        const d = botDelay(bot(style), left, rand);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThanOrEqual(Math.max(250, (left - 0.35) * 1000) + 1);
      }
    }
    expect(botDelay(bot("cecchino"), 10, () => 0)).toBe(9400);
  });

  it("offre almeno il minimo e mai oltre il suo valore", () => {
    expect(botAmount(5, 12, 0.5, () => 0.05)).toBe(7);
    expect(botAmount(5, 12, 0.5, () => 0.2)).toBe(6);
    expect(botAmount(5, 12, 0.5, () => 0.9)).toBe(5);
    expect(botAmount(5, 5.5, 0.5, () => 0.05)).toBe(5.5);
    expect(botAmount(20, 40, 0.5, () => 0.4)).toBe(25); // lontano dal limite: un quarto della distanza
    expect(botAmount(20, 80, 0.5, () => 0.4)).toBe(28); // al massimo 8
    expect(botAmount(20, 40, 0.5, () => 0.9)).toBe(20);
  });

  it("chiama tra i migliori del ruolo che gli serve", () => {
    const pool = [p(1, 30, "G"), p(2, 25, "C"), p(3, 5, "C")];
    expect(botCall(pool, (x) => x.pos === "C", () => 0)?.id).toBe(2);
    expect(botCall(pool, () => false, () => 0)).toBeNull();
  });
});
