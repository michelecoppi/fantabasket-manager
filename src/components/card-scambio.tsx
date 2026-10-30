import type { CSSProperties } from "react";
import { C, Crest, Frame, display, row, rgba } from "@/components/card-parts";
import type { Position } from "@/lib/cap";
import { fitDisplaySize } from "@/lib/cards";
import type { TradeCardItem, TradeCardModel, TradeCardTeam } from "@/lib/trade-card";

/** Card dello scambio eseguito (1200×630): una carta per squadra con ciò che riceve, medaglione ⇄ al centro, battuta del bot in fondo. */

const POS_COLOR: Record<Position, { bg: string; fg: string }> = { G: { bg: C.blue, fg: "#fff" }, A: { bg: "#f4b42a", fg: C.ink }, C: { bg: C.red, fg: "#fff" } };

function Exchange({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10h14l-4 -4" />
      <path d="M17 14h-14l4 4" />
    </svg>
  );
}

function Chip({ item }: { item: TradeCardItem }) {
  const pos = item.kind === "player" && item.pos ? POS_COLOR[item.pos] : null;
  const letter = item.kind === "player" ? (item.pos ?? "?") : item.kind === "talent" ? "T" : "P";
  const style: CSSProperties = pos ? { backgroundColor: pos.bg, color: pos.fg } : { backgroundColor: "#2a3560", color: C.gold };
  return <div style={{ ...display(900), display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, fontSize: 19, flexShrink: 0, ...style }}>{letter}</div>;
}

function Side({ team, count }: { team: TradeCardTeam; count: number }) {
  const compact = count > 2;
  // Spazio per il nome e corpo delle righe: con tre o quattro squadre le carte si stringono
  const nameWidth = count === 2 ? 390 : count === 3 ? 240 : 160;
  const rowFont = count === 2 ? 24 : count === 3 ? 21 : 18;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        flex: 1,
        minWidth: 0,
        padding: compact ? "20px 20px 20px 26px" : "22px 30px 22px 34px",
        borderRadius: 24,
        border: "2px solid rgba(255,255,255,0.14)",
        backgroundImage: `linear-gradient(135deg, ${rgba(team.color, 0.55)}, rgba(5, 9, 20, 0.8) 75%)`,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, display: "flex", backgroundColor: team.color }} />
      <div style={{ ...row, gap: 14 }}>
        <Crest name={team.name} color={team.color} width={compact ? 38 : 46} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <div style={{ ...display(800), display: "flex", fontSize: 17, letterSpacing: 5, color: C.gold }}>Riceve</div>
          <div style={{ ...display(900), display: "block", fontSize: fitDisplaySize(team.name, nameWidth, compact ? 34 : 44, 18), lineHeight: 0.95, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {team.items.map((it, i) => (
          <div key={`${it.label}-${i}`} style={{ ...row, gap: 12, height: 44, padding: "0 12px", borderRadius: 11, backgroundColor: "rgba(3,6,13,0.5)" }}>
            <Chip item={it} />
            <div style={{ display: "block", flex: 1, minWidth: 0, fontSize: rowFont, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</div>
            {it.detail && !compact && <div style={{ display: "flex", fontSize: 18, color: "#97a3bd", flexShrink: 0 }}>{it.detail}</div>}
          </div>
        ))}
        {team.items.length === 0 && <div style={{ display: "flex", fontSize: 20, color: "#97a3bd" }}>Niente: solo il posto libero</div>}
        {team.more > 0 && <div style={{ display: "flex", fontSize: 18, color: C.blueL, paddingLeft: 4 }}>{`…e altri ${team.more}`}</div>}
      </div>
    </div>
  );
}

const HOW_MANY: Record<number, string> = { 3: "a tre", 4: "a quattro" };

export function TradeCardImage({ model, logo }: { model: TradeCardModel; logo: string }) {
  const compact = model.teams.length > 2;
  const title = `Scambio ufficiale${HOW_MANY[model.teams.length] ? ` ${HOW_MANY[model.teams.length]}` : ""}`;
  return (
    <Frame logo={logo} chip={model.dateLabel || "Scambio"}>
      <div style={{ ...row, ...display(800), position: "absolute", left: 56, top: 142, gap: 14, fontSize: 30, letterSpacing: 7, color: C.gold }}>
        <Exchange size={36} color={C.gold} />
        {title}
      </div>
      <div style={{ display: "flex", position: "absolute", left: 56, right: 56, top: 192, height: 316, gap: compact ? 14 : 28 }}>
        {model.teams.map((t) => (
          <Side key={t.name} team={t} count={model.teams.length} />
        ))}
      </div>
      {!compact && (
        <div
          style={{
            ...row,
            justifyContent: "center",
            position: "absolute",
            left: 562,
            top: 312,
            width: 76,
            height: 76,
            borderRadius: 999,
            backgroundColor: C.gold,
            boxShadow: "0 0 0 8px #0a1022, 0 0 40px rgba(248,194,74,0.5)",
          }}
        >
          <Exchange size={38} color={C.ink} />
        </div>
      )}
      <div style={{ ...row, position: "absolute", left: 56, right: 56, bottom: 50, gap: 20 }}>
        <div
          style={{
            ...row,
            flexShrink: 0,
            padding: "9px 18px",
            borderRadius: 999,
            fontSize: 19,
            fontWeight: 700,
            color: model.capOverride ? C.gold : C.good,
            backgroundColor: model.capOverride ? "rgba(248,194,74,0.14)" : "rgba(123,227,180,0.14)",
          }}
        >
          {model.capOverride ? "Eccezione al cap" : "Cap in regola"}
        </div>
        {model.quip && (
          <div style={{ display: "flex", flex: 1, fontSize: 20, lineHeight: 1.3, color: "#d8e1fb", maxHeight: 54, overflow: "hidden" }}>{`«${model.quip}»`}</div>
        )}
      </div>
    </Frame>
  );
}
