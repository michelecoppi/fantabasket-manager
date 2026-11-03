// Avversari simulati del playground dell'asta (/asta, issue #104). Non sono regole di lega: servono a far sentire il ritmo di
// un'asta vera a chi la prova da solo. Tutto dipende da un generatore con seme, così i test sono ripetibili.
import { floorToStep, type LotPlayer } from "./auction";

/** Generatore pseudo-casuale con seme (mulberry32): numeri in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rapido: rilancia subito; calmo: ci pensa; cecchino: aspetta gli ultimi secondi. */
export type BotStyle = "rapido" | "calmo" | "cecchino";

export interface Bot {
  teamId: string;
  style: BotStyle;
  /** quanto si lascia andare: moltiplica il valore dei giocatori */
  greed: number;
}

const STYLES: BotStyle[] = ["rapido", "calmo", "cecchino"];

export function makeBots(teamIds: readonly string[], rand: () => number): Bot[] {
  return teamIds.map((teamId, i) => ({ teamId, style: STYLES[(i + Math.floor(rand() * 3)) % 3], greed: 0.88 + rand() * 0.34 }));
}

/**
 * Quanto è disposto a spendere il bot per il giocatore: tra 0,7 e 1,25 volte i crediti Dunkest (la base è la metà), di più se gli
 * serve il ruolo. Non tutti si interessano a tutti: senza interesse vale 0. Con `mustWant` (diritto di pareggio) l'interesse c'è.
 */
export function botValue(player: LotPlayer, need: boolean, bot: Bot, rand: () => number, step: number, mustWant = false): number {
  const interested = mustWant || rand() < (need ? 0.8 : 0.3);
  if (!interested) return 0;
  const v = player.credits * (0.7 + rand() * 0.55) * bot.greed * (need ? 1.12 : 0.85);
  return floorToStep(v, step);
}

/** Fra quanti ms il bot rilancia, sempre prima dello scadere (almeno 350 ms prima): un umano al telefono ci mette 1-6 secondi. */
export function botDelay(bot: Bot, secondsLeft: number, rand: () => number): number {
  const latest = Math.max(0.25, secondsLeft - 0.35);
  const wanted = bot.style === "rapido" ? 1.2 + rand() * 2 : bot.style === "calmo" ? 2.5 + rand() * 3.5 : secondsLeft - (0.6 + rand() * 1.8);
  return Math.round(Math.min(latest, Math.max(0.5, wanted)) * 1000);
}

/**
 * Quanto offre: di solito il minimo, a volte un salto di 1 o 2 crediti per farsi sentire; lontano dal suo limite (10 crediti o più)
 * salta spesso di un quarto della distanza, come fa chi vuole chiudere in fretta. Mai oltre il suo valore.
 */
export function botAmount(minimum: number, value: number, step: number, rand: () => number): number {
  const r = rand();
  const gap = value - minimum;
  const jump = gap >= 10 && r < 0.45 ? Math.min(gap / 4, 8) : r < 0.1 ? 2 : r < 0.28 ? 1 : 0;
  return Math.max(minimum, floorToStep(Math.min(minimum + jump, value), step));
}

/** Giocatore da chiamare: tra i migliori liberi nei ruoli che servono, con un po' di caso. null = nessuno (passa). */
export function botCall(pool: readonly LotPlayer[], needs: (p: LotPlayer) => boolean, rand: () => number): LotPlayer | null {
  const wanted = pool.filter(needs);
  if (wanted.length === 0) return null;
  const top = [...wanted].sort((a, b) => b.credits - a.credits || a.id - b.id).slice(0, 8);
  return top[Math.floor(rand() * top.length)];
}
