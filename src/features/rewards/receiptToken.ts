// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// What a receipt scan proves, carried from the scan to the claim without trusting the phone.
//
//   POST /api/rewards/receipt   photo -> Gemini reads it -> facts -> signReceipt() -> token
//   POST /api/rewards/visits    { receiptToken } -> verifyReceipt() -> the facts the claim uses
//
// The token is "<base64url JSON>.<HMAC>" signed with SESSION_SECRET, tied to the user who scanned
// it, and short-lived. Editing the total or date breaks the signature, so the points are based
// on what was printed on the receipt, not on what was typed. The photo itself is never stored.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** The facts read off a receipt. Same shape as the claim's `receipt` (minus diners). */
export const receiptFactsSchema = z
  .object({
    total: z.number().positive(),
    /** ISO 8601 with offset. */
    date: z.string().datetime({ offset: true }),
    merchantName: z.string().min(1).max(120),
    receiptNumber: z.string().min(1).max(60).optional(),
    /** People the bill covers, if printed ("Guests: 2"). The user can change it on the claim. */
    diners: z.number().int().min(1).max(12).optional(),
  })
  .strict();
export type ReceiptFacts = z.infer<typeof receiptFactsSchema>;

const payloadSchema = z.object({ u: z.string(), f: receiptFactsSchema, exp: z.number() }).strict();

/** How long a scan stays valid. Long enough to fill in the claim, short enough not to be stockpiled. */
export const RECEIPT_TOKEN_TTL_MIN = 30;

const mac = (body: string, secret: string) => createHmac("sha256", `receipt:${secret}`).update(body).digest("base64url");

export function signReceipt(userId: string, facts: ReceiptFacts, secret: string, now = new Date()): { token: string; expiresAt: string } {
  const exp = now.getTime() + RECEIPT_TOKEN_TTL_MIN * 60_000;
  const body = Buffer.from(JSON.stringify({ u: userId, f: facts, exp })).toString("base64url");
  return { token: `${body}.${mac(body, secret)}`, expiresAt: new Date(exp).toISOString() };
}

export type VerifyReceiptResult = { ok: true; facts: ReceiptFacts } | { ok: false; reason: "invalid" | "expired" | "not_yours" };

export function verifyReceipt(token: string, userId: string, secret: string, now = new Date()): VerifyReceiptResult {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "invalid" };
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };
  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (payload.u !== userId) return { ok: false, reason: "not_yours" };
  if (now.getTime() > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, facts: payload.f };
}

/**
 * "2026-11-21T19:42" printed on a Boston receipt -> "2026-11-22T00:42:00.000Z".
 * Receipts print local time with no zone; every place we recommend is in Boston.
 */
export function bostonLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Boston's offset at that moment (EST -5 / EDT -4). Checking at the guessed instant is right
  // except within an hour of a DST switch, which doesn't matter for a dinner receipt.
  const offsetMin = (at: number) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
    const om = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    return om ? (om[1] === "-" ? -1 : 1) * (Number(om[2]) * 60 + Number(om[3] ?? 0)) : -300;
  };
  return new Date(asUtc - offsetMin(asUtc) * 60_000).toISOString();
}
