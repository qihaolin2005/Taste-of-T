// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// "Snap Your Receipt": one tap opens the camera; the photo is read (POST /api/rewards/receipt),
// then the claim screen opens with this place picked and the receipt filled in.
// If scanning isn't set up on the server, it goes straight to the claim screen's typed form.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { savePendingScan, scanReceiptPhoto } from "@/features/rewards/client";

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

export default function SnapReceiptButton({ placeId }: { placeId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimHref = `/rewards/claim?placeId=${encodeURIComponent(placeId)}`;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      savePendingScan(placeId, await scanReceiptPhoto(file, placeId));
      router.push(claimHref);
    } catch (err) {
      const message = (err as Error).message;
      // Scanning not set up here: the claim screen takes the receipt typed in instead.
      if (/isn't set up/i.test(message)) return router.push(claimHref);
      setError(message);
      setReading(false);
    } finally {
      if (input.current) input.current.value = ""; // retaking the same photo fires again
    }
  }

  return (
    <div>
      {/* A <label> around the input opens the camera on every phone browser. */}
      <label
        className={`inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-tint px-5 text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98] ${reading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" disabled={reading} onChange={(e) => onPhoto(e.target.files?.[0])} />
        <CameraIcon /> {reading ? "Reading receipt…" : "Snap Your Receipt"}
      </label>
      {error && <p className="mt-2 text-center text-[13px] text-[#ff3b30]">{error}</p>}
      <Link href={claimHref} className="mt-2 block text-center text-[13px] font-semibold text-tint active:opacity-60">
        Open the claim screen instead
      </Link>
    </div>
  );
}
