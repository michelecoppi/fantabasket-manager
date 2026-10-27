"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";
import { edgeMask, useScrollEdges } from "@/components/use-scroll-edges";
import type { MatchdayState } from "@/lib/dunkest-league";

function Num({ n }: { n: number }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse" : undefined}>{n}</span>;
}

const STATE_LABEL: Record<MatchdayState, string> = { played: "giocata", latest: "ultima con punti", upcoming: "da giocare" };

/**
 * Calendario come striscia di giornate (stato nell'URL, `?giornata=N`): giocate piene, l'ultima con punti con l'anello oro,
 * da giocare tratteggiate. All'apertura la giornata scelta scorre al centro.
 */
export function MatchdayStrip({ days, selected, hrefBase }: { days: { matchday: number; state: MatchdayState }[]; selected: number; hrefBase: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mask = edgeMask(useScrollEdges(ref));

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[aria-current]");
    const box = ref.current;
    if (!el || !box) return;
    // Posizione relativa alla striscia (offsetLeft è relativo all'offsetParent, che non è la striscia).
    const left = box.scrollLeft + el.getBoundingClientRect().left - box.getBoundingClientRect().left;
    box.scrollTo({ left: left - box.clientWidth / 2 + el.clientWidth / 2, behavior: "instant" });
  }, [selected]);

  return (
    <nav aria-label="Giornate" className="min-w-0">
      <div ref={ref} style={{ maskImage: mask }} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
        {days.map((d) => {
          const active = d.matchday === selected;
          const tone = active
            ? "border-nav bg-nav text-white dark:border-gold dark:bg-gold dark:text-nav"
            : d.state === "latest"
              ? "border-gold bg-gold/15 text-foreground ring-2 ring-gold/40"
              : d.state === "played"
                ? "border-line bg-surface-subtle text-foreground/80 hover:border-foreground/40"
                : "border-dashed border-line bg-surface text-muted hover:border-foreground/40";
          return (
            <Link
              key={d.matchday}
              href={`${hrefBase}?giornata=${d.matchday}`}
              scroll={false}
              aria-current={active ? "true" : undefined}
              aria-label={`Giornata ${d.matchday}, ${STATE_LABEL[d.state]}`}
              className={`font-display tnum grid h-11 min-w-11 shrink-0 place-items-center rounded-lg border px-2 text-xl leading-none font-extrabold transition-[background-color,border-color,color] ${tone}`}
            >
              <Num n={d.matchday} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
