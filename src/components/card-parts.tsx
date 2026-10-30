/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) disegna <img>, non next/image */
import type { CSSProperties, ReactNode } from "react";
import { monogram } from "@/lib/team-colors";

/*
 * Pezzi comuni delle card da condividere (1200×630), disegnate per ImageResponse/Satori: solo flexbox, stili inline, niente grid
 * né `color-mix`; i colori sono quelli di `globals.css` nel tema scuro (le card sono sempre «Arena Night» notte). Famiglie
 * `Display` (Big Shoulders) e `Body` (Archivo) caricate da `lib/card-assets.ts`.
 */

export const CARD_SIZE = { width: 1200, height: 630 } as const;

export const C = { blue: "#1d47b5", blueL: "#7aa0ff", red: "#cf2338", redL: "#ff6170", gold: "#f8c24a", ink: "#03060d", good: "#7be3b4" } as const;
/** «#1d47b5» + 0.5 → «rgba(29, 71, 181, 0.5)»: Satori non ha `color-mix`, quindi le tinte di squadra si scrivono così. */
export function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(29, 71, 181, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}
export const display = (weight: 800 | 900): CSSProperties => ({ fontFamily: "Display", fontWeight: weight, textTransform: "uppercase" });
export const row: CSSProperties = { display: "flex", alignItems: "center" };

export function Crest({ name, color, width }: { name: string; color: string; width: number }) {
  const height = (width * 48) / 40;
  return (
    <div style={{ display: "flex", position: "relative", width, height }}>
      <svg width={width} height={height} viewBox="0 0 40 48" style={{ position: "absolute", left: 0, top: 0 }}>
        <path d="M20 1.5 37.5 7v17c0 11-7.5 18.5-17.5 22.5C10 42.5 2.5 35 2.5 24V7Z" fill={color} stroke="rgba(255,255,255,0.92)" strokeWidth="1.6" />
        <path d="M20 5.5 33.5 9.8V24c0 8.8-5.8 15-13.5 18.4C12.3 39 6.5 32.8 6.5 24V9.8Z" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
        <path d="M20 1.5 37.5 7v6L2.5 31V7Z" fill="rgba(255,255,255,0.12)" />
      </svg>
      <div style={{ ...display(900), display: "flex", position: "absolute", left: 0, right: 0, top: height * 0.4, justifyContent: "center", fontSize: width * 0.4, color: "#fff", letterSpacing: -0.5 }}>{monogram(name)}</div>
    </div>
  );
}

export function Crown({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6" />
    </svg>
  );
}

/** Linee del campo (metà campo a destra, cerchio di centro a sinistra), come la superficie `.arena` del sito. */
export function Court() {
  const line = "rgba(255,255,255,0.075)";
  return (
    <svg width={1200} height={630} viewBox="0 0 1200 630" fill="none" style={{ position: "absolute", left: 0, top: 0 }}>
      <rect x="-20" y="30" width="1240" height="570" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
      <path d="M1170 -50 A470 470 0 0 0 1170 680" stroke={line} strokeWidth="3" />
      <circle cx="1170" cy="315" r="170" stroke={line} strokeWidth="3" />
      <rect x="1010" y="215" width="190" height="200" stroke={line} strokeWidth="3" />
      <circle cx="1128" cy="315" r="26" stroke={line} strokeWidth="3" />
      <path d="M1100 285V345" stroke={line} strokeWidth="5" />
      <circle cx="0" cy="315" r="110" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
    </svg>
  );
}

export function Frame({ logo, chip, children }: { logo: string; chip: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_SIZE.width,
        height: CARD_SIZE.height,
        color: "#fff",
        fontFamily: "Body",
        fontWeight: 500,
        backgroundColor: "#0a1022",
        backgroundImage:
          "radial-gradient(circle at 100% 0%, rgba(29,71,181,0.8) 0px, rgba(29,71,181,0) 640px), radial-gradient(circle at 0% 100%, rgba(207,35,56,0.55) 0px, rgba(207,35,56,0) 560px)",
      }}
    >
      <Court />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 8, display: "flex", backgroundImage: `linear-gradient(90deg, ${C.red}, ${C.blue} 55%, ${C.gold})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, display: "flex", backgroundImage: `linear-gradient(90deg, ${C.gold}, ${C.blue} 45%, ${C.red})` }} />
      <div style={{ ...row, position: "absolute", left: 56, right: 56, top: 34, gap: 18 }}>
        <img src={logo} width={63} height={84} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...display(800), display: "flex", fontSize: 30, letterSpacing: 4 }}>Fantabasket</div>
          <div style={{ display: "flex", fontSize: 14, color: "#b9c4e4", letterSpacing: 1 }}>League office</div>
        </div>
        <div
          style={{ ...row, ...display(800), marginLeft: "auto", gap: 10, fontSize: 24, letterSpacing: 4, padding: "10px 22px", borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.16)", backgroundColor: "rgba(3,6,13,0.55)" }}
        >
          <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, backgroundColor: C.redL }} />
          {chip}
        </div>
      </div>
      {children}
    </div>
  );
}
