// Disegna le card da condividere con dati di esempio e le salva come PNG, senza server né database: serve a vedere il risultato
// di ImageResponse mentre si ritocca `components/card-*.tsx`.
// Uso: npx tsx scripts/card-preview.tsx <file.png> [mvp|premi|scambio] [variante]
//   mvp: base | lungo | corto | pari      premi: base | pochi      scambio: due | tre | quattro | lungo
import { writeFile } from "node:fs/promises";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { AwardsCardImage } from "../src/components/card-premi";
import { MvpCardImage } from "../src/components/card-mvp";
import { CARD_SIZE } from "../src/components/card-parts";
import { TradeCardImage } from "../src/components/card-scambio";
import { loadCardAssets } from "../src/lib/card-assets";
import type { AwardTileModel, AwardsCardModel, MvpCardModel } from "../src/lib/cards";
import type { TradeCardItem, TradeCardModel } from "../src/lib/trade-card";

const mvp: MvpCardModel = {
  matchday: 4,
  provisional: false,
  first: "Nikola",
  last: "Jokić",
  teamName: "Bol Bollerz",
  teamColor: "#1d47b5",
  pts: 68.5,
  position: "Centro",
  role: "In quintetto",
  tiedWith: [],
  runnersUp: [
    { name: "L. Dončić", teamName: "Chicago Spaccinos", pts: 61 },
    { name: "S. Gilgeous-Alexander", teamName: "OKCC", pts: 58.5 },
    { name: "J. Tatum", teamName: "Dame Time", pts: 57 },
  ],
};
const mvpVariants: Record<string, MvpCardModel> = {
  base: mvp,
  lungo: { ...mvp, first: "Victor", last: "Wembanyama", teamName: "Dame Time", teamColor: "#c75d0c", pts: 67.2, role: "Capitano", position: "Centro", provisional: true },
  corto: { ...mvp, first: "", last: "Yao", pts: 41, position: null, runnersUp: [{ name: "Wemby", teamName: "OKCC", pts: 38 }] },
  pari: { ...mvp, tiedWith: ["Luka Dončić"], runnersUp: mvp.runnersUp.slice(1) },
};

const tile = (kind: AwardTileModel["kind"], title: string, subtitle: string, value: number, teamName: string, teamColor: string, extra: Partial<AwardTileModel> = {}): AwardTileModel => ({
  kind, title, subtitle, teamName, teamColor, value, player: !subtitle.startsWith("contro") && !subtitle.startsWith("su ") && title !== teamName, margin: false, more: 0, ...extra,
});
const awards: AwardsCardModel = {
  matchday: 4,
  provisional: false,
  hero: tile("mvp", "Victor Wembanyama", "Dame Time", 67.2, "Dame Time", "#c75d0c"),
  tiles: [
    tile("captain_best", "Victor Wembanyama", "Dame Time", 67.2, "Dame Time", "#c75d0c"),
    tile("sixth_man", "Scottie Barnes", "OKCC", 41.74, "OKCC", "#b3246f"),
    tile("bench", "Max Strus", "Bol Bollerz", 33.1, "Bol Bollerz", "#1d47b5"),
    tile("team_best", "Chicago Spaccinos", "contro OKCC", 254.99, "Chicago Spaccinos", "#6a3fc6"),
    tile("blowout", "Dame Time", "su CUS Cosenza", 80.33, "Dame Time", "#c75d0c", { margin: true }),
    tile("photo_finish", "Bol Bollerz", "su San Antonio Spurs", 0.5, "Bol Bollerz", "#1d47b5", { margin: true, more: 1 }),
    tile("captain_worst", "Gary Trent Jr.", "Atlanto Non Vinco", 2, "Atlanto Non Vinco", "#9c6f00"),
    tile("team_worst", "San Antonio Spurs", "contro Bol Bollerz", 147.63, "San Antonio Spurs", "#0e7f5a"),
  ],
};
const awardsVariants: Record<string, AwardsCardModel> = { base: awards, pochi: { ...awards, provisional: true, hero: awards.tiles[3], tiles: awards.tiles.slice(4, 6) } };

const player = (label: string, pos: TradeCardItem["pos"], detail: string): TradeCardItem => ({ kind: "player", label, detail, pos });
const pick: TradeCardItem = { kind: "pick", label: "Pick 2027 · 1° giro", detail: "di OKCC", pos: null };
const talent: TradeCardItem = { kind: "talent", label: "M. Brown Jr.", detail: "diritti · draft 2026", pos: null };
const trade: TradeCardModel = {
  id: 7,
  dateLabel: "29 ott",
  capOverride: false,
  quip: "Il pacco della settimana: uno prende il PDK, l'altro il sollievo salariale.",
  teams: [
    { name: "OKCC", color: "#b3246f", items: [player("Jarrett Allen", "C", "18 cr"), player("Cam Thomas", "G", "12 cr · riserva")], more: 0, hidden: [] },
    { name: "Chicago Spaccinos", color: "#6a3fc6", items: [player("Jalen Williams", "G", "24 cr"), pick, talent], more: 0, hidden: [] },
  ],
};
const tradeVariants: Record<string, TradeCardModel> = {
  due: trade,
  tre: {
    ...trade,
    capOverride: true,
    teams: [
      { ...trade.teams[0], items: [player("Jarrett Allen", "C", "18 cr"), player("Shai Gilgeous-Alexander", "G", "41 cr"), pick], more: 2, hidden: ["Altro"] },
      trade.teams[1],
      { name: "Dame Time", color: "#c75d0c", items: [player("Cam Thomas", "G", "12 cr")], more: 0, hidden: [] },
    ],
  },
  quattro: {
    ...trade,
    teams: [
      trade.teams[0],
      trade.teams[1],
      { name: "Dame Time", color: "#c75d0c", items: [player("Cam Thomas", "G", "12 cr"), pick], more: 0, hidden: [] },
      { name: "San Antonio Spurs", color: "#0e7f5a", items: [], more: 0, hidden: [] },
    ],
  },
  lungo: {
    ...trade,
    quip: "Rapina a mano armata: Chicago Spaccinos si prende 14,2 PDK a partita in più. OKCC ha firmato senza leggere, e ora chiede anche il resto della trattativa, compresi i caffè.",
    teams: [{ ...trade.teams[0], items: [player("Shai Gilgeous-Alexander", "G", "41 cr"), player("Giannis Antetokounmpo", "A", "38 cr"), pick, talent], more: 3, hidden: ["Altro"] }, trade.teams[1]],
  },
};

async function main() {
  const [out, kind = "mvp", variant] = process.argv.slice(2);
  const { fonts, logo } = await loadCardAssets();
  let element: ReactElement;
  if (kind === "mvp") element = <MvpCardImage model={mvpVariants[variant ?? "base"] ?? mvp} logo={logo} />;
  else if (kind === "premi") element = <AwardsCardImage model={awardsVariants[variant ?? "base"] ?? awards} logo={logo} />;
  else if (kind === "scambio") element = <TradeCardImage model={tradeVariants[variant ?? "due"] ?? trade} logo={logo} />;
  else throw new Error("Uso: card-preview.tsx <file.png> [mvp|premi|scambio] [variante]");
  if (!out) throw new Error("Manca il file di uscita.");
  const res = new ImageResponse(element, { ...CARD_SIZE, fonts });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log(`${kind}${variant ? `:${variant}` : ""} → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
