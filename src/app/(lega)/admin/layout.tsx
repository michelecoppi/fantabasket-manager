import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { loadProfile } from "@/lib/league-server";
import { AdminTabs } from "./admin-tabs";

/** Guardia di pagina: i viewer non vedono nemmeno che l'area esiste. I permessi veri sono in RLS e nelle RPC (is_admin). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await loadProfile();
  if (profile?.role !== "admin") notFound();
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="bad">area admin</Badge>
        <span className="text-xs text-muted">Ogni modifica è atomica e finisce nel registro operazioni.</span>
      </div>
      <AdminTabs />
      {children}
    </>
  );
}
