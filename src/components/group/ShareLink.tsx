// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// The group code, big and easy to read out, plus Share (iOS share sheet) or Copy.
"use client";

import { useState } from "react";
import { ShareIcon } from "@/components/shared/ios";

export default function ShareLink({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/room/${code}`;
    const text = `Join "${name}" on Taste of T with code ${code}`;
    try {
      if (navigator.share) return await navigator.share({ title: "Taste of T", text, url });
      await navigator.clipboard.writeText(`${text}: ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet dismissed: nothing to do
    }
  }

  return (
    <div className="mt-3 rounded-[14px] bg-cell p-5 text-center">
      <p className="text-[13px] uppercase tracking-wide text-label-2">Group code</p>
      <p className="mt-1 font-mono text-[44px] font-bold leading-none tracking-[0.25em] text-tint" aria-label={code.split("").join(" ")}>
        {code}
      </p>
      <button type="button" onClick={share} className="mt-4 inline-flex items-center gap-2 rounded-full bg-tint/15 px-5 py-2.5 text-[15px] font-semibold text-tint active:opacity-60">
        <ShareIcon size={18} /> {copied ? "Copied!" : "Invite friends"}
      </button>
    </div>
  );
}
