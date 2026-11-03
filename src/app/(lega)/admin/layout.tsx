import { notFound } from "next/navigation";
import { adminTodo, adminTodoCounts } from "@/lib/admin-todo";
import { loadProfile, loadProposals, loadSlotSwaps } from "@/lib/league-server";
import { AdminTabs } from "./admin-tabs";

/** Guardia di pagina: i viewer non vedono nemmeno che l'area esiste. I permessi veri sono in RLS e nelle RPC (is_admin). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await loadProfile();
  if (profile?.role !== "admin") notFound();
  // Stesse letture della barra (memoizzate): il pallino su «Admin» si ritrova qui sulla tab che lo gestisce.
  const [proposals, swaps] = await Promise.all([loadProposals().catch(() => null), loadSlotSwaps().catch(() => null)]);
  return (
    <>
      <AdminTabs badges={adminTodoCounts(adminTodo(proposals ?? [], swaps ?? []))} />
      {children}
    </>
  );
}
