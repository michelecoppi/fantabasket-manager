import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/next-path";
import { createClient } from "@/lib/supabase/server";

/** Conclude l'accesso via link email: scambia il codice con la sessione. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNextPath(searchParams.get("next"))}`);
  }
  return NextResponse.redirect(`${origin}/login`);
}
