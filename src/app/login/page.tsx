// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Signed-out entry: Loading -> Welcome -> Sign in / Create account (see AuthEntry).
// Signed-out visitors are sent here by src/proxy.ts; signed-in ones are sent away from it.
// This screen has its own lavender look, so it skips <Screen> (which would add a "Welcome"
// large title). DM Sans / DM Serif Display come from the root layout. It stays light-only
// to match the Figma entry screens.
import type { Metadata } from "next";
import { Suspense } from "react";
import InstallPrompt from "@/components/shared/InstallPrompt";
import AuthEntry, { type AuthStep } from "@/components/auth/AuthEntry";

export const metadata: Metadata = { title: "Sign In · Taste of T" };

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <div
      className="min-h-dvh bg-[#F8F5FF] text-[#30203F] [color-scheme:light] [font-family:var(--font-sans)]"
    >
      {/* searchParams is request-time data; with cacheComponents it must be read inside
          Suspense so the rest of the page prerenders. Fallback = the splash background. */}
      <Suspense fallback={<div className="min-h-dvh bg-[#F3EDFF]" />}>
        <Entry searchParams={searchParams} />
      </Suspense>
      <InstallPrompt />
    </div>
  );
}

async function Entry({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { step, next } = await searchParams;
  // Pick the first screen on the server so it renders without a flash or hydration mismatch.
  const initialStep: AuthStep =
    step === "signin" || step === "signup"
      ? step
      : next
        ? "signin" // bounced from a protected page: skip the intro
        : "splash";
  return <AuthEntry initialStep={initialStep} />;
}
