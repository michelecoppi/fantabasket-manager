"use client";

import Image from "next/image";
import { useActionState } from "react";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};
const field = "min-h-11 w-full rounded-[2px] border border-line bg-surface px-3 text-base";
const button = "min-h-11 w-full rounded-[2px] font-display bg-brand-red px-3 text-lg font-bold text-white transition hover:bg-accent hover:text-nav disabled:opacity-60";

export default function LoginPage() {
  const [pw, pwAction, pwPending] = useActionState(signInWithPassword, initial);
  const [ml, mlAction, mlPending] = useActionState(sendMagicLink, initial);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
        <div className="h-1.5 bg-brand-red" />
        <div className="flex flex-col gap-6 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Image src="/logo.png" alt="" width={270} height={360} priority className="h-32 w-auto" />
            <h1 className="font-display text-4xl leading-none font-extrabold">Fantabasket <span className="text-accent">Manager</span></h1>
            <p className="text-sm text-muted">Accedi per vedere la lega.</p>
          </div>

          <form action={pwAction} className="flex flex-col gap-3">
            <input name="email" type="email" autoComplete="email" placeholder="Email" className={field} />
            <input name="password" type="password" autoComplete="current-password" placeholder="Password" className={field} />
            <button disabled={pwPending} className={button}>
              {pwPending ? "Accesso…" : "Accedi"}
            </button>
            {pw.error && <p role="alert" className="text-sm text-danger">{pw.error}</p>}
          </form>

          <form action={mlAction} className="flex flex-col gap-3 border-t border-line pt-5">
            <p className="text-sm text-muted">Oppure ricevi un link di accesso via email.</p>
            <input name="email" type="email" autoComplete="email" placeholder="Email" className={field} />
            <button disabled={mlPending} className={`${button} !bg-brand-blue dark:!text-nav`}>
              {mlPending ? "Invio…" : "Invia link"}
            </button>
            {ml.error && <p role="alert" className="text-sm text-danger">{ml.error}</p>}
            {ml.info && <p className="text-sm text-success">{ml.info}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
