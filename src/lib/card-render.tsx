// Disegno delle card fuori da una richiesta HTTP: il bot Telegram le manda come foto dal cron e dalle action admin, dove non
// c'è una route /card/... da chiamare (e non c'è nemmeno una sessione che la RLS riconosca). Stesso JSX delle route.
import { ImageResponse } from "next/og";
import { CARD_SIZE } from "@/components/card-parts";
import { TradeCardImage } from "@/components/card-scambio";
import { loadCardAssets } from "./card-assets";
import type { TradeCardModel } from "./trade-card";

/** PNG 1200×630 della card di uno scambio. */
export async function renderTradeCardPng(model: TradeCardModel): Promise<ArrayBuffer> {
  const { fonts, logo } = await loadCardAssets();
  return new ImageResponse(<TradeCardImage model={model} logo={logo} />, { ...CARD_SIZE, fonts }).arrayBuffer();
}
