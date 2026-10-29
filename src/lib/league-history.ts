// Albo d'oro: classifiche finali delle stagioni concluse (prima dell'app da `league_history`, poi da quelle gestite dall'app)
// e la carriera di ogni squadra di oggi. Puro e testato. Decisioni dell'utente (2026-10-29): l'anello va al 1° della
// classifica (R-61); chi ha preso il posto di una squadra uscita non ne eredita la storia (la successione si mostra soltanto).

export interface PastRow {
  /** come `seasons.year`: 2022 = stagione 2022/23 */
  seasonYear: number;
  position: number;
  /** nome in quella stagione */
  teamName: string;
  /** squadra di oggi; null = non più in lega */
  teamId: string | null;
  /** squadra non più in lega: stessa chiave = stessa squadra con nomi diversi */
  formerKey: string | null;
  /** squadra di oggi entrata al posto di quella uscita */
  replacedBy: string | null;
  wins: number;
  draws: number;
  losses: number;
  totalPts: number;
}

/** Riga della stagione in corso (classifica Dunkest di adesso): conta per record e stagioni, non per piazzamenti e anelli. */
export interface LiveRow {
  teamId: string;
  position: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface SeasonTable {
  year: number;
  /** ordinate per posizione */
  rows: PastRow[];
  champion: PastRow | null;
}

export interface Finish {
  year: number;
  position: number;
  wins: number;
  draws: number;
  losses: number;
  totalPts: number;
  /** nome in quella stagione, se diverso da quello di oggi */
  alias: string | null;
}

export interface Career {
  teamId: string;
  /** prima stagione in lega (anche quella in corso, per chi è appena entrato) */
  since: number;
  /** stagioni giocate, compresa quella in corso */
  seasons: number;
  /** stagioni concluse, dalla più recente */
  finishes: Finish[];
  /** miglior piazzamento nelle stagioni concluse e in quali stagioni; null = nessuna stagione conclusa */
  best: { position: number; years: number[] } | null;
  /** stagioni vinte, dalla più vecchia */
  rings: number[];
  /** podi (1°–3°) nelle stagioni concluse */
  podiums: number;
  /** squadre uscite di cui ha preso il posto (senza ereditarne la storia) */
  replaced: { name: string; lastYear: number }[];
  /** totali di tutte le stagioni, compresa quella in corso */
  wins: number;
  draws: number;
  losses: number;
  live: LiveRow | null;
}

/** Squadra non più in lega. */
export interface Former {
  key: string;
  /** nome dell'ultima stagione */
  name: string;
  /** nomi precedenti, dal più recente */
  aliases: string[];
  /** squadra di oggi entrata al suo posto */
  replacedBy: string | null;
  years: number[];
  best: number;
  rings: number[];
  wins: number;
  draws: number;
  losses: number;
}

export interface LeagueHistory {
  /** stagioni concluse, dalla più recente */
  seasons: SeasonTable[];
  /** squadre di oggi, ordinate per anelli, poi percentuale di vittorie */
  careers: Career[];
  formers: Former[];
}

/** Stesso nome a meno di maiuscole e spazi («Cus Cosenza» = «CUS Cosenza»): non serve dire che è cambiato. */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** 2022 → "2022/23". */
export const seasonLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

/** 2022 → "22/23", per incisioni e spazi stretti. */
export const shortSeasonLabel = (year: number) => `${String(year % 100).padStart(2, "0")}/${String((year + 1) % 100).padStart(2, "0")}`;

/** Percentuale di vittorie (un pareggio vale mezza vittoria, come nell'andamento della classifica); null senza partite. */
export function winPct(r: { wins: number; draws: number; losses: number }): number | null {
  const games = r.wins + r.draws + r.losses;
  return games === 0 ? null : (r.wins + r.draws / 2) / games;
}

/**
 * Albo d'oro e carriere. `past`: righe delle stagioni concluse (una per squadra e stagione); `teams`: id e nome delle squadre
 * di oggi; `live`: classifica della stagione in corso (`currentYear`), vuota se non si legge.
 */
export function buildHistory(past: PastRow[], teams: { id: string; name: string }[], currentYear: number, live: LiveRow[]): LeagueHistory {
  const closed = past.filter((r) => r.seasonYear < currentYear);
  const byYear = new Map<number, PastRow[]>();
  for (const r of closed) byYear.set(r.seasonYear, [...(byYear.get(r.seasonYear) ?? []), r]);
  const seasons: SeasonTable[] = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => {
      const sorted = [...rows].sort((a, b) => a.position - b.position);
      return { year, rows: sorted, champion: sorted.find((r) => r.position === 1) ?? null };
    });

  const careers: Career[] = teams.map((t) => {
    const mine = closed.filter((r) => r.teamId === t.id).sort((a, b) => b.seasonYear - a.seasonYear);
    const now = live.find((r) => r.teamId === t.id) ?? null;
    const top = mine.length ? Math.min(...mine.map((r) => r.position)) : null;
    const sum = (k: "wins" | "draws" | "losses") => mine.reduce((n, r) => n + r[k], 0) + (now?.[k] ?? 0);
    const years = mine.map((r) => r.seasonYear);
    return {
      teamId: t.id,
      since: Math.min(currentYear, ...years),
      seasons: mine.length + 1,
      finishes: mine.map((r) => ({ year: r.seasonYear, position: r.position, wins: r.wins, draws: r.draws, losses: r.losses, totalPts: r.totalPts, alias: sameName(r.teamName, t.name) ? null : r.teamName })),
      best: top === null ? null : { position: top, years: mine.filter((r) => r.position === top).map((r) => r.seasonYear).sort((a, b) => a - b) },
      rings: mine.filter((r) => r.position === 1).map((r) => r.seasonYear).sort((a, b) => a - b),
      podiums: mine.filter((r) => r.position <= 3).length,
      replaced: [],
      wins: sum("wins"),
      draws: sum("draws"),
      losses: sum("losses"),
      live: now,
    };
  });
  careers.sort((a, b) => b.rings.length - a.rings.length || (winPct(b) ?? 0) - (winPct(a) ?? 0) || a.since - b.since);

  const gone = new Map<string, PastRow[]>();
  for (const r of closed) {
    if (r.teamId !== null) continue;
    const key = r.formerKey ?? r.teamName;
    gone.set(key, [...(gone.get(key) ?? []), r]);
  }
  const formers: Former[] = [...gone.entries()]
    .map(([key, rows]) => {
      const recent = [...rows].sort((a, b) => b.seasonYear - a.seasonYear);
      return {
        key,
        name: recent[0].teamName,
        aliases: [...new Set(recent.map((r) => r.teamName))].slice(1),
        replacedBy: recent.find((r) => r.replacedBy)?.replacedBy ?? null,
        years: recent.map((r) => r.seasonYear).reverse(),
        best: Math.min(...rows.map((r) => r.position)),
        rings: rows.filter((r) => r.position === 1).map((r) => r.seasonYear).sort((a, b) => a - b),
        wins: rows.reduce((n, r) => n + r.wins, 0),
        draws: rows.reduce((n, r) => n + r.draws, 0),
        losses: rows.reduce((n, r) => n + r.losses, 0),
      };
    })
    .sort((a, b) => b.rings.length - a.rings.length || b.years.length - a.years.length || a.years[0] - b.years[0]);
  for (const c of careers) {
    c.replaced = formers.filter((f) => f.replacedBy === c.teamId).map((f) => ({ name: f.name, lastYear: f.years[f.years.length - 1] }));
  }

  return { seasons, careers, formers };
}

/**
 * Righe delle stagioni chiuse nell'app: la classifica Dunkest salvata per quella stagione, con la posizione finale registrata
 * alla chiusura (`team_season.final_rank`) quando c'è. Il nome è quello di oggi. Le stagioni già nell'archivio restano quelle.
 */
export function closedSeasonRows(
  seasons: { id: number; year: number }[],
  standings: { seasonId: number; teamId: string; position: number; totalPts: number; wins: number; draws: number; losses: number }[],
  finalRanks: { seasonId: number; teamId: string; finalRank: number | null }[],
  teamNames: Map<string, string>,
  archived: Set<number>,
): PastRow[] {
  return seasons.flatMap((s) => {
    if (archived.has(s.year)) return [];
    return standings
      .filter((r) => r.seasonId === s.id)
      .map((r) => ({
        seasonYear: s.year,
        position: finalRanks.find((f) => f.seasonId === s.id && f.teamId === r.teamId)?.finalRank ?? r.position,
        teamName: teamNames.get(r.teamId) ?? "?",
        teamId: r.teamId,
        formerKey: null,
        replacedBy: null,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        totalPts: r.totalPts,
      }));
  });
}
