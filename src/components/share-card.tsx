"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/controls";
import { Icon } from "@/components/icons";

/*
 * «Condividi» una card (immagine generata da /card/...): pulsante tondo + foglio a comparsa (popover nativo, come la scheda
 * giocatore: dal basso su telefono, finestra centrata da `sm`). L'anteprima è un <img loading="lazy"> dentro un popover chiuso, quindi
 * la card si genera solo quando il foglio si apre. «Condividi» passa il file al foglio di condivisione del telefono
 * (`navigator.share`, quindi Telegram/WhatsApp/Stories); dove non c'è (desktop) restano «Salva» e l'anteprima.
 */

const noSubscribe = () => () => {};
const canShareNative = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** `label`: pulsante con testo (pillola) invece del cerchio con la sola icona; `sheetTitle`: titolo del foglio («Condividi la card» se manca). */
export function ShareCard({
  src,
  title,
  filename,
  className = "",
  label,
  sheetTitle = "Condividi la card",
  note = "Immagine 1200×630, con i punti come li dà Dunkest.",
}: {
  src: string;
  title: string;
  filename: string;
  className?: string;
  label?: string;
  sheetTitle?: string;
  /** riga sotto i pulsanti */
  note?: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const native = useSyncExternalStore(noSubscribe, canShareNative, () => false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], filename, { type: "image/png" });
      if (!navigator.canShare?.({ files: [file] })) throw new Error("file non condivisibili");
      await navigator.share({ files: [file], title });
    } catch (e) {
      // Chi chiude il foglio di condivisione senza scegliere non è un errore.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Non riesco a condividere la card da qui. Salvala e mandala a mano.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={`Condividi: ${title}`}
        className={`${label ? "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold" : "grid h-11 w-11 place-items-center rounded-full"} shrink-0 cursor-pointer bg-foreground/10 text-foreground/80 transition-[background-color,color,transform] hover:bg-foreground/20 hover:text-foreground active:scale-95 ${className}`}
      >
        <Icon name="share" size={20} strokeWidth={2.1} />
        {label}
      </button>
      <div id={id} popover="auto" role="dialog" aria-labelledby={titleId} className="sheet">
        <div className="p-4 sm:p-5">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-foreground/20 sm:hidden" />
          <div className="mb-3 flex items-center gap-3">
            <h2 id={titleId} className="font-display min-w-0 flex-1 truncate text-3xl leading-none font-black">
              {sheetTitle}
            </h2>
            <button
              type="button"
              popoverTarget={id}
              popoverTargetAction="hide"
              aria-label="Chiudi"
              className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <Icon name="x" size={20} strokeWidth={2.2} />
            </button>
          </div>
          {/* L'anteprima occupa già il suo spazio (1200×630) e si accende quando arriva: niente salti e uno scheletro intanto. */}
          <div className={`relative aspect-[1200/630] overflow-hidden rounded-xl border border-line bg-surface-subtle ${ready ? "" : "skeleton"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- immagine dinamica dietro login, next/image non serve */}
            <img src={src} alt={`Anteprima: ${title}`} loading="lazy" width={1200} height={630} onLoad={() => setReady(true)} className="h-full w-full object-cover" />
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
            {native && (
              <Button onClick={share} pending={busy} icon="share" className="sm:flex-1">
                Condividi
              </Button>
            )}
            <a
              href={`${src}?scarica=1`}
              download={filename}
              className="font-display inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 text-lg font-extrabold tracking-wide transition-colors hover:border-brand-blue hover:text-brand-blue"
            >
              <Icon name="download" size={18} strokeWidth={2.1} />
              Salva immagine
            </a>
          </div>
          <p className="mt-3 text-xs text-muted">{note}</p>
        </div>
      </div>
    </>
  );
}
