// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Sign in / create account / continue with Google / continue as guest.
"use client";

import { useState, type FormEvent } from "react";
import { Button, ListSection, SegmentedControl, TextFieldRow } from "@/components/shared/ios";
import { safeNextPath } from "@/features/auth/gate";
import { continueAsGuest, logIn, logInWithGoogle, signUp } from "@/lib/identity";
import GoogleButton from "./GoogleButton";

type Mode = "signin" | "signup";

function go(onboarded: boolean) {
  // Full navigation so the proxy sees the new session cookie.
  const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
  window.location.replace(onboarded ? next : "/onboarding");
}

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ user: { onboarded: boolean } }>) {
    setBusy(true);
    setError(null);
    try {
      const { user } = await action();
      go(user.onboarded);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => (mode === "signin" ? logIn(email, password) : signUp(email, password, name.trim() || undefined)));
  }

  return (
    <div>
      <div className="mb-6 mt-2 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-[14px] shadow-sm" />
        <p className="text-[15px] leading-5 text-label-2">Food quests and group nights out along the T.</p>
      </div>

      <SegmentedControl
        options={[
          { value: "signin", label: "Sign In" },
          { value: "signup", label: "Create Account" },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />

      <form onSubmit={onSubmit}>
        <ListSection footer={mode === "signup" ? "At least 8 characters." : undefined}>
          {mode === "signup" && (
            <TextFieldRow label="Name" placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
          )}
          <TextFieldRow
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            required
          />
          <TextFieldRow
            label="Password"
            type="password"
            placeholder={mode === "signup" ? "Create a password" : "Required"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
        </ListSection>

        {error && (
          <p role="alert" className="mt-3 px-4 text-[15px] text-[#ff3b30]">
            {error}
          </p>
        )}

        <div className="mt-6">
          <Button type="submit" disabled={busy}>
            {busy ? "One sec…" : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </div>
      </form>

      <div className="my-5 flex items-center gap-3 text-[13px] text-label-2">
        <span className="h-[0.5px] flex-1 bg-separator" /> or <span className="h-[0.5px] flex-1 bg-separator" />
      </div>
      <div className="mb-3">
        <GoogleButton disabled={busy} onCredential={(credential) => run(() => logInWithGoogle(credential))} />
      </div>
      <Button variant="tinted" disabled={busy} onClick={() => run(continueAsGuest)}>
        Continue as Guest
      </Button>
      <p className="mt-3 px-4 text-center text-[13px] text-label-2">Guests can create an account later and keep their stamps.</p>
    </div>
  );
}
