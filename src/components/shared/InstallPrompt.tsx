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
    // Sits just above the tab bar.
    <div className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+49px+12px)] z-50 rounded-[14px] bg-cell p-4 text-[15px] shadow-xl ring-[0.5px] ring-separator">
      <p className="font-semibold">Install Taste of T</p>
      <p className="mt-1 text-label-2">
        Tap the Share button <span aria-hidden>⬆︎</span> in Safari, then{" "}
        <span className="font-medium text-label">Add to Home Screen</span>.
      </p>
      <button onClick={dismiss} className="mt-3 rounded-[10px] bg-tint/15 px-4 py-2 font-semibold text-tint active:opacity-60">
        Got it
      </button>
    </div>
  );
}
