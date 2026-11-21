// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// The group code, big and easy to read out, plus Share (iOS share sheet) or Copy.
"use client";

import { useState } from "react";
import { ShareIcon } from "@/components/shared/ios";

export default function ShareLink({ code, name }: { code: string; name: string }) {
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/room/${code}`;
    const text = `Join "${name}" on Taste of T with code ${code}`;
    const copy = async () => {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      setNote("Copied!");
      setTimeout(() => setNote(null), 2000);
    };
    try {
      if (navigator.share) await navigator.share({ title: "Taste of T", text, url });
      else await copy();
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // share sheet dismissed
      await copy().catch(() => setNote(`Code: ${code}`));
    }
  }

  return (
    <section className="rounded-[20px] border border-separator bg-cell p-5 text-center">
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-label-2">Invite code</p>
      <p className="mt-1.5 font-mono text-[42px] font-bold leading-none tracking-[0.25em] text-tint" aria-label={code.split("").join(" ")}>
        {code}
      </p>
      <button type="button" onClick={share} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-lavender px-5 text-[15px] font-bold text-plum active:scale-[0.98]">
        <ShareIcon size={17} /> {note ?? "Invite friends"}
      </button>
    </section>
  );
}
