"use client";

import { useActionState, useEffect, useRef } from "react";
import { Callout, Field, SubmitButton, inputClass } from "@/components/controls";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { updatePassword, type PasswordState } from "./actions";

const initial: PasswordState = {};

export function PasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  const form = useRef<HTMLFormElement>(null);

  // A password salvata i campi si svuotano: non restano in chiaro nella pagina.
  useEffect(() => {
    if (state.done) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      <Field label="Nuova password" htmlFor="password" hint={`Almeno ${MIN_PASSWORD_LENGTH} caratteri.`}>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required className={inputClass} />
      </Field>
      <Field label="Ripeti la password" htmlFor="confirm">
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={72} required className={inputClass} />
      </Field>
      {state.error && <Callout tone="bad">{state.error}</Callout>}
      {state.done && <Callout tone="good" title="Password salvata">Da ora puoi entrare anche con email e password.</Callout>}
      <SubmitButton icon="lock" className="w-full sm:w-auto sm:self-start">
        Salva password
      </SubmitButton>
    </form>
  );
}
