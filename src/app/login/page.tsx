"use client";

import { useActionState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};
const field =
  "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-base dark:border-neutral-700";
const button =
  "w-full rounded-lg bg-orange-600 px-3 py-2 font-medium text-white disabled:opacity-60";

export default function LoginPage() {
  const [pw, pwAction, pwPending] = useActionState(signInWithPassword, initial);
  const [ml, mlAction, mlPending] = useActionState(sendMagicLink, initial);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Fantabasket Manager</h1>
        <p className="text-sm text-neutral-500">Accedi per vedere la lega.</p>
      </div>

      <form action={pwAction} className="flex flex-col gap-3">
        <input name="email" type="email" autoComplete="email" placeholder="Email" className={field} />
        <input name="password" type="password" autoComplete="current-password" placeholder="Password" className={field} />
        <button disabled={pwPending} className={button}>
          {pwPending ? "Accesso…" : "Accedi"}
        </button>
        {pw.error && <p role="alert" className="text-sm text-red-600">{pw.error}</p>}
      </form>

      <form action={mlAction} className="flex flex-col gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">Oppure ricevi un link di accesso via email.</p>
        <input name="email" type="email" autoComplete="email" placeholder="Email" className={field} />
        <button disabled={mlPending} className={`${button} !bg-neutral-700`}>
          {mlPending ? "Invio…" : "Invia link"}
        </button>
        {ml.error && <p role="alert" className="text-sm text-red-600">{ml.error}</p>}
        {ml.info && <p className="text-sm text-green-600">{ml.info}</p>}
      </form>
    </main>
  );
}
