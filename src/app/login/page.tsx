"use client";

import { useActionState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};
const field =
  "w-full rounded border border-line bg-surface px-3 py-2 text-base";
const button =
  "w-full font-display rounded bg-brand-red px-3 py-2 text-lg font-bold text-white disabled:opacity-60";

export default function LoginPage() {
  const [pw, pwAction, pwPending] = useActionState(signInWithPassword, initial);
  const [ml, mlAction, mlPending] = useActionState(sendMagicLink, initial);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
      <div className="h-2 bg-gradient-to-r from-brand-blue to-brand-red" />
      <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-display text-4xl leading-none font-extrabold">🏀 Fantabasket <span className="text-brand-red">Manager</span></h1>
        <p className="text-sm text-muted">Accedi per vedere la lega.</p>
      </div>

      <form action={pwAction} className="flex flex-col gap-3">
        <input name="email" type="email" autoComplete="email" placeholder="Email" className={field} />
        <input name="password" type="password" autoComplete="current-password" placeholder="Password" className={field} />
        <button disabled={pwPending} className={button}>
          {pwPending ? "Accesso…" : "Accedi"}
        </button>
        {pw.error && <p role="alert" className="text-sm text-red-600">{pw.error}</p>}
      </form>

      <form action={mlAction} className="flex flex-col gap-3 border-t border-line pt-5">
        <p className="text-sm text-muted">Oppure ricevi un link di accesso via email.</p>
        <input name="email" type="email" autoComplete="email" placeholder="Email" className={field} />
        <button disabled={mlPending} className={`${button} !bg-brand-blue`}>
          {mlPending ? "Invio…" : "Invia link"}
        </button>
        {ml.error && <p role="alert" className="text-sm text-red-600">{ml.error}</p>}
        {ml.info && <p className="text-sm text-green-600">{ml.info}</p>}
      </form>
    </div>
      </div>
    </main>
  );
}
