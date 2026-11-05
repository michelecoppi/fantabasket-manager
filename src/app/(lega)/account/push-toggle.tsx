"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Callout } from "@/components/controls";
import { isIosSafari } from "@/lib/install";
import { removePushSubscription, savePushSubscription, sendTestPush } from "./actions";

/*
 * Notifiche push di questo dispositivo (docs/product/PIANO-NOTIFICHE-PUSH.md). Il service worker è `public/sw.js`, registrato solo
 * in produzione: in sviluppo non c'è. Su iPhone le notifiche esistono solo per l'app aggiunta alla schermata Home.
 */

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State =
  | { kind: "checking" }
  | { kind: "unsupported"; why: string }
  | { kind: "install" }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" };

type Notice = { tone: "good" | "bad"; text: string } | null;

const isStandalone = () => (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function detect(): Promise<State> {
  if (process.env.NODE_ENV !== "production") return { kind: "unsupported", why: "Le notifiche funzionano solo sul sito pubblicato, non in sviluppo." };
  if (!KEY) return { kind: "unsupported", why: "Le notifiche non sono ancora attive sul sito: manca la configurazione sul server." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // Safari su iPhone espone le notifiche solo all'app installata.
    if (isIosSafari(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone()) return { kind: "install" };
    return { kind: "unsupported", why: "Questo browser non supporta le notifiche." };
  }
  if (Notification.permission === "denied") return { kind: "denied" };
  const sub = await currentSubscription();
  if (sub && Notification.permission === "granted") {
    // Il dispositivo si riregistra a ogni visita: segue l'account con cui si è entrati e riappare se il database l'aveva tolto.
    const json = sub.toJSON();
    void savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
    return { kind: "on" };
  }
  return { kind: "off" };
}

export function PushToggle({ admin }: { admin: boolean }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    detect()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState({ kind: "unsupported", why: "Non riesco a controllare le notifiche di questo dispositivo." }));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    start(async () => {
      setNotice(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState({ kind: permission === "denied" ? "denied" : "off" });
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
        const json = sub.toJSON();
        const res = await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
        if (!res.ok) {
          await sub.unsubscribe().catch(() => false);
          setNotice({ tone: "bad", text: res.error });
          return;
        }
        setState({ kind: "on" });
        setNotice({ tone: "good", text: res.message });
      } catch {
        setNotice({ tone: "bad", text: "Non sono riuscito ad attivare le notifiche su questo dispositivo. Riprova tra poco." });
      }
    });

  const disable = () =>
    start(async () => {
      setNotice(null);
      try {
        const sub = await currentSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await removePushSubscription(endpoint);
        }
        setState({ kind: "off" });
        setNotice({ tone: "good", text: "Notifiche disattivate su questo dispositivo." });
      } catch {
        setNotice({ tone: "bad", text: "Non sono riuscito a disattivare le notifiche. Riprova tra poco." });
      }
    });

  const test = () =>
    start(async () => {
      setNotice(null);
      const res = await sendTestPush();
      setNotice(res.ok ? { tone: "good", text: res.message } : { tone: "bad", text: res.error });
    });

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>
        Ricevi un avviso sul telefono quando una squadra ti propone uno scambio, risponde alla tua proposta o un admin la approva o la
        respinge.{admin && " Da admin, anche quando una proposta aspetta la tua approvazione."}
      </p>

      {state.kind === "checking" && <p className="text-muted">Controllo le notifiche di questo dispositivo…</p>}
      {state.kind === "unsupported" && <Callout tone="info">{state.why}</Callout>}
      {state.kind === "install" && (
        <Callout tone="info" title="Prima installa l’app">
          Su iPhone le notifiche funzionano solo con l’app aggiunta alla schermata Home: segui i passi qui sotto, aprila da lì e torna in questa pagina.
        </Callout>
      )}
      {state.kind === "denied" && (
        <Callout tone="warn" title="Notifiche bloccate">
          Hai bloccato le notifiche per questo sito. Riattivale dalle impostazioni del browser o del telefono, poi torna qui.
        </Callout>
      )}
      {state.kind === "off" && (
        <div>
          <Button icon="bell" onClick={enable} pending={pending}>
            Attiva le notifiche
          </Button>
        </div>
      )}
      {state.kind === "on" && (
        <>
          <p className="font-semibold text-success">Le notifiche sono attive su questo dispositivo.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon="bell" onClick={test} pending={pending}>
              Invia un avviso di prova
            </Button>
            <Button variant="ghost" onClick={disable} pending={pending}>
              Disattiva
            </Button>
          </div>
        </>
      )}

      {notice && <Callout tone={notice.tone}>{notice.text}</Callout>}
    </div>
  );
}
