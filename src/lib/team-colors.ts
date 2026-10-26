// Identità visiva delle squadre: un colore per franchigia e il monogramma dello stemma. Solo presentazione, nessuna regola di lega.

/** 8 colori distinti, leggibili con testo bianco grande in entrambi i temi (uno per squadra della lega). */
export const TEAM_COLORS = ["#1d47b5", "#cf2338", "#0e7f5a", "#6a3fc6", "#c75d0c", "#0a7ba0", "#9c6f00", "#b3246f"] as const;

/**
 * Colore stabile per squadra: dipende dall'ordine degli id, non da quello di visualizzazione, così una squadra
 * ha lo stesso colore in tutte le pagine qualunque sia l'ordinamento scelto. Oltre 8 squadre i colori si ripetono.
 */
export function teamColors(teamIds: string[]): Map<string, string> {
  const sorted = [...new Set(teamIds)].sort();
  return new Map(sorted.map((id, i) => [id, TEAM_COLORS[i % TEAM_COLORS.length]]));
}

/** "Bol Bollerz" → "BB"; "Lakers" → "LA". */
export function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
