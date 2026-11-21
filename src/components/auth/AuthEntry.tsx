// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Signed-out entry flow on /login:  Loading -> Welcome -> Sign in / Create account.
// After that, LoginForm's existing redirects take over (-> /onboarding or -> next/home).
//
// Signed-in visitors never see this: src/proxy.ts redirects them away from /login.
// Each form step has its own URL (?step=signin | ?step=signup) so the browser/phone back
// button returns to Welcome, and a refresh keeps you on the form. Visitors bounced here
// from a deep link (?next=/map) go straight to sign-in.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LoginForm from "./LoginForm";
import SplashScreen from "./SplashScreen";
import WelcomeScreen from "./WelcomeScreen";
import "./auth-intro.css";

export type AuthStep = "splash" | "welcome" | "signin" | "signup";
type FormStep = "signin" | "signup";

function stepFromUrl(): AuthStep {
  const step = new URLSearchParams(window.location.search).get("step");
  return step === "signin" || step === "signup" ? step : "welcome";
}

/** Current URL with ?step set or removed; `next` and any other params are preserved. */
function urlWithStep(step: FormStep | null): string {
  const params = new URLSearchParams(window.location.search);
  if (step) params.set("step", step);
  else params.delete("step");
  const q = params.toString();
  return `${window.location.pathname}${q ? `?${q}` : ""}`;
}

export default function AuthEntry({ initialStep }: { initialStep: AuthStep }) {
  const [step, setStep] = useState<AuthStep>(initialStep);
  // True when the form entry was pushed from Welcome in this tab, so Back can pop it.
  const pushedForm = useRef(false);

  useEffect(() => {
    const onPop = () => {
      pushedForm.current = false;
      setStep(stepFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const finishSplash = useCallback(() => setStep("welcome"), []);

  function openForm(mode: FormStep) {
    window.history.pushState(null, "", urlWithStep(mode));
    pushedForm.current = true;
    setStep(mode);
  }

  function backToWelcome() {
    if (pushedForm.current) {
      window.history.back(); // popstate brings us back to Welcome
    } else {
      // Arrived directly (refresh or deep link): nothing to pop, so swap the entry.
      window.history.replaceState(null, "", urlWithStep(null));
      setStep("welcome");
    }
  }

  const onModeChange = useCallback((mode: FormStep) => {
    window.history.replaceState(null, "", urlWithStep(mode));
  }, []);

  if (step === "splash") return <SplashScreen onDone={finishSplash} />;
  if (step === "welcome") return <WelcomeScreen onGetStarted={() => openForm("signup")} onLogIn={() => openForm("signin")} />;

  return (
    <div className="tot-fade-in" style={{ paddingTop: "calc(var(--safe-top) + 20px)", paddingBottom: "calc(var(--safe-bottom) + 24px)" }}>
      <main className="mx-auto w-full max-w-[430px] px-5">
        <LoginForm initialMode={step} onBack={backToWelcome} onModeChange={onModeChange} />
      </main>
    </div>
  );
}
