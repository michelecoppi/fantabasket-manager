import Link from "next/link";
import { Icon } from "@/components/icons";

export default function LegaNotFound() {
  return (
    <div className="arena mx-auto mt-6 max-w-lg rounded-2xl px-6 py-10 text-center">
      <span className="font-display outline-text block text-8xl leading-none font-black text-white/40">404</span>
      <p className="eyebrow mt-3 text-highlight">Air ball</p>
      <h1 className="font-display mt-1 text-5xl leading-none font-black">Pagina non trovata</h1>
      <p className="mt-3 text-sm text-white/70">Questa pagina non esiste oppure non hai i permessi per vederla.</p>
      <Link
        href="/"
        className="font-display mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-gold px-5 text-lg font-extrabold text-nav transition-[filter] hover:brightness-105"
      >
        <Icon name="ball" size={18} strokeWidth={2} />
        Torna alla lega
      </Link>
    </div>
  );
}
