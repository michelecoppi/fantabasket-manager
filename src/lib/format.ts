/** 3.5 → "3,5"; 8 → "8" */
export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export const POS_LABEL: Record<string, string> = { G: "Guardie", A: "Ali", C: "Centri" };
