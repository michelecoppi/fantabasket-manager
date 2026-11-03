"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";

/** Quanto tirare (px, dopo lo smorzamento) perché al rilascio si aggiorni. */
const THRESHOLD = 64;
const MAX = 96;

const standalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * «Tira giù per aggiornare» nell'app installata (iPhone e Android non ce l'hanno fuori dal browser): dalla cima della pagina,
 * tirando in verticale, compare il pallone sotto l'header; oltre la soglia, al rilascio, `router.refresh()` come il pulsante
 * «Aggiorna». Nel browser non fa niente: lì c'è già quello del browser. Con un foglio aperto non parte.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [pending, startTransition] = useTransition();
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!standalone()) return;
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      const busy = window.scrollY > 0 || e.touches.length > 1 || document.querySelector(":popover-open, dialog[open]");
      start.current = busy ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.touches[0].clientX - start.current.x;
      const dy = e.touches[0].clientY - start.current.y;
      // gesto orizzontale (strisce che scorrono) o verso l'alto: non è un aggiornamento
      if (dy <= 0 || Math.abs(dx) > dy) {
        if (pullRef.current) set(0);
        if (Math.abs(dx) > 12 || dy < -4) start.current = null;
        return;
      }
      set(Math.min(MAX, dy * 0.5));
    };
    const onEnd = () => {
      if (pullRef.current >= THRESHOLD) startTransition(() => router.refresh());
      start.current = null;
      set(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const shown = pending ? THRESHOLD : pull;
  if (shown === 0) return null;
  const ready = pending || pull >= THRESHOLD;
  return (
    <div
      aria-hidden={!pending}
      role={pending ? "status" : undefined}
      className="pointer-events-none fixed inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top))] z-20 flex justify-center"
      style={{ transform: `translateY(${shown - 44}px)`, opacity: Math.min(1, shown / THRESHOLD) }}
    >
      <span className={`grid h-10 w-10 place-items-center rounded-full border border-line bg-surface shadow-lg ${ready ? "text-highlight dark:text-gold" : "text-muted"}`}>
        <span className={pending ? "ball-spin inline-flex" : "inline-flex"} style={pending ? undefined : { transform: `rotate(${pull * 4}deg)` }}>
          <Icon name="ball" size={22} />
        </span>
      </span>
      {pending && <span className="sr-only">Aggiorno i dati</span>}
    </div>
  );
}
