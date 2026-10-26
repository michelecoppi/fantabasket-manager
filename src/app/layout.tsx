import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import "./globals.css";

// Testo: Archivo (grottesco sportivo, leggibile anche piccolo). Titoli e cifre: Big Shoulders (stile tabellone).
const body = Archivo({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Fantabasket Manager",
  description: "Gestionale della lega di fantabasket: rose, contratti, salary cap e draft.",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Fantabasket", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#060a14", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
