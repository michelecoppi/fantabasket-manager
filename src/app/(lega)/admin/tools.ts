import type { IconName } from "@/components/icons";

/** Strumenti admin: una sola lista per le tab e per le carte della panoramica. */
export const adminTools: { href: string; label: string; text: string; icon: IconName }[] = [
  { href: "/admin/scambio", label: "Scambio", text: "Giocatori e pick tra due squadre, con controllo del cap (R-57) ed eccezione del moderatore.", icon: "swap" },
  { href: "/admin/firma", label: "Firma", text: "Porta un giocatore libero in una rosa: stipendio, durata, team option.", icon: "pen" },
  { href: "/admin/rose", label: "Rose", text: "Fissa le durate, sposta titolari e riserve, taglia o rimuovi e chiudi i tagli dopo l'asta.", icon: "clipboard" },
  { href: "/admin/pick", label: "Pick", text: "Correggi i proprietari, risolvi i «da confermare» e apri i nuovi draft.", icon: "ticket" },
  { href: "/admin/quote", label: "Quote", text: "Quota di iscrizione e luxury tax: chi ha pagato e quanto si deve.", icon: "coins" },
  { href: "/admin/chiusura", label: "Chiusura", text: "Fine stagione: classifica e bonus, lottery del draft, scadenza dei contratti e team option.", icon: "trophy" },
  { href: "/admin/registro", label: "Registro", text: "Lo storico completo delle operazioni, con filtro per tipo.", icon: "ledger" },
];
