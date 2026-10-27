"use client";

import { useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useScrollEdges } from "@/components/use-scroll-edges";

/**
 * Striscia orizzontale del ticker. Se le squadre non ci stanno, i bordi sfumano dove c'è altro da vedere
 * e con il mouse compaiono le frecce (su touch basta scorrere). Se ci stanno, niente sfumature né frecce.
 */
export function TickerScroll({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const edges = useScrollEdges(ref);

  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="relative min-w-0 flex-1">
      <ul ref={ref} className="no-scrollbar flex h-full snap-x overflow-x-auto overscroll-x-contain" aria-label={label}>
        {children}
      </ul>
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          aria-hidden={!edges[side]}
          className={`pointer-events-none absolute inset-y-0 flex w-14 items-center transition-opacity duration-200 ${
            side === "left" ? "left-0 justify-start bg-linear-to-r" : "right-0 justify-end bg-linear-to-l"
          } from-surface from-30% to-transparent ${edges[side] ? "opacity-100" : "opacity-0"}`}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={() => page(side === "left" ? -1 : 1)}
            aria-label={side === "left" ? "Squadre precedenti" : "Altre squadre"}
            className={`mx-1 hidden h-9 w-9 place-items-center rounded-full border border-line bg-surface text-foreground shadow-[0_4px_14px_-6px_rgb(6_10_20/0.5)] transition-colors hover:border-foreground/40 pointer-fine:grid ${
              edges[side] ? "pointer-events-auto" : ""
            }`}
          >
            <Icon name="chevron" size={16} strokeWidth={2.4} className={side === "left" ? "rotate-180" : undefined} />
          </button>
        </div>
      ))}
    </div>
  );
}
