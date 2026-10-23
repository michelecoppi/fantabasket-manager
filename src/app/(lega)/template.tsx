import { type ReactNode, ViewTransition } from "react";

/** Si rimonta a ogni cambio di pagina (a differenza del layout): da qui partono le animazioni di entrata e uscita. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
