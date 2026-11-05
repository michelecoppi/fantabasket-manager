/**
 * Novità dell'app, mostrate una volta a testa nella finestra «Novità» (`components/whats-new.tsx`).
 * Ogni novità che un utente della lega nota (una funzione nuova, un cambio di come si usa qualcosa) è una voce nuova IN CIMA alla
 * lista: chi ha già visto la finestra vede solo le voci più recenti dell'ultima che ha visto. Niente voci per correzioni, grafica
 * minuta o lavori interni. Testi in italiano, brevi, scritti per chi gioca (non per chi programma).
 * L'id non cambia mai dopo la pubblicazione: è ciò che il browser ricorda di aver visto.
 */
import type { IconName } from "@/components/icons";

export interface ChangelogEntry {
  /** stabile e unico: data e argomento, es. `2026-11-05-notifiche` */
  id: string;
  /** giorno della novità, AAAA-MM-GG */
  date: string;
  title: string;
  icon: IconName;
  /** una riga: di cosa si tratta */
  summary: string;
  /** i punti che contano, una frase ciascuno */
  items: string[];
  /** pulsante che porta a dove si prova la novità */
  cta?: { href: string; label: string };
}

/** Dalla più recente alla più vecchia. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: "2026-11-05-notifiche",
    date: "2026-11-05",
    title: "Notifiche sul telefono",
    icon: "bell",
    summary: "Ti avvisiamo quando c'è una novità su uno scambio che ti riguarda, senza dover aprire il sito.",
    items: [
      "Ricevi un avviso quando una squadra ti propone uno scambio, con il tempo che hai per rispondere.",
      "Lo stesso quando una squadra accetta, rifiuta o ritira, e quando un admin approva o respinge lo scambio.",
      "Gli admin lo ricevono anche quando una proposta aspetta di essere approvata.",
      "Si attiva dalla pagina Account, un dispositivo alla volta. Su iPhone serve l'app aggiunta alla schermata Home.",
    ],
    cta: { href: "/account#notifiche", label: "Attiva le notifiche" },
  },
];

/** Quante voci al massimo si mostrano insieme a chi manca da tanto: le più recenti. */
export const MAX_UNSEEN = 3;

/** Dove il browser ricorda l'ultima voce vista (`localStorage`: nessuna scrittura sul database per questo). */
export const CHANGELOG_STORAGE_KEY = "changelog-seen";

/**
 * Le voci da mostrare a chi ha visto per ultima `lastSeen`: quelle più recenti. Chi non ha mai visto nulla (o ha un id che non
 * c'è più) vede solo la più recente, non tutta la storia.
 */
export function unseenEntries(list: readonly ChangelogEntry[], lastSeen: string | null, max = MAX_UNSEEN): ChangelogEntry[] {
  if (!list.length) return [];
  const at = lastSeen ? list.findIndex((e) => e.id === lastSeen) : -1;
  if (at === 0) return [];
  return at === -1 ? [list[0]] : list.slice(0, Math.min(at, max));
}

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** «5 novembre 2026» da «2026-11-05» (senza `Intl`: stesso testo sul server e nel browser). */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? "?"} ${m[1]}`;
}
