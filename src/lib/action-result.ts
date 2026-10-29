/** Esito di una server action (admin o di squadra), come lo legge la UI. */
export type ActionResult = { ok: true; message: string; warnings: string[] } | { ok: false; error: string };

export const fail = (error: string): ActionResult => ({ ok: false, error });
export const done = (message: string, warnings: string[] = []): ActionResult => ({ ok: true, message, warnings });

/** Traduce gli errori delle RPC (prefissi FORBIDDEN / CONFLICT / INVALID, migrazione 0006) in testo per l'utente. */
export function rpcError(message: string): ActionResult {
  const m = /^(FORBIDDEN|CONFLICT|INVALID): ([\s\S]*)$/.exec(message);
  if (!m) return fail(`Operazione non riuscita: ${message}`);
  if (m[1] === "CONFLICT") return fail(`${m[2]}. Aggiorna la pagina (pulsante in alto) e riprova: non è stato salvato nulla.`);
  return fail(m[2]);
}

export const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
