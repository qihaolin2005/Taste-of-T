// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// What a receipt reader (OCR) hands the claim screen. Contract: docs/receipt-ocr.md.
// Only these facts are sent to POST /api/rewards/visits; the photo never leaves the reader.

export type ReceiptReading = {
  /** Grand total in dollars, tip included if printed. */
  total?: number;
  /** When it was printed, ISO 8601 ("2026-11-21T19:42:00-05:00"). Local time without offset is OK. */
  date?: string;
  /** Restaurant name as printed ("LANTERN DUMPLING HSE #2"). Checked against the place's name. */
  merchantName?: string;
  /** Check / order / transaction number. Makes duplicate receipts easy to catch. */
  receiptNumber?: string;
  /** Guests / covers, if printed. */
  diners?: number;
};

/** "2026-11-21T19:42" in the phone's local time, for <input type="datetime-local">; null if unreadable. */
export function toLocalInput(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
