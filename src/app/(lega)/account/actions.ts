"use server";

import { headers } from "next/headers";
import { rpcError } from "@/lib/action-result";
import { passwordError } from "@/lib/password";
import { sendPushTest } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export interface PasswordState {
  error?: string;
  done?: boolean;
}

/** Imposta o cambia la password dell'utente loggato (anche chi è entrato col link email). */
export async function updatePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const invalid = passwordError(password, confirm);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Sessione scaduta: accedi di nuovo." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "La nuova password è uguale a quella attuale." };
    if (error.code === "weak_password") return { error: "Password troppo debole: scegline una più lunga o meno comune." };
    if (error.code === "reauthentication_needed") return { error: "Per sicurezza esci e rientra col link email, poi riprova." };
    return { error: "Impossibile salvare la password. Riprova tra poco." };
  }
  return { done: true };
}

// ---------- Notifiche push (docs/product/PIANO-NOTIFICHE-PUSH.md) ----------
export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushActionResult = { ok: true; message: string } | { ok: false; error: string };

const isText = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 2048;

/** Registra il dispositivo dell'utente (RPC `push_subscribe`: agisce solo sull'utente di chi chiama). */
export async function savePushSubscription(input: PushSubscriptionInput): Promise<PushActionResult> {
  if (!isText(input?.endpoint) || !isText(input?.p256dh) || !isText(input?.auth)) return { ok: false, error: "Dati non validi." };
  const db = await createClient();
  const { error } = await db.rpc("push_subscribe", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: (await headers()).get("user-agent") ?? "",
  });
  if (error) {
    const failure = rpcError(error.message);
    return { ok: false, error: failure.ok ? "Operazione non riuscita." : failure.error };
  }
  return { ok: true, message: "Notifiche attivate su questo dispositivo." };
}

export async function removePushSubscription(endpoint: string): Promise<PushActionResult> {
  if (!isText(endpoint)) return { ok: false, error: "Dati non validi." };
  const db = await createClient();
  const { error } = await db.rpc("push_unsubscribe", { p_endpoint: endpoint });
  if (error) return { ok: false, error: "Non sono riuscito a disattivare le notifiche. Riprova tra poco." };
  return { ok: true, message: "Notifiche disattivate su questo dispositivo." };
}

/** Avviso di prova ai dispositivi dell'utente, per controllare che arrivi davvero. */
export async function sendTestPush(): Promise<PushActionResult> {
  const db = await createClient();
  const res = await sendPushTest(db);
  return res.ok ? { ok: true, message: res.sent === 1 ? "Avviso inviato: dovrebbe comparire tra pochi secondi." : `Avviso inviato a ${res.sent} dispositivi.` } : res;
}
