import type { IconName } from "@/components/icons";
import { adminTodo } from "./admin-todo";
import { pendingSwaps, type SlotSwapRequest } from "./slot-swap";
import { awaitsAnswer, type Proposal } from "./trade-proposals";

/** Una voce di «Da fare» in home: cosa c'è e dove si gestisce. `action` = tocca a te; altrimenti è un'informazione. */
export interface HomeTodo {
  key: string;
  href: string;
  text: string;
  icon: IconName;
  action: boolean;
  n?: number;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * «Da fare» in home, per il proprietario (e per un admin anche la sua coda): proposte che aspettano la tua risposta, tue
 * proposte accettate in attesa dell'admin, la tua richiesta di cambio titolari/riserve (R-04) o la finestra dei cambi aperta,
 * il mercato aperto. Prima ciò che tocca a te. `null` = dato non letto (la voce si salta).
 */
export function homeTodo(input: {
  teamId: string | null;
  admin: boolean;
  proposals: readonly Proposal[] | null;
  swaps: readonly SlotSwapRequest[] | null;
  swapWindowOpen: boolean | null;
  marketOpen: boolean | null;
}): HomeTodo[] {
  const { teamId, admin, proposals, swaps, swapWindowOpen, marketOpen } = input;
  const out: HomeTodo[] = [];
  const teamHref = teamId ? `/squadre/${teamId}` : null;

  if (proposals && teamId) {
    const answer = proposals.filter((p) => awaitsAnswer(p, teamId)).length;
    if (answer > 0)
      out.push({ key: "answer", href: "/scambio?vista=proposte", icon: "swap", action: true, n: answer, text: plural(answer, "Una proposta di scambio aspetta la tua risposta", `${answer} proposte di scambio aspettano la tua risposta`) });
    const accepted = proposals.filter((p) => p.status === "accepted" && p.proposerTeamId === teamId).length;
    if (accepted > 0)
      out.push({ key: "accepted", href: "/scambio?vista=proposte", icon: "check", action: false, n: accepted, text: plural(accepted, "La tua proposta è stata accettata: manca l'admin", "Le tue proposte sono state accettate: manca l'admin") });
  }

  if (admin && proposals && swaps) {
    for (const t of adminTodo(proposals, swaps)) out.push({ key: `admin-${t.text}`, href: t.href, icon: "badge", action: true, n: t.n, text: `Admin: ${t.text}` });
  }

  if (teamHref && swaps) {
    const mine = pendingSwaps(swaps).some((r) => r.teamId === teamId);
    if (mine) out.push({ key: "swap-pending", href: `${teamHref}#cambio`, icon: "clock", action: false, text: "Il tuo cambio titolari/riserve aspetta l'admin" });
    else if (swapWindowOpen) out.push({ key: "swap-open", href: `${teamHref}#cambio`, icon: "clipboard", action: false, text: "Cambi titolari/riserve aperti: puoi chiederne uno" });
  }

  if (marketOpen) out.push({ key: "market", href: "/scambio", icon: "swap", action: false, text: "Mercato degli scambi aperto" });

  return [...out.filter((t) => t.action), ...out.filter((t) => !t.action)];
}
