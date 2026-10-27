/** 3.5 → "3,5"; 8 → "8" */
export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

const euro = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Importi in euro: 2.75 → "2,75"; non arrotonda ai decimi come i crediti. */
export function fmtEuro(n: number): string {
  return euro.format(n);
}

export const POS_LABEL: Record<string, string> = { G: "Guardie", A: "Ali", C: "Centri" };

const dateTime = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const dateOnly = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });

/** "2026-10-27T08:02:00Z" → "27 ott, 09:02" (ora italiana). */
export function fmtDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** "2026-10-19" → "19 ott". */
export function fmtDay(isoDate: string): string {
  return dateOnly.format(new Date(`${isoDate}T12:00:00Z`));
}
