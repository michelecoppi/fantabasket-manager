import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // La validazione "instant" implicita segnala come errori le letture di sessione dell area per-utente: solo dove richiesto.
  // I dati cambiano di rado: le pagine già viste restano nella cache del router per 5 minuti (cambio scheda istantaneo).
  // Per i dati aggiornati c'è il pulsante "Aggiorna" nell'header (router.refresh()).
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
    staleTimes: { dynamic: 300, static: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
