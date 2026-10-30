import { cardPoints, fitDisplaySize, splitPoints, type MvpCardModel } from "@/lib/cards";
import { C, Crest, Crown, Frame, display, row } from "@/components/card-parts";

/** Card MVP della giornata (1200×630): il cognome, il tabellone dei punti e i tre piazzamenti dietro. Pezzi comuni in `card-parts.tsx`. */

export function MvpCardImage({ model, logo }: { model: MvpCardModel; logo: string }) {
  const { whole, decimals } = splitPoints(model.pts);
  // il cognome occupa fino a 690 px (a destra c'è il tabellone dei punti); Wembanyama o Gilgeous-Alexander si restringono
  const lastSize = fitDisplaySize(model.last, 660, 156, 56, 1);
  const chip = model.provisional ? `Giornata ${model.matchday} · provvisoria` : `Giornata ${model.matchday}`;
  const tied = model.tiedWith.length > 0;
  const meta = tied ? `A pari punti con ${model.tiedWith.join(" · ")}` : [model.position, model.role].filter(Boolean).join(" · ");
  return (
    <Frame logo={logo} chip={chip}>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 56, top: 146, width: 690 }}>
        <div style={{ ...row, ...display(800), gap: 14, fontSize: 30, letterSpacing: 7, color: C.gold }}>
          <Crown size={36} color={C.gold} />
          MVP della giornata
        </div>
        {model.first && <div style={{ ...display(800), display: "flex", marginTop: 14, fontSize: 62, letterSpacing: 3.5, lineHeight: 0.9, color: "#cfdcff" }}>{model.first}</div>}
        <div style={{ ...display(900), display: "flex", marginTop: model.first ? 0 : 14, fontSize: lastSize, lineHeight: 0.92, letterSpacing: 1, textShadow: "0 8px 0 rgba(0,0,0,0.28)" }}>{model.last}</div>
        <div style={{ ...row, marginTop: 20, gap: 16, fontSize: 24, color: "#cfd8f0" }}>
          <Crest name={model.teamName} color={model.teamColor} width={40} />
          <div style={{ display: "flex", fontWeight: 700, color: "#fff" }}>{model.teamName}</div>
          {meta && <div style={{ display: "flex", color: tied ? C.gold : "#97a3bd" }}>{meta}</div>}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          right: 56,
          top: 140,
          width: 372,
          borderRadius: 26,
          border: "2px solid rgba(255,255,255,0.14)",
          backgroundColor: "rgba(3,6,13,0.72)",
          boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", height: 6, backgroundImage: `linear-gradient(90deg, ${C.red}, ${C.blue}, ${C.gold})` }} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", paddingTop: 26, color: C.gold, textShadow: "0 0 30px rgba(248,194,74,0.55)" }}>
          <div style={{ ...display(900), display: "flex", fontSize: 178, lineHeight: 0.85 }}>{whole}</div>
          <div style={{ ...display(900), display: "flex", fontSize: 108, lineHeight: 0.85 }}>{`,${decimals}`}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 24px 20px", paddingTop: 14, borderTop: "2px solid rgba(255,255,255,0.12)", ...display(800), fontSize: 24, letterSpacing: 4, color: C.blueL }}>
          PDK della giornata
        </div>
      </div>

      {model.runnersUp.length > 0 && (
        <div style={{ display: "flex", position: "absolute", left: 56, right: 56, bottom: 58, gap: 12 }}>
          {model.runnersUp.map((r, i) => (
            <div key={`${r.name}-${i}`} style={{ ...row, flex: 1, minWidth: 0, maxWidth: 354, gap: 14, padding: "12px 18px", borderRadius: 16, border: "1.5px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(3,6,13,0.6)" }}>
              <div style={{ ...display(900), display: "flex", justifyContent: "center", width: 28, fontSize: 40, color: C.gold }}>{i + 2}</div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
                <div style={{ display: "block", fontWeight: 700, fontSize: 21, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ display: "block", fontSize: 15, color: "#97a3bd", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.teamName}</div>
              </div>
              <div style={{ ...display(800), display: "flex", fontSize: 36, color: C.blueL }}>{cardPoints(r.pts)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", position: "absolute", right: 56, bottom: 24, fontSize: 14, fontWeight: 700, color: "#b9c4e4" }}>Dati Dunkest</div>
    </Frame>
  );
}
