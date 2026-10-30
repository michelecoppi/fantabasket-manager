// Risposte comuni delle route /card/...: messaggi di errore in chiaro e PNG con le intestazioni giuste.
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { CARD_SIZE } from "@/components/card-parts";
import { loadCardAssets } from "./card-assets";

export const cardText = (message: string, status: number) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Numero intero positivo da un segmento dell'URL («4»), 0 se non lo è. */
export const cardParam = (raw: string) => (/^\d{1,9}$/.test(raw) ? Number(raw) : 0);

/**
 * PNG 1200×630 della card. Le card stanno dietro il login: `ImageResponse` metterebbe «public, immutable», che qui sarebbe
 * sbagliato; `?scarica=1` aggiunge il nome del file per il download.
 */
export async function cardImage(render: (logo: string) => ReactElement, request: Request, filename: string): Promise<Response> {
  const { fonts, logo } = await loadCardAssets();
  const download = new URL(request.url).searchParams.has("scarica");
  return new ImageResponse(render(logo), {
    ...CARD_SIZE,
    fonts,
    headers: {
      "cache-control": "private, max-age=300",
      ...(download ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
