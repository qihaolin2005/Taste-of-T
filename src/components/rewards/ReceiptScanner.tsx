// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// PLUG-IN POINT for the receipt OCR component (being built by a teammate). Contract:
// docs/receipt-ocr.md. Replace the body with the real scanner: take/upload a photo, read it,
// then call onRead(...) with what was found. The claim screen fills its fields from it; the
// person can still correct them before claiming. Until then this renders nothing and the
// receipt is typed in by hand.
"use client";

import type { ReceiptReading } from "@/features/rewards/receipt";

export type ReceiptScannerProps = {
  onRead: (reading: ReceiptReading) => void;
  disabled?: boolean;
};

export default function ReceiptScanner(props: ReceiptScannerProps) {
  void props;
  return null;
}
