"use client";

import { useEffect } from "react";

/**
 * Registra `/sw.js` (solo la pagina «Sei offline», nessuna cache dei dati). Solo in produzione: in sviluppo un service worker
 * si metterebbe in mezzo al ricaricamento a caldo.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
