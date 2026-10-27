"use client";

import { useEffect, useState, type RefObject } from "react";

/** Per una striscia che scorre in orizzontale: c'è altro da vedere a sinistra/destra? Si aggiorna con scroll e resize. */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft < max - 2;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref]);

  return edges;
}

/** Maschera che sfuma i bordi dove la striscia continua (per contenuti senza sfondo proprio, come i chip). */
export function edgeMask({ left, right }: { left: boolean; right: boolean }): string | undefined {
  if (!left && !right) return undefined;
  return `linear-gradient(to right, ${left ? "transparent, black 2rem" : "black"}, ${right ? "black calc(100% - 2rem), transparent" : "black"})`;
}
