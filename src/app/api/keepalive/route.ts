import { createClient } from "@/lib/supabase/server";

/**
 * Cron giornaliero di Vercel (vercel.json): una query leggera tiene attivo Supabase (il piano gratuito va in pausa dopo ~7 giorni).
 * A differenza del workflow GitHub non si ferma se il repo resta senza attività. Con CRON_SECRET impostato, Vercel lo manda come Bearer.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorizzato", { status: 401 });
  }
  const db = await createClient();
  // La RLS risponde con una lista vuota senza sessione: va bene, conta come attività sul database.
  const { error } = await db.from("seasons").select("id").limit(1);
  if (error) return Response.json({ ok: false }, { status: 502 });
  return Response.json({ ok: true });
}
