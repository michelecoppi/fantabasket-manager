// Talenti scambiati nell'app (7.6, R-56) che il foglio non conosce ancora. `import_replace_season` riscrive tutti i talenti con
// la squadra del foglio e conserva il collegamento al listone per (squadra, nome): un foglio vecchio annullerebbe lo scambio e
// farebbe perdere il collegamento. Decisione dell'utente (2026-10-30): l'import si ferma, salvo --force (docs/IMPORT.md).
import { lettersOnly } from "./names";

export interface TalentPlace {
  team: string;
  displayName: string;
}

export interface TalentDrift {
  displayName: string;
  /** squadra nel database (dopo lo scambio) */
  dbTeam: string;
  /** squadra nel foglio, che l'import rimetterebbe */
  sheetTeam: string;
}

/**
 * Talenti che nel database stanno in una squadra diversa da quella del foglio, a parità di nome. Con più talenti dallo stesso
 * nome («Johnson» in due squadre) si confrontano le squadre come multinsiemi: diverge solo ciò che non combacia. I talenti che
 * esistono da una parte sola (firmati nell'app, nuovi nel foglio) non sono divergenze di squadra e qui non contano.
 */
export function talentTeamDrift(sheet: readonly TalentPlace[], db: readonly TalentPlace[]): TalentDrift[] {
  const group = (rows: readonly TalentPlace[]) => {
    const out = new Map<string, { name: string; teams: string[] }>();
    for (const r of rows) {
      const key = lettersOnly(r.displayName);
      const g = out.get(key) ?? { name: r.displayName, teams: [] };
      g.teams.push(r.team);
      out.set(key, g);
    }
    return out;
  };
  const inSheet = group(sheet);
  const drift: TalentDrift[] = [];
  for (const [key, d] of group(db)) {
    const s = inSheet.get(key);
    if (!s) continue;
    const sheetLeft = [...s.teams];
    const dbLeft: string[] = [];
    for (const team of d.teams) {
      const i = sheetLeft.indexOf(team);
      if (i >= 0) sheetLeft.splice(i, 1);
      else dbLeft.push(team);
    }
    dbLeft.forEach((dbTeam, i) => {
      if (sheetLeft[i]) drift.push({ displayName: d.name, dbTeam, sheetTeam: sheetLeft[i] });
    });
  }
  return drift.sort((a, b) => a.displayName.localeCompare(b.displayName, "it"));
}
