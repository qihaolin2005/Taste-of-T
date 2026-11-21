// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Signed-out entry: Loading -> Welcome -> Sign in / Create account (see AuthEntry).
// Signed-out visitors are sent here by src/proxy.ts; signed-in ones are sent away from it.
// This screen has its own lavender look, so it skips <Screen> (which would add a "Welcome"
// large title and the grey grouped background). Fonts are scoped to this page.
import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { Suspense } from "react";
import InstallPrompt from "@/components/shared/InstallPrompt";
import AuthEntry, { type AuthStep } from "@/components/auth/AuthEntry";

export const metadata: Metadata = { title: "Sign In · Taste of T" };

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dm-serif" });

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <div
      className={`${dmSans.variable} ${dmSerif.variable} min-h-dvh bg-[#F8F5FF] text-[#30203F] [color-scheme:light] [font-family:var(--font-dm-sans),system-ui,sans-serif]`}
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
