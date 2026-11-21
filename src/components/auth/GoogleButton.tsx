// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Google's official "Continue with Google" button (Google Identity Services).
// Renders nothing if NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't set or Google's script can't load
// (offline), so email and guest login always remain.
"use client";

import { useEffect, useRef, useState } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GsiCredentialResponse = { credential: string };
type Gsi = {
  accounts: {
    id: {
      initialize(opts: { client_id: string; callback: (r: GsiCredentialResponse) => void; ux_mode?: "popup"; itp_support?: boolean; use_fedcm_for_button?: boolean }): void;
      renderButton(el: HTMLElement, opts: Record<string, string | number>): void;
    };
  };
};
declare global {
  interface Window {
    google?: Gsi;
  }
}

let scriptPromise: Promise<Gsi> | null = null;
function loadGsi(): Promise<Gsi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error("Google script loaded without API")));
    s.onerror = () => {
      scriptPromise = null; // allow a retry later
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const googleSignInEnabled = CLIENT_ID.length > 0;

/** `onCredential` receives Google's ID token; send it to POST /api/auth/google. */
export default function GoogleButton({ onCredential, disabled }: { onCredential: (credential: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    cb.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!googleSignInEnabled) return;
    let cancelled = false;
    loadGsi()
      .then((gsi) => {
        if (cancelled || !ref.current) return;
        gsi.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => cb.current(r.credential),
          ux_mode: "popup",
          itp_support: true, // Safari / iOS
          use_fedcm_for_button: true,
        });
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        gsi.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: dark ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: Math.min(400, Math.round(ref.current.getBoundingClientRect().width)),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!googleSignInEnabled || failed) return null;
  return (
    <div className={`flex min-h-[44px] justify-center ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <div ref={ref} className="w-full max-w-[400px]" />
    </div>
  );
}
