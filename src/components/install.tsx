"use client";

import { useState, useSyncExternalStore } from "react";
import { isIosSafari } from "@/lib/install";

const DISMISSED_KEY = "install-hint-dismissed";

const noop = () => () => {};
// Aperta dall'icona in Home: niente barra del browser (iOS usa navigator.standalone, gli altri browser display-mode).
const isStandalone = () => (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
const shouldHint = () => isIosSafari(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone();

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // storage bloccato: il suggerimento resta visibile
    return false;
  }
}

/** Suggerimento per chi apre il sito in Safari su iPhone: senza app in Home non c'è modo di installarla. */
export function InstallHint() {
  const show = useSyncExternalStore(noop, shouldHint, () => false);
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!show || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // storage bloccato: il suggerimento torna al prossimo caricamento
    }
  };

  return (
    <section className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-sm shadow">
      <p className="flex-1">
        Aggiungi Fantabasket alla schermata Home per aprirla come un’app: tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.
      </p>
      <button type="button" onClick={dismiss} aria-label="Chiudi il suggerimento" className="text-muted hover:text-foreground">
        ✕
      </button>
    </section>
  );
}

/** Passi per installare da Safari: su iOS non c'è un prompt, vanno spiegati. */
export function InstallSteps() {
  const standalone = useSyncExternalStore(noop, isStandalone, () => false);
  if (standalone) return <p className="text-sm text-muted">L’app è già installata: aprila dall’icona in Home.</p>;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>Su iPhone apri il sito in Safari e segui questi passi:</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Tocca il pulsante <b>Condividi</b> (il quadrato con la freccia verso l’alto).
        </li>
        <li>
          Scorri e scegli <b>Aggiungi alla schermata Home</b>.
        </li>
        <li>
          Tocca <b>Aggiungi</b>: l’icona compare in Home. Aprila da lì per usare l’app a schermo intero.
        </li>
      </ol>
      <p className="text-muted">Su Android o computer usa «Installa app» o «Aggiungi a schermata Home» nel menu del browser.</p>
    </div>
  );
}
