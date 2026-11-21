// Owner: P2 - Data & Integrations (see TEAM.md)
// Which page a visitor should be sent to. Pure, so it's unit-tested and shared by src/proxy.ts.
//   signed out          -> /login (remembering where they were going)
//   signed in, new      -> /onboarding (dietary restrictions)
//   signed in, onboarded on /login or /onboarding -> /
// Returns null when the visitor may stay on `pathname`.

/** Pages anyone can see. /demo is the projector view; its iframe gets gated normally. */
const OPEN_PREFIXES = ["/demo"];

export function gateRedirect(pathname: string, state: { signedIn: boolean; onboarded: boolean }): string | null {
  if (OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  if (!state.signedIn) {
    if (pathname === "/login") return null;
    return pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`;
  }
  if (!state.onboarded) return pathname === "/onboarding" ? null : "/onboarding";
  if (pathname === "/login" || pathname === "/onboarding") return "/";
  return null;
}

/** Only allow same-site relative paths after login (prevents open redirects like ?next=//evil.com). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
