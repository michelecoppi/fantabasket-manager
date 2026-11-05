"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonClass } from "@/components/controls";
import { Icon } from "@/components/icons";
import { CHANGELOG, CHANGELOG_STORAGE_KEY, dateLabel, unseenEntries, type ChangelogEntry } from "@/lib/changelog";

/*
 * Finestra «Novità» (`lib/changelog.ts`): avvisa tutta la lega delle funzioni nuove, una volta a testa. Ricorda l'ultima voce vista
 * nel browser (`localStorage`), non nel database: nessuna scrittura nuova per i viewer. `<dialog>` modale con l'aspetto dei fogli
 * a comparsa (`.sheet`): dal basso su telefono, finestra centrata da 640 px.
 */

const noop = () => () => {};
/** Pausa prima di aprirsi da sola: la pagina finisce di comparire e un eventuale sorteggio del draft (anch'esso modale) passa per primo. */
const OPEN_DELAY_MS = 700;

function readSeen(): string | null {
  try {
    return localStorage.getItem(CHANGELOG_STORAGE_KEY);
  } catch {
    // storage bloccato: la finestra tornerà a ogni caricamento
    return null;
  }
}

function writeSeen(id: string) {
  try {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, id);
  } catch {
    // storage bloccato: niente da fare
  }
}

function ChangelogDialog({ entries, open, onClose }: { entries: readonly ChangelogEntry[]; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Due finestre possono stare nella stessa pagina (quella automatica del layout e quella del pulsante in Account).
  const titleId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Il focus va alla finestra stessa (letta dagli screen reader per titolo), non alla X: così non compare l'anello di focus all'apertura.
      d.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="sheet"
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // Un clic fuori dalla finestra (sullo sfondo) chiude, come per gli altri fogli.
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
      }}
    >
      <div className="arena px-5 pt-3 pb-5 sm:px-6 sm:pt-5">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="relative z-[2] flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold text-nav">
            <Icon name="star" size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-highlight">Novità</p>
            <h2 id={titleId} className="font-display mt-0.5 text-3xl leading-none font-black">
              Cosa c’è di nuovo
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Chiudi"
            className="-mt-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={20} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-line px-5 sm:px-6">
        {entries.map((e) => (
          <article key={e.id} className="py-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue dark:bg-gold/15 dark:text-gold">
                <Icon name={e.icon} size={20} strokeWidth={2.1} />
              </span>
              <div className="min-w-0">
                <p className="eyebrow text-muted">{dateLabel(e.date)}</p>
                <h3 className="font-display text-2xl leading-none font-extrabold">{e.title}</h3>
              </div>
            </div>
            <p className="mt-3 text-sm">{e.summary}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {e.items.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-0.5 shrink-0 text-success">
                    <Icon name="check" size={16} strokeWidth={2.6} />
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
            {e.cta && (
              <Link href={e.cta.href} onClick={close} className={buttonClass("gold", "mt-4 w-full sm:w-auto")}>
                {e.cta.label}
              </Link>
            )}
          </article>
        ))}
      </div>

      <div className="px-5 pt-1 pb-5 sm:px-6">
        <Button variant="secondary" className="w-full" onClick={close}>
          Ho capito
        </Button>
      </div>
    </dialog>
  );
}

/** Nel layout: all'accesso dopo una novità la finestra si apre da sola, una volta per browser. */
export function WhatsNew() {
  // Si legge il browser solo dopo l'idratazione: sul server e al primo render non c'è nulla (niente differenze da correggere).
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? <AutoWhatsNew /> : null;
}

function AutoWhatsNew() {
  const [entries] = useState(() => unseenEntries(CHANGELOG, readSeen()));
  const [open, setOpen] = useState(false);
  const pending = entries.length > 0;

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <ChangelogDialog
      entries={entries}
      open={open}
      onClose={() => {
        // Chiusa in qualunque modo (X, «Ho capito», Esc, sfondo, un link): da qui in poi vale come vista.
        writeSeen(entries[0].id);
        setOpen(false);
      }}
    />
  );
}

/** Per rivedere le novità a richiesta (pagina Account): le ultime voci, senza segnare nulla come visto. */
export function WhatsNewButton({ children = "Rivedi le novità" }: { children?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon="star" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ChangelogDialog entries={CHANGELOG.slice(0, 5)} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
