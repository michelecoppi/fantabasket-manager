// Font e logo delle card (src/assets/card): ImageResponse non vede i font di `next/font`, vuole i file TTF. Sono quelli di Google
// Fonts (licenza OFL, gli stessi di `layout.tsx`) nel subset latin-ext, che contiene anche il latino e serve per č, ć, š... dei
// cognomi NBA (con due file per famiglia Satori non cerca il glifo nel secondo). Letti una volta sola per processo; i percorsi
// sono scritti per intero perché il tracing dei file di Next li includa nella funzione su Vercel.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface CardAssets {
  fonts: { name: string; data: Buffer; weight: 500 | 700 | 800 | 900; style: "normal" }[];
  /** logo della lega come data URI (le card non hanno una rete da cui leggerlo) */
  logo: string;
}

async function read(): Promise<CardAssets> {
  const [display800, display900, body500, body700, logo] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/card/BigShouldersDisplay-800.ttf")),
    readFile(join(process.cwd(), "src/assets/card/BigShouldersDisplay-900.ttf")),
    readFile(join(process.cwd(), "src/assets/card/Archivo-500.ttf")),
    readFile(join(process.cwd(), "src/assets/card/Archivo-700.ttf")),
    readFile(join(process.cwd(), "src/assets/card/logo.png")),
  ]);
  return {
    fonts: [
      { name: "Display", data: display800, weight: 800, style: "normal" },
      { name: "Display", data: display900, weight: 900, style: "normal" },
      { name: "Body", data: body500, weight: 500, style: "normal" },
      { name: "Body", data: body700, weight: 700, style: "normal" },
    ],
    logo: `data:image/png;base64,${logo.toString("base64")}`,
  };
}

let cached: Promise<CardAssets> | null = null;

export function loadCardAssets(): Promise<CardAssets> {
  if (!cached) {
    cached = read().catch((e) => {
      cached = null; // un errore di lettura non resta in memoria per sempre
      throw e;
    });
  }
  return cached;
}
