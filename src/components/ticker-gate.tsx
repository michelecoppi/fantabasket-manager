"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Pagine dove il ticker dello spazio cap serve anche su telefono: la home e lo scambio (si guarda chi ha spazio). */
const PHONE_ROUTES = ["/", "/scambio"];

/**
 * Su telefono il ticker resta solo dove serve: altrove sono 54 px di cornice prima del contenuto.
 * Da `sm` in su si vede su tutte le pagine (firma visiva del design system).
 */
export function TickerGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className={PHONE_ROUTES.includes(pathname) ? undefined : "max-sm:hidden"}>{children}</div>;
}
