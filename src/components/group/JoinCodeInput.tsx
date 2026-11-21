// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Enter a 4-letter group code (e.g. BHSG) and go to that room.
// Four letter boxes over one real <input>, so typing, paste, and iOS autofill all just work.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shared/ios";

const LENGTH = 4;
const ALLOWED = /[ABCDEFGHJKLMNPQRSTUVWXYZ]/g; // same alphabet as the server (no I or O)

export default function JoinCodeInput() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const ready = code.length === LENGTH;

  function go() {
    if (ready) router.push(`/room/${code}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label className="relative block cursor-text" aria-label="Group code">
        <input
          value={code}
          onChange={(e) => setCode((e.target.value.toUpperCase().match(ALLOWED) ?? []).join("").slice(0, LENGTH))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LENGTH + 4}
          className="absolute inset-0 h-full w-full opacity-0"
          aria-describedby="code-help"
        />
        <div className="flex justify-center gap-2.5" aria-hidden>
          {Array.from({ length: LENGTH }, (_, i) => {
            const active = focused && (i === code.length || (ready && i === LENGTH - 1));
            return (
              <span
                key={i}
                className={`flex h-16 w-14 items-center justify-center rounded-[12px] bg-cell font-mono text-[32px] font-bold transition-shadow ${
                  active ? "ring-2 ring-tint" : "ring-[0.5px] ring-separator"
                }`}
              >
                {code[i] ?? ""}
              </span>
            );
          })}
        </div>
      </label>
      <p id="code-help" className="mt-2 text-center text-[13px] text-label-2">
        Ask whoever started the night for their 4-letter code.
      </p>
      <div className="mt-4">
        <Button type="submit" disabled={!ready}>
          Join Group
        </Button>
      </div>
    </form>
  );
}
