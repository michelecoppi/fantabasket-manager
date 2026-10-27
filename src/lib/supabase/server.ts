import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";

/** Client Supabase per Server Components e Server Actions: agisce come l'utente loggato (RLS applicata). */
export async function createClient() {
  const cookieStore = await cookies();
  // L'auth Supabase legge Date.now() (scadenza della sessione). Nel prerender "runtime" i cookie ci sono già,
  // quindi senza io() quella lettura finirebbe nel prerender ("unstable value Date.now()"): io() lo ferma lì
  // e a richiesta vera si risolve subito.
  await io();
  return createServerClient(
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // chiamato da un Server Component: il proxy rinnova già la sessione
          }
        },
      },
    },
  );
}
