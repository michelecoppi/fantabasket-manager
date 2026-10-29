"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Icon } from "@/components/icons";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = {};
const field =
  "min-h-12 w-full rounded-lg border border-white/15 bg-white/[0.06] pr-3 pl-10 text-base text-white placeholder:text-white/40 outline-none transition-[border-color,box-shadow] focus:border-gold focus:ring-4 focus:ring-gold/20";
const button =
  "font-display inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-3 text-lg font-extrabold transition-[filter,transform] active:scale-[0.98] disabled:opacity-60";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const next = useSearchParams().get("next") ?? "";
  const [pw, pwAction, pwPending] = useActionState(signInWithPassword, initial);
  const [ml, mlAction, mlPending] = useActionState(sendMagicLink, initial);

  return (
    <main className="arena flex min-h-screen w-full flex-1 items-center justify-center px-4 py-10">
      <span aria-hidden className="font-display outline-text pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[clamp(6rem,22vw,20rem)] leading-none font-black whitespace-nowrap text-white/[0.06] select-none">
        Fantabasket
      </span>
      <div className="relative z-[2] grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_26rem]">
        <div className="rise hidden lg:block">
          <p className="eyebrow flex items-center gap-2 text-highlight">
            <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
            League office
          </p>
          <h1 className="font-display mt-4 text-[6.5rem] leading-[0.86] font-black">
            <span className="block">Benvenuto</span>
            <span className="outline-text mt-3 block text-highlight">in sede.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/65">Rose, contratti, salary cap e pick della lega. Entra per vedere a che punto è la tua franchigia.</p>
        </div>

        <div className="pop mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-white/12 bg-chrome/80 shadow-[0_30px_80px_-30px_rgb(6_10_20/0.35)] dark:shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl lg:max-w-none">
          <div aria-hidden className="h-1 bg-linear-to-r from-brand-red via-[#1d47b5] to-gold" />
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <Image src="/logo.png" alt="" width={270} height={360} priority className="h-28 w-auto drop-shadow-[0_0_28px_rgb(244_180_42/0.35)]" />
              <h1 className="font-display text-4xl leading-none font-black lg:hidden">
                Fantabasket <span className="text-highlight">Manager</span>
              </h1>
              <p className="text-sm text-white/60">Accedi per vedere la lega.</p>
            </div>

            <form action={pwAction} className="flex flex-col gap-3">
              <input type="hidden" name="next" value={next} />
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-white/80">Email</span>
                <span className="relative block">
                  <Icon name="mail" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/45" />
                  <input name="email" type="email" autoComplete="email" spellCheck={false} placeholder="Email" className={field} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-white/80">Password</span>
                <span className="relative block">
                  <Icon name="lock" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/45" />
                  <input name="password" type="password" autoComplete="current-password" placeholder="Password" className={field} />
                </span>
              </label>
              <button disabled={pwPending} className={`${button} bg-gold text-nav shadow-[0_10px_30px_-12px_var(--gold)] hover:brightness-105`}>
                {pwPending ? <Icon name="ball" size={18} strokeWidth={2} className="ball-spin" /> : <Icon name="arrow-right" size={18} strokeWidth={2.2} />}
                {pwPending ? "Accesso…" : "Accedi"}
              </button>
              {pw.error && (
                <p role="alert" className="text-sm text-arena-bad">
                  {pw.error}
                </p>
              )}
            </form>

            <div className="flex items-center gap-3 text-[0.6875rem] font-bold tracking-widest text-white/35 uppercase">
              <span className="h-px flex-1 bg-white/12" />
              oppure
              <span className="h-px flex-1 bg-white/12" />
            </div>

            <form action={mlAction} className="flex flex-col gap-3">
              <input type="hidden" name="next" value={next} />
              <p className="text-sm text-white/60">Ricevi un link di accesso via email.</p>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-white/80">Email per il link</span>
                <span className="relative block">
                  <Icon name="mail" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/45" />
                  <input name="email" type="email" autoComplete="email" spellCheck={false} placeholder="Email" className={field} />
                </span>
              </label>
              <button disabled={mlPending} className={`${button} border border-white/25 text-white hover:border-white hover:bg-white/8`}>
                {mlPending ? <Icon name="ball" size={18} strokeWidth={2} className="ball-spin" /> : <Icon name="mail" size={18} />}
                {mlPending ? "Invio…" : "Invia link"}
              </button>
              {ml.error && (
                <p role="alert" className="text-sm text-arena-bad">
                  {ml.error}
                </p>
              )}
              {ml.info && <p className="text-sm text-arena-good">{ml.info}</p>}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
