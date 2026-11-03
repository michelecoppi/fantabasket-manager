import { pendingSwaps, type SlotSwapRequest } from "./slot-swap";
import { awaitsDunkest, type Proposal } from "./trade-proposals";

/** Una voce del lavoro in coda per gli admin: dice da dove arriva il numerino rosso su «Admin» e dove si gestisce. */
export interface AdminTodo {
  /** strumento admin che la gestisce (chiave dei badge sulle tab) */
  tool: string;
  /** link diretto alla coda nella pagina */
  href: string;
  n: number;
  /** cosa c'è da fare, già al singolare o al plurale secondo `n` (il numero lo mostra il pallino) */
  text: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Coda degli admin: proposte accettate da approvare, scambi da rifare su Dunkest e cambi titolari/riserve (R-04) in attesa.
 * Solo le voci con qualcosa dentro; la somma è il badge su «Admin».
 */
export function adminTodo(proposals: readonly Proposal[], swaps: readonly SlotSwapRequest[]): AdminTodo[] {
  const toApprove = proposals.filter((p) => p.status === "accepted").length;
  const toDunkest = proposals.filter(awaitsDunkest).length;
  const slot = pendingSwaps(swaps).length;
  const all: AdminTodo[] = [
    { tool: "/admin/scambio", href: "/admin/scambio#proposte", n: toApprove, text: plural(toApprove, "scambio accettato da approvare", "scambi accettati da approvare") },
    { tool: "/admin/scambio", href: "/admin/scambio#proposte", n: toDunkest, text: plural(toDunkest, "scambio da rifare su Dunkest", "scambi da rifare su Dunkest") },
    { tool: "/admin/rose", href: "/admin/rose#cambi", n: slot, text: plural(slot, "cambio titolari/riserve da approvare", "cambi titolari/riserve da approvare") },
  ];
  return all.filter((t) => t.n > 0);
}

/** Numeri per strumento (`/admin` è il totale): stessi pallini della barra, sulle tab e sulle carte del pannello. */
export function adminTodoCounts(todo: readonly AdminTodo[]): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const t of todo) {
    out[t.tool] = (out[t.tool] ?? 0) + t.n;
    out["/admin"] = (out["/admin"] ?? 0) + t.n;
  }
  return out;
}
