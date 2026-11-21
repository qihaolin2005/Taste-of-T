// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Sign in / create account / continue with Google / continue as guest.
// Lavender login styling (from the Figma Make design) is local to this file;
// src/app/login/page.tsx provides the fonts and page background.
"use client";

import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { safeNextPath } from "@/features/auth/gate";
import { continueAsGuest, logIn, logInWithGoogle, signUp } from "@/lib/identity";
import GoogleButton from "./GoogleButton";
import Wordmark from "./Wordmark";

type Mode = "signin" | "signup";
type Pending = "email" | "google" | "guest";
type FieldErrors = { email?: string; password?: string };

const MIN_PASSWORD = 8; // matches signUpSchema in src/features/auth/schemas.ts

function go(onboarded: boolean) {
  // Full navigation so the proxy sees the new session cookie.
  const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
  window.location.replace(onboarded ? next : "/onboarding");
}

const serif = "[font-family:var(--font-dm-serif),Georgia,serif]";

/* ---------- small login-only building blocks ---------- */

const iconPaths = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2 12s4-7 10-7c2 0 3.8.7 5.3 1.7M22 12s-4 7-10 7c-2 0-3.8-.7-5.3-1.7" />
      <path d="m3 3 18 18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
};

function Icon({ name, size = 20 }: { name: keyof typeof iconPaths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {iconPaths[name]}
    </svg>
  );
}

function Spinner() {
  return <span aria-hidden className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />;
}

function AuthField({
  icon,
  label,
  error,
  action,
  id,
  ...input
}: { icon: keyof typeof iconPaths; label: string; error?: string; action?: ReactNode; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className={`grid min-h-[56px] grid-cols-[24px_1fr_auto] items-center gap-2.5 rounded-[18px] border bg-white pl-4 pr-1 transition focus-within:ring-4 ${
          error
            ? "border-[#A86D93] focus-within:ring-[#A86D93]/15"
            : "border-[#E2DBE9] focus-within:border-[#7954AC] focus-within:ring-[#7954AC]/15"
        }`}
      >
        <span className="text-[#7954AC]">
          <Icon name={icon} />
        </span>
        <input
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...input}
          className="h-[54px] w-full min-w-0 bg-transparent text-[16px] text-[#30203F] outline-none placeholder:text-[#9A93A3] disabled:opacity-60"
        />
        {action ?? <span className="w-3" />}
      </label>
      {error && (
        <p id={errorId} className="mt-1.5 pl-4 text-[13px] text-[#8C456C]">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- the form ---------- */

type Props = {
  /** Which tab to open on (Welcome's "Get Started" opens signup). */
  initialMode?: Mode;
  /** Shows the back arrow (to the Welcome screen). */
  onBack?: () => void;
  /** Lets the parent keep the URL in sync with the selected tab. */
  onModeChange?: (mode: Mode) => void;
};

export default function LoginForm({ initialMode = "signin", onBack, onModeChange }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  async function run(action: () => Promise<{ user: { onboarded: boolean } }>, which: Pending) {
    setBusy(true);
    setPending(which);
    setError(null);
    try {
      const { user } = await action();
      go(user.onboarded);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setPending(null);
    }
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const trimmed = email.trim();
    if (!trimmed) next.email = mode === "signin" ? "Enter your account email." : "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) next.email = "Enter a valid email address.";
    if (!password) next.password = mode === "signin" ? "Enter your password." : "Create a password.";
    else if (mode === "signup" && password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    return next;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (errs.email || errs.password) return;
    run(() => (mode === "signin" ? logIn(email, password) : signUp(email, password, name.trim() || undefined)), "email");
  }

  function switchMode(m: Mode) {
    setMode(m);
    onModeChange?.(m);
    setError(null);
    setFieldErrors({});
  }

  const signup = mode === "signup";
  const longEnough = password.length >= MIN_PASSWORD;

  return (
    <div className="flex min-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-44px)] flex-col">
      <header className="grid h-12 grid-cols-[44px_1fr_44px] items-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-full border border-[#E5DEED] bg-white text-[#30203F] transition active:scale-95 disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </button>
        ) : (
          <span />
        )}
        <Wordmark size="sm" />
        <span />
      </header>

      <div className="mb-6 mt-7">
        <h1 className={`${serif} text-[40px] leading-[1.02] tracking-[-0.025em] text-[#30203F]`}>{signup ? "let’s get you started." : "welcome back."}</h1>
        <p className="mt-2.5 max-w-[315px] text-[16px] leading-[1.5] text-[#777080]">
          {signup ? "A few details, then the city is yours." : "Boston’s waiting for you."}
        </p>
      </div>

      {/* Sign In / Create Account */}
      <div role="tablist" aria-label="Account" className="relative mb-5 grid grid-cols-2 rounded-[16px] bg-[#EEE7FC] p-1">
        <span
          aria-hidden
          className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[13px] bg-white shadow-[0_3px_9px_rgba(56,46,90,0.08)] transition-transform duration-300 ease-out ${
            signup ? "translate-x-full" : ""
          }`}
        />
        {(
          [
            { value: "signin", label: "Sign In" },
            { value: "signup", label: "Create Account" },
          ] as const
        ).map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={mode === o.value}
            onClick={() => switchMode(o.value)}
            className={`relative z-10 h-10 rounded-[13px] text-[15px] font-semibold transition-colors ${mode === o.value ? "text-[#30203F]" : "text-[#777080]"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        {signup && (
          <AuthField
            id="login-name"
            icon="user"
            label="Name (optional)"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={40}
            disabled={busy}
          />
        )}
        <AuthField
          id="login-email"
          icon="mail"
          label="Email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
          error={fieldErrors.email}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="email"
          required
          disabled={busy}
        />
        <AuthField
          id="login-password"
          icon="lock"
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder={signup ? "Create a password" : "Password"}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
          }}
          error={fieldErrors.password}
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={signup ? MIN_PASSWORD : undefined}
          required
          disabled={busy}
          action={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="grid h-11 w-11 place-items-center text-[#777080] active:opacity-60"
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
            </button>
          }
        />

        {signup && !fieldErrors.password && (
          <p className={`-mt-0.5 flex items-center gap-1.5 pl-4 text-[13px] transition-colors ${longEnough ? "text-[#43A16D]" : "text-[#777080]"}`}>
            <span
              aria-hidden
              className={`grid h-4 w-4 place-items-center rounded-full ${longEnough ? "bg-[#43A16D] text-white" : "border border-[#C9C2D3]"}`}
            >
              {longEnough && <Icon name="check" size={10} />}
            </span>
            At least {MIN_PASSWORD} characters
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-[16px] border border-[#E7C6D6] bg-[#FBEFF4] px-4 py-3 text-[14px] leading-5 text-[#8C456C]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[#7954AC] text-[16px] font-bold text-white shadow-[0_9px_20px_rgba(121,84,172,0.15)] transition active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
        >
          {pending === "email" ? <Spinner /> : signup ? "Create Account" : "Log In"}
          <span className="sr-only">{pending === "email" ? "Signing in…" : ""}</span>
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[13px] text-[#777080]">
        <span className="h-px flex-1 bg-[#E2DBE9]" /> or <span className="h-px flex-1 bg-[#E2DBE9]" />
      </div>

      <div className="grid gap-2.5">
        <GoogleButton disabled={busy} onCredential={(credential) => run(() => logInWithGoogle(credential), "google")} />
        {pending === "google" && (
          <p className="flex items-center justify-center gap-2 text-[14px] text-[#777080]">
            <Spinner /> Signing in with Google…
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(continueAsGuest, "guest")}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#EEE7FC] text-[16px] font-bold text-[#30203F] transition active:scale-[0.98] active:bg-[#E3D8F8] disabled:opacity-60 disabled:active:scale-100"
        >
          {pending === "guest" ? <Spinner /> : "Continue as Guest"}
        </button>
      </div>

      <p className="mt-4 px-4 text-center text-[13px] leading-5 text-[#777080]">Guests can create an account later and keep their stamps.</p>
    </div>
  );
}
