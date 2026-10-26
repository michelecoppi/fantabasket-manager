"use client";

import { useLayoutEffect, useRef } from "react";
import { fmt } from "@/lib/format";

/**
 * Cifra che "sale" fino al valore, come un tabellone. Il server rende già il valore finale (nessun dato inventato
 * se il JavaScript non parte); con riduzione del movimento attiva resta fermo.
 */
export function CountUp({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    // Si aggiorna il nodo di testo già creato da React (non textContent), così React continua a gestirlo.
    const el = ref.current?.firstChild;
    if (!el || el.nodeType !== Node.TEXT_NODE || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      // Passi di mezzo credito, come i valori veri.
      el.nodeValue = fmt(t === 1 ? value : Math.round(value * eased * 2) / 2);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    el.nodeValue = fmt(0);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.nodeValue = fmt(value);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}
