// Fixture della Fase 6: risultati veri delle giornate 1–5 e classifica ufficiale del 2026-10-29 (squadre con sigle, nessun
// dato personale). Giornata 4 appena iniziata (0,00–0,00), giornata 5 da giocare.
import { buildLeagueView, type LeagueMatch, type Standing } from "../dunkest-league";

// ann = Atlanto Non Vinco, bol = Bol Bollerz, okc = OKCC, spa = Spaccinos, cus = CUS Cosenza, sas = San Antonio,
// asf = Assago Farmers, dam = Dame Time
const raw: [number, number, string, number | null, string, number | null][] = [
  [1, 1, "okc", 181.27, "ann", 243.64],
  [2, 1, "bol", 195.66, "spa", 161.27],
  [3, 1, "cus", 263.3, "sas", 201.95],
  [4, 1, "asf", 244.57, "dam", 222.27],
  [5, 2, "ann", 240.05, "bol", 233.15],
  [6, 2, "okc", 225.47, "cus", 268.75],
  [7, 2, "spa", 194.69, "asf", 249.25],
  [8, 2, "sas", 229.36, "dam", 244.11],
  [9, 3, "cus", 220.74, "ann", 249.36],
  [10, 3, "asf", 243.44, "bol", 303.4],
  [11, 3, "dam", 294.62, "okc", 197.51],
  [12, 3, "sas", 167.92, "spa", 206.6],
  [13, 4, "ann", 0, "asf", 0],
  [14, 4, "cus", 0, "dam", 0],
  [15, 4, "bol", 0, "sas", 0],
  [16, 4, "okc", 0, "spa", 0],
  [17, 5, "dam", null, "ann", null],
  [18, 5, "sas", null, "asf", null],
  [19, 5, "spa", null, "cus", null],
  [20, 5, "okc", null, "bol", null],
];

export const MATCHES: LeagueMatch[] = raw.map(([id, matchday, h, hp, a, ap]) => ({
  id,
  matchday,
  homeTeamId: h,
  awayTeamId: a,
  homePts: hp,
  awayPts: ap,
  winnerTeamId: hp === null || ap === null || hp === ap ? null : hp > ap ? h : a,
}));

export const STANDINGS: Standing[] = (
  [
    ["ann", 1, 733.05, 3, 0],
    ["dam", 2, 761, 2, 1],
    ["cus", 3, 752.79, 2, 1],
    ["asf", 4, 737.26, 2, 1],
    ["bol", 5, 732.21, 2, 1],
    ["spa", 6, 562.56, 1, 2],
    ["okc", 7, 604.25, 0, 3],
    ["sas", 8, 599.23, 0, 3],
  ] as const
).map(([teamId, position, totalPts, wins, losses]) => ({ teamId, position, totalPts, wins, draws: 0, losses }));

export const VIEW = buildLeagueView(null, STANDINGS, MATCHES);
