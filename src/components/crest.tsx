import { ViewTransition } from "react";
import { monogram } from "@/lib/team-colors";

const sizes = { xs: 22, sm: 30, md: 42, lg: 64, xl: 104 } as const;

/**
 * Stemma di squadra: scudo nel colore della franchigia con monogramma. Non imita loghi NBA.
 * `morph`: lo stemma vola tra pagine (board → pagina squadra) con una view transition; il nome deve essere unico nella pagina.
 */
export function TeamCrest({
  name,
  color,
  size = "md",
  mine = false,
  morphId,
  className = "",
}: {
  name: string;
  color: string;
  size?: keyof typeof sizes;
  mine?: boolean;
  morphId?: string;
  className?: string;
}) {
  const px = sizes[size];
  const text = monogram(name);
  const svg = (
    <svg viewBox="0 0 40 48" width={px} height={px * 1.2} className={`shrink-0 drop-shadow-[0_3px_6px_rgb(6_10_20/0.25)] ${className}`} aria-hidden>
      <path d="M20 1.5 37.5 7v17c0 11-7.5 18.5-17.5 22.5C10 42.5 2.5 35 2.5 24V7Z" fill={color} stroke={mine ? "var(--gold)" : "rgb(255 255 255 / 0.9)"} strokeWidth={mine ? 2.6 : 1.4} />
      <path d="M20 5.5 33.5 9.8V24c0 8.8-5.8 15-13.5 18.4C12.3 39 6.5 32.8 6.5 24V9.8Z" fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth="1" />
      <path d="M20 1.5 37.5 7v6L2.5 31V7Z" fill="rgb(255 255 255 / 0.12)" />
      <text
        x="20"
        y={text.length > 1 ? 30 : 31}
        textAnchor="middle"
        fill="#fff"
        style={{ fontFamily: "var(--font-display), Impact, sans-serif", fontWeight: 900, fontSize: text.length > 1 ? 17 : 21, letterSpacing: "-0.02em" }}
      >
        {text}
      </text>
      {mine && <path d="m14.5 0 2.7 2.4L20-1l2.8 3.4L25.5 0l-1 4.2h-9Z" transform="translate(0 0.5)" fill="var(--gold)" />}
    </svg>
  );
  if (!morphId) return svg;
  return (
    <ViewTransition name={`crest-${morphId}`} share="crest" default="none">
      {svg}
    </ViewTransition>
  );
}
