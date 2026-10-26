import { notFound } from "next/navigation";
import { loadProfile } from "@/lib/league-server";
import { AdminTabs } from "./admin-tabs";

/** Guardia di pagina: i viewer non vedono nemmeno che l'area esiste. I permessi veri sono in RLS e nelle RPC (is_admin). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await loadProfile();
  if (profile?.role !== "admin") notFound();
  return (
    <>
      <AdminTabs />
      {children}
    </>
  );
}
