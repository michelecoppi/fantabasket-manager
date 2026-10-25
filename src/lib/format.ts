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
