import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDunkest, buildSyncPayload, injuryStatus, linkPlayers, parseInjuries, parseStats, SourceFormatError, syncState, type DbPlayer } from "./dunkest";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const player = (id: number, firstName: string, lastName: string, nbaTeam: string | null = null, extra: Partial<DbPlayer> = {}): DbPlayer => ({
  id,
  firstName,
  lastName,
  nbaTeam,
  dunkestId: null,
  rostered: false,
  ...extra,
});

describe("parseInjuries (campione della pagina del 2026-10-27)", () => {
  const page = parseInjuries(fixture("dunkest-injuries.html"));

  it("legge solo la vista per squadra, con id, slug, squadra e data", () => {
    expect(page.injuries.map((i) => i.slug)).toEqual(["mouhamed-gueye", "henri-veesaar", "devin-carter"]);
    expect(page.injuries[0]).toEqual({
      dunkestId: 1867,
      slug: "mouhamed-gueye",
      shortName: "M. Gueye",
      teamCode: "ATL",
      date: "2026-10-19",
      injury: "Piede",
      description: "Indisponibile fino al 20 Nov",
    });
    expect(page.injuries[2].teamCode).toBe("BOS");
  });

  it("legge l'ora dell'ultimo aggiornamento di Dunkest", () => {
    expect(page.updatedAt).toBe("2026-10-27T02:30:05Z");
  });

  it("senza la vista per squadra lancia un errore di formato (il job lascia i dati vecchi)", () => {
    expect(() => parseInjuries("<html><body>Manutenzione</body></html>")).toThrow(SourceFormatError);
  });

  it("vista presente ma senza righe = nessun infortunato", () => {
    expect(parseInjuries('<div class="injuries__wrapper" data-target="by-team"></div>').injuries).toEqual([]);
  });

  it("decodifica le entità HTML e toglie la descrizione vuota", () => {
    const html = `<div class="injuries__wrapper" data-target="by-team"><article data-team-code="CHA"><table><tr><td><a href="https://www.dunkest.com/it/giocatore/9/royce-oneale">R. O&#039;Neale</a></td><td>A</td><td>4.4</td><td><span data-date="2026-10-20"></span></td><td>Caviglia</td><td>—</td></tr></table></article></div>`;
    expect(parseInjuries(html).injuries[0]).toMatchObject({ shortName: "R. O'Neale", description: "" });
  });
});

describe("parseStats", () => {
  it("converte le stringhe in numeri e normalizza LA Clippers", () => {
    const rows = parseStats(JSON.parse(fixture("dunkest-stats.json")));
    const jokic = rows.find((r) => r.lastName === "Jokic")!;
    expect(jokic).toMatchObject({ firstName: "Nikola", teamCode: "DEN", teamName: "Denver Nuggets", pdk: 27.5 });
    expect(typeof jokic.gp).toBe("number");
    expect(parseStats([{ id: "1", first_name: "A", last_name: "B", team_name: "LA Clippers", gp: "2", pdk: "3.5" }])[0]).toMatchObject({ teamName: "Los Angeles Clippers", min: 0 });
  });

  it("rifiuta risposte vuote o con un formato diverso", () => {
    expect(() => parseStats([])).toThrow(SourceFormatError);
    expect(() => parseStats({ error: "x" })).toThrow(SourceFormatError);
    expect(() => parseStats([{ id: "1", first_name: "A", last_name: "B", gp: "1" }])).toThrow(SourceFormatError);
  });
});

describe("linkPlayers", () => {
  const src = (dunkestId: number, name: string, team: string | null = null) => ({ dunkestId, name, team, label: name });

  it("collega per nome intero ignorando accenti, punteggiatura e maiuscole", () => {
    const { links, newLinks } = linkPlayers(
      [player(1, "Jaime", "Jaquez Jr"), player(2, "T,J,", "Mcconnell"), player(3, "Nikola", "Jokić")],
      [src(10, "Jaime Jaquez Jr."), src(11, "tj-mcconnell"), src(12, "Nikola Jokic")],
    );
    expect([...links]).toEqual([
      [10, 1],
      [11, 2],
      [12, 3],
    ]);
    expect(newLinks).toHaveLength(3);
  });

  it("usa l'id già salvato prima del nome, e non lo riscrive", () => {
    const { links, newLinks } = linkPlayers([player(1, "Jalen", "Williams", null, { dunkestId: 77 }), player(2, "Jalen", "Williams")], [src(77, "Jalen Williams")]);
    expect(links.get(77)).toBe(1);
    expect(newLinks).toEqual([]);
  });

  it("senza nome intero esatto prova senza suffisso (Jr., III)", () => {
    expect(linkPlayers([player(1, "Robert", "Williams III")], [src(5, "Robert Williams")]).links.get(5)).toBe(1);
  });

  it("omonimi: decide la squadra NBA; se non basta, finiscono nel report", () => {
    const players = [player(1, "Jalen", "Johnson", "Atlanta Hawks"), player(2, "Jalen", "Johnson", "Utah Jazz")];
    expect(linkPlayers(players, [src(5, "Jalen Johnson", "Atlanta Hawks")]).links.get(5)).toBe(1);
    const r = linkPlayers(players, [src(5, "Jalen Johnson", "Boston Celtics")]);
    expect(r.links.has(5)).toBe(false);
    expect(r.ambiguous).toEqual([{ source: "Jalen Johnson", candidates: ["Jalen Johnson (Atlanta Hawks)", "Jalen Johnson (Utah Jazz)"] }]);
  });

  it("due voci Dunkest con lo stesso nome e un solo giocatore: serve la squadra", () => {
    const r = linkPlayers([player(1, "Brandon", "Williams", "Golden State Warriors")], [src(5, "Brandon Williams", "Dallas Mavericks"), src(6, "Brandon Williams", "Golden State Warriors")]);
    expect([...r.links]).toEqual([[6, 1]]);
    expect(r.ambiguous.map((a) => a.source)).toEqual(["Brandon Williams"]);
  });

  it("non collega mai i provvisori (solo cognome)", () => {
    const r = linkPlayers([player(1, "", "A.Walker")], [src(5, "Jarace Walker"), src(6, "awalker")]);
    expect(r.links.size).toBe(0);
    expect(r.unlinked).toHaveLength(2);
  });
});

describe("buildSyncPayload", () => {
  const stats = parseStats(JSON.parse(fixture("dunkest-stats.json")));
  const injuries = parseInjuries(fixture("dunkest-injuries.html"));
  const players = [
    player(1, "Nikola", "Jokic", "Denver Nuggets", { rostered: true }),
    player(2, "Mouhamed", "Gueye", "Atlanta Hawks"),
    player(3, "Jalen", "Williams", "Oklahoma City Thunder", { rostered: true }),
    player(4, "Cooper", "Flagg", "Dallas Mavericks", { rostered: true }),
    player(5, "", "A.Walker"),
  ];
  const p = buildSyncPayload(7, players, stats, injuries);

  it("scrive statistiche e infortuni solo dei giocatori della lega", () => {
    expect(p.season_id).toBe(7);
    expect(p.stats.map((s) => s.player_id).sort()).toEqual([1, 3]);
    expect(p.stats.find((s) => s.player_id === 1)).toMatchObject({ pdk: 27.5 });
    expect(p.injuries).toEqual([{ player_id: 2, injured_on: "2026-10-19", injury: "Piede", description: "Indisponibile fino al 20 Nov" }]);
    expect(p.links.map((l) => l.player_id).sort()).toEqual([1, 2, 3]);
    expect(p.source_updated_at).toBe("2026-10-27T02:30:05Z");
  });

  it("report: provvisori, giocatori in rosa senza statistiche, infortunati non collegati", () => {
    expect(p.report.provisional).toEqual(["A.Walker"]);
    expect(p.report.rosteredWithoutStats).toEqual(["Cooper Flagg"]);
    expect(p.report.injuriesUnlinked).toEqual(["D. Carter (BOS)", "H. Veesaar (ATL)"]);
  });
});

describe("injuryStatus", () => {
  it("riconosce fuori con rientro, in dubbio, stagione finita", () => {
    expect(injuryStatus("Indisponibile fino al 20 Nov")).toEqual({ status: "out", until: "20 nov" });
    expect(injuryStatus("GTD: da valutare prima della partita")).toEqual({ status: "doubtful", until: null });
    expect(injuryStatus("Indisponibile per tutta la stagione")).toEqual({ status: "season", until: null });
    expect(injuryStatus("")).toEqual({ status: "out", until: null });
  });
});

describe("buildDunkest", () => {
  const view = buildDunkest(
    null,
    [
      { player_id: 1, pos: "G", gp: 5, pdk: 30, min: 34, pts: 25, reb: 5, ast: 8 },
      { player_id: 2, pos: "G", gp: 4, pdk: 20, min: 30, pts: 15, reb: 3, ast: 4 },
      { player_id: 3, pos: "G", gp: 4, pdk: 20, min: 28, pts: 14, reb: 2, ast: 3 },
      { player_id: 4, pos: "C", gp: 3, pdk: 10.5, min: 20, pts: 8, reb: 9, ast: 1 },
      { player_id: 5, pos: null, gp: 0, pdk: 0, min: 0, pts: 0, reb: 0, ast: 0 },
    ],
    [{ player_id: 4, injured_on: "2026-10-19", injury: "Caviglia", description: "GTD: da valutare prima della partita" }],
  );

  it("medie e massimi per ruolo, posizione nel ruolo con pari merito", () => {
    expect(view.roles.G).toEqual({ avg: 23.3, max: 30, count: 3 });
    expect(view.roles.A).toBeUndefined();
    expect(view.all).toEqual({ avg: 20.1, max: 30, count: 4 });
    expect(view.ranks.get(1)).toEqual({ rank: 1, of: 3 });
    expect(view.ranks.get(3)).toEqual({ rank: 2, of: 3 });
    expect(view.ranks.has(5)).toBe(false);
  });

  it("infortuni con stato calcolato dalla descrizione", () => {
    expect(view.injuries.get(4)).toMatchObject({ status: "doubtful", injury: "Caviglia", since: "2026-10-19" });
  });
});

describe("syncState", () => {
  const base = { sourceUpdatedAt: null, report: null };
  it("mai, ok, fallito (ultimo tentativo dopo l'ultimo successo)", () => {
    expect(syncState(null)).toBe("never");
    expect(syncState({ ...base, lastSuccessAt: null, lastAttemptAt: null, lastError: null })).toBe("never");
    expect(syncState({ ...base, lastSuccessAt: "2026-10-27T08:01:00Z", lastAttemptAt: "2026-10-27T08:01:00Z", lastError: null })).toBe("ok");
    expect(syncState({ ...base, lastSuccessAt: "2026-10-26T08:01:00Z", lastAttemptAt: "2026-10-27T08:01:00Z", lastError: "HTTP 503" })).toBe("failed");
  });
});
