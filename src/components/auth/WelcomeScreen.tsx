// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Welcome screen from the Figma design: wordmark, skyline + train illustration, headline,
// and the two entry points into the account form.
"use client";

import "./auth-intro.css";
import { WELCOME_ILLUSTRATION } from "./SplashScreen";
import Wordmark from "./Wordmark";

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function WelcomeScreen({ onGetStarted, onLogIn }: { onGetStarted: () => void; onLogIn: () => void }) {
  return (
    <main
      className="tot-fade-in flex min-h-dvh flex-col px-5"
      style={{ paddingTop: "max(48px, calc(var(--safe-top) + 18px))", paddingBottom: "max(24px, var(--safe-bottom))" }}
    >
      <div className="mb-5 [@media(max-height:760px)]:mb-2.5">
        <Wordmark size="md" />
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- preloaded by SplashScreen with this exact URL */}
      <img
        src={WELCOME_ILLUSTRATION}
        width={409}
        height={254}
        alt="Purple Boston skyline, MBTA train, bushes, tracks, and T station sign"
        className="mx-auto mb-8 block h-auto w-[85%] max-w-[300px] object-contain [@media(max-height:760px)]:mb-5 [@media(max-height:760px)]:max-w-[260px]"
      />

      <section className="flex flex-1 flex-col">
        <div className="mb-5">
          <h1 className="text-[39px] font-normal leading-[1.03] tracking-[-0.025em] text-[#30203F] [font-family:var(--font-dm-serif),Georgia,serif] [@media(max-height:760px)]:text-[34px]">
            every stop brings a
            <br />
            new experience.
          </h1>
          <p className="mt-[13px] max-w-[315px] text-[16px] leading-[1.55] text-[#777080]">
            Discover hidden gems, try new bites, and make memories with your people across Boston.
          </p>
        </div>

        <div className="mt-auto grid gap-[9px] pb-1">
          <button
            type="button"
            onClick={onGetStarted}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[#7954AC] text-[16px] font-bold text-white shadow-[0_9px_20px_rgba(121,84,172,0.15)] transition active:scale-[0.98]"
          >
            Get Started <ArrowIcon />
          </button>
          <button
            type="button"
            onClick={onLogIn}
            className="min-h-[52px] w-full rounded-full bg-[#EEE7FC] text-[16px] font-bold text-[#30203F] transition active:scale-[0.98] active:bg-[#E3D8F8]"
          >
            I already have an account
          </button>
        </div>
      </section>
    </main>
  );
}
