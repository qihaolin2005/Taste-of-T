// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// iOS has no automatic install prompt, so tell Safari users how to add the app
// to their home screen. Hidden once installed (standalone) or dismissed.
"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "tot:install-dismissed";

function shouldShow(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // storage blocked (private mode): just show it
  }
  return isIOS && !standalone && !dismissed;
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read browser-only state after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(shouldShow());
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-50 rounded-2xl bg-card p-4 text-sm shadow-lg ring-1 ring-white/10">
      <p className="font-semibold">Install Taste of T</p>
      <p className="mt-1 text-muted">
        Tap the Share button <span aria-hidden>⬆︎</span> in Safari, then{" "}
        <span className="font-medium text-foreground">Add to Home Screen</span>.
      </p>
      <button onClick={dismiss} className="mt-3 rounded-lg bg-white/10 px-3 py-2 font-medium">
        Got it
      </button>
    </div>
  );
}
