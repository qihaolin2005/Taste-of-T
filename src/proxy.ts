// Owner: P2 - Data & Integrations (see TEAM.md)
// Runs before every page: sends signed-out visitors to /login and new accounts to
// /onboarding. This is an optimistic check on the signed cookie (no DB). API routes still
// verify the session themselves via requireUser(), so this is UX, not the security boundary.
import { NextResponse, type NextRequest } from "next/server";
import { gateRedirect } from "@/features/auth/gate";
import { ONBOARDED_COOKIE, SESSION_COOKIE, sessionSecret, verifyToken } from "@/lib/sessionToken";

export function proxy(req: NextRequest) {
  const signedIn = verifyToken(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret()) !== null;
  const onboarded = req.cookies.get(ONBOARDED_COOKIE)?.value === "1";
  const target = gateRedirect(req.nextUrl.pathname, { signedIn, onboarded });
  return target ? NextResponse.redirect(new URL(target, req.url)) : NextResponse.next();
}

export const config = {
  // Pages only: skip API routes, Next internals, and any file with an extension (icons, manifest).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
