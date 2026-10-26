/** Percorso interno a cui tornare dopo il login: accetta solo path relativi al sito, mai URL esterni. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 512) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  // Niente caratteri di controllo né schemi mascherati (es. "/\t/evil.com").
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  if (raw === "/login" || raw.startsWith("/login/") || raw.startsWith("/login?") || raw.startsWith("/auth")) return "/";
  return raw;
}
