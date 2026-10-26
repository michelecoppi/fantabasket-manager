import { describe, expect, it } from "vitest";
import type { ImportData, PlayerRef } from "./parse";
import { buildImportPayload, payloadErrors, refKey } from "./payload";

const listed: PlayerRef = {
  rawName: "Jokic",
  catalog: { firstName: "Nikola", lastName: "Jokić", pos: "C", nbaTeam: "Denver Nuggets", credits: 30, owner: null },
  match: "owner",
  pos: "C",
};
const provisional: PlayerRef = { rawName: "A.Walker", catalog: null, match: "none", pos: "G" };

const data = (over: Partial<ImportData> = {}): ImportData => ({
  catalog: [listed.catalog!],
  contracts: [
    { team: "Bol Bollerz", slot: "starter", role: "C", years: 2, teamOption: false, restriction: null, rookie: false, salary: 30, player: listed },
    { team: "Bol Bollerz", slot: "reserve", role: "G", years: null, teamOption: true, restriction: "unrestricted", rookie: true, salary: 1, player: provisional },
  ],
  cuts: [],
  talents: [],
  picks: [
    { year: 2027, round: 1, original: "Bol Bollerz", current: null, rawStatus: "?", toConfirm: true },
    { year: 2027, round: 2, original: "Bol Bollerz", current: "Bol Bollerz", rawStatus: "", toConfirm: false },
  ],
  rookieDraft: [],
  lastContracts: [],
  stats: [{ team: "Bol Bollerz", monte: 31, spazio: 0, spazioRiserve: 0, bonus: 2, sforato: false, quotaPagata: true }],
  warnings: [],
  ...over,
});

describe("buildImportPayload", () => {
  it("un giocatore del listone e uno provvisorio, senza duplicati tra catalogo e contratti", () => {
    const p = buildImportPayload(data(), 2026);
    expect(p.year).toBe(2026);
    expect(p.players.map((x) => x.ref).sort()).toEqual([refKey(listed), refKey(provisional)].sort());
    expect(p.players.find((x) => x.ref === refKey(listed))).toMatchObject({ dunkest_credits: 30, nba_team: "Denver Nuggets" });
    expect(p.players.find((x) => x.ref === refKey(provisional))).toMatchObject({ first_name: "", last_name: "A.Walker", nba_team: null });
  });

  it("i contratti puntano ai giocatori per ref e mantengono durata nulla e sigle", () => {
    const p = buildImportPayload(data(), 2026);
    expect(p.contracts[1]).toMatchObject({ player: refKey(provisional), years_left: null, restriction: "unrestricted", is_rookie: true, team_option: true });
  });

  it("la nota delle pick c'è solo se il proprietario attuale è diverso dall'originale", () => {
    const p = buildImportPayload(data(), 2026);
    expect(p.picks[0]).toMatchObject({ current: null, to_confirm: true, note: "?" });
    expect(p.picks[1]).toMatchObject({ note: null });
  });
});

describe("payloadErrors", () => {
  it("payload coerente: nessun errore", () => {
    expect(payloadErrors(buildImportPayload(data(), 2026))).toEqual([]);
  });

  it("senza contratti non si importa (cancellerebbe la stagione)", () => {
    expect(payloadErrors(buildImportPayload(data({ contracts: [] }), 2026)).join("|")).toContain("nessun contratto");
  });

  it("squadra che non è nelle statistiche", () => {
    const d = data({ stats: [{ team: "Spaccinos", monte: 0, spazio: 0, spazioRiserve: 0, bonus: 0, sforato: false, quotaPagata: false }] });
    expect(payloadErrors(buildImportPayload(d, 2026)).join("|")).toContain("squadra non presente");
  });

  it("giocatore del contratto senza riga in players", () => {
    const p = buildImportPayload(data(), 2026);
    p.players = p.players.filter((x) => x.ref !== refKey(provisional));
    expect(payloadErrors(p).join("|")).toContain("senza riga in players");
  });
});
