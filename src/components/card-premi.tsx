import { C, Crest, Frame, display, row } from "@/components/card-parts";
import { Icon } from "@/components/icons";
import { AWARD_META } from "@/lib/awards-meta";
import { cardPoints, shortName, splitPoints, type AwardTileModel, type AwardsCardModel } from "@/lib/cards";

/** Card dei premi di una giornata (1200×630): la tessera grande (MVP) a sinistra, gli altri premi in due colonne da quattro. */

const TONE = {
  gold: { fg: C.gold, bg: "rgba(248,194,74,0.2)", edge: "rgba(248,194,74,0.5)", value: C.gold },
  blue: { fg: C.blueL, bg: "rgba(122,160,255,0.2)", edge: "rgba(255,255,255,0.12)", value: C.blueL },
  red: { fg: "#ff8a95", bg: "rgba(255,97,112,0.2)", edge: "rgba(255,138,149,0.38)", value: "#ff8a95" },
} as const;

const valueText = (t: AwardTileModel) => `${t.margin ? "+" : ""}${cardPoints(t.value)}`;
/** Nelle tessere piccole i giocatori si abbreviano («V. Wembanyama»): lo spazio è poco. */
const titleOf = (t: AwardTileModel) => (t.player ? shortName(t.title) : t.title);
const subtitleOf = (t: AwardTileModel) => (t.more > 0 ? `${t.subtitle} · +${t.more} ex aequo` : t.subtitle);

function Tile({ tile }: { tile: AwardTileModel }) {
  const meta = AWARD_META[tile.kind];
  const tone = TONE[meta.tone];
  return (
    <div style={{ ...row, flex: 1, minHeight: 0, gap: 12, padding: "0 16px 0 14px", borderRadius: 18, border: `2px solid ${tone.edge}`, backgroundColor: "rgba(3,6,13,0.58)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 12, backgroundColor: tone.bg, color: tone.fg, flexShrink: 0 }}>
        <Icon name={meta.icon} size={24} strokeWidth={2.1} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ ...display(800), display: "block", fontSize: 14, letterSpacing: 1.4, color: tone.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</div>
        <div style={{ display: "block", fontSize: 19, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titleOf(tile)}</div>
        <div style={{ display: "block", fontSize: 14, color: "#97a3bd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitleOf(tile)}</div>
      </div>
      <div style={{ ...display(900), display: "flex", fontSize: 31, color: tone.value, flexShrink: 0 }}>{valueText(tile)}</div>
    </div>
  );
}

function Hero({ tile }: { tile: AwardTileModel }) {
  const meta = AWARD_META[tile.kind];
  const { whole, decimals } = splitPoints(tile.value);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 350,
        padding: "20px 22px",
        borderRadius: 24,
        border: "2px solid rgba(248,194,74,0.55)",
        backgroundImage: "linear-gradient(160deg, rgba(248,194,74,0.22), rgba(3,6,13,0.66) 62%)",
      }}
    >
      <div style={{ ...row, gap: 12, ...display(800), fontSize: 24, letterSpacing: 5, color: C.gold }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(248,194,74,0.22)" }}>
          <Icon name={meta.icon} size={26} strokeWidth={2.1} />
        </div>
        {meta.label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", marginTop: 14, color: C.gold, textShadow: "0 0 30px rgba(248,194,74,0.5)" }}>
        <div style={{ ...display(900), display: "flex", fontSize: 128, lineHeight: 0.85 }}>{whole}</div>
        <div style={{ ...display(900), display: "flex", fontSize: 78, lineHeight: 0.85 }}>{`,${decimals}`}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <div style={{ ...row, gap: 12 }}>
          <Crest name={tile.teamName} color={tile.teamColor} width={34} />
          <div style={{ display: "flex", flex: 1, minWidth: 0, fontSize: 27, fontWeight: 700, lineHeight: 1.1, maxHeight: 60, overflow: "hidden" }}>{tile.title}</div>
        </div>
        <div style={{ display: "block", marginTop: 4, marginLeft: 46, fontSize: 17, color: "#97a3bd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitleOf(tile)}</div>
      </div>
    </div>
  );
}

export function AwardsCardImage({ model, logo }: { model: AwardsCardModel; logo: string }) {
  const chip = model.provisional ? `Giornata ${model.matchday} · provvisoria` : `Giornata ${model.matchday}`;
  const left = model.tiles.slice(0, 4);
  const right = model.tiles.slice(4, 8);
  return (
    <Frame logo={logo} chip={chip}>
      <div style={{ ...row, ...display(800), position: "absolute", left: 56, top: 142, gap: 14, fontSize: 30, letterSpacing: 7, color: C.gold }}>
        <Icon name="trophy" size={34} strokeWidth={2.1} />
        I premi della giornata
      </div>
      <div style={{ display: "flex", position: "absolute", left: 56, right: 56, top: 192, height: 366, gap: 16 }}>
        <Hero tile={model.hero} />
        <div style={{ display: "flex", flex: 1, gap: 12 }}>
          {[left, right].map((col, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10 }}>
              {col.map((t) => (
                <Tile key={t.kind} tile={t} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: 56, bottom: 24, fontSize: 14, fontWeight: 700, color: "#b9c4e4" }}>Punti contati: capitano 1,5×, panchina 0,5×</div>
    </Frame>
  );
}
