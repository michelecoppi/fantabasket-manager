import { describe, expect, it } from "vitest";
import { CHANGELOG, dateLabel, MAX_UNSEEN, unseenEntries, type ChangelogEntry } from "./changelog";

const entry = (id: string, date = "2026-11-01"): ChangelogEntry => ({ id, date, title: id, icon: "star", summary: "s", items: ["a"] });
const LIST = [entry("e5"), entry("e4"), entry("e3"), entry("e2"), entry("e1")];
const ids = (l: ChangelogEntry[]) => l.map((e) => e.id);

describe("unseenEntries", () => {
  it("chi non ha visto nulla vede solo la voce più recente, non tutta la storia", () => {
    expect(ids(unseenEntries(LIST, null))).toEqual(["e5"]);
  });

  it("chi ha visto l'ultima non vede niente", () => {
    expect(unseenEntries(LIST, "e5")).toEqual([]);
  });

  it("chi ha visto una voce vecchia vede quelle uscite dopo, dalla più recente", () => {
    expect(ids(unseenEntries(LIST, "e4"))).toEqual(["e5"]);
    expect(ids(unseenEntries(LIST, "e3"))).toEqual(["e5", "e4"]);
  });

  it(`non ne mostra più di ${MAX_UNSEEN}, le più recenti`, () => {
    expect(ids(unseenEntries(LIST, "e1"))).toEqual(["e5", "e4", "e3"]);
    expect(ids(unseenEntries(LIST, "e1", 2))).toEqual(["e5", "e4"]);
  });

  it("un id che non c'è più (voce tolta) conta come mai visto", () => {
    expect(ids(unseenEntries(LIST, "tolta"))).toEqual(["e5"]);
  });

  it("senza voci non c'è niente da mostrare", () => {
    expect(unseenEntries([], null)).toEqual([]);
    expect(unseenEntries([], "e1")).toEqual([]);
  });
});

describe("dateLabel", () => {
  it("scrive la data per esteso, senza dipendere dal fuso", () => {
    expect(dateLabel("2026-11-05")).toBe("5 novembre 2026");
    expect(dateLabel("2027-01-31")).toBe("31 gennaio 2027");
  });
  it("lascia com'è ciò che non è una data", () => {
    expect(dateLabel("oggi")).toBe("oggi");
  });
});

describe("CHANGELOG", () => {
  it("ha id unici e voci complete", () => {
    expect(new Set(CHANGELOG.map((e) => e.id)).size).toBe(CHANGELOG.length);
    for (const e of CHANGELOG) {
      expect(e.id, "id con la data davanti").toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
      expect(e.id.startsWith(e.date), `${e.id}: l'id comincia con la data`).toBe(true);
      expect(e.title.trim(), `${e.id}: titolo`).not.toBe("");
      expect(e.summary.trim(), `${e.id}: riga di sintesi`).not.toBe("");
      expect(e.items.length, `${e.id}: almeno un punto`).toBeGreaterThan(0);
      if (e.cta) {
        expect(e.cta.href, `${e.id}: il pulsante porta a una pagina del sito`).toMatch(/^\/(?!\/)/);
        expect(e.cta.label.trim()).not.toBe("");
      }
    }
  });

  it("è ordinata dalla più recente alla più vecchia (le nuove voci vanno in cima)", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
