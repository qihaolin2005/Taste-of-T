// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// Proof that you ate there:
//   1. Presence: checked inside claimVisit() (presence.ts): the phone's location at the place
//      (GPS check-in, src/features/gamification/checkin.ts), or a recorded trip past it, or a
//      verified ride that ended near it. resolveClaim() passes `location` through as `presence`.
//   2. Receipt scan: the total, date and restaurant name come from a signed scan of the photo
//      (receiptToken.ts), not from what was typed. Typed receipts are only accepted when receipt
//      scanning isn't configured (no GEMINI_API_KEY), so the app still works offline in dev.
//
// resolveClaim() turns the request body into the ClaimVisitInput that claimVisit() trusts.
import { z } from "zod";
import type { LatLng } from "@/lib/geo";
import { distanceMeters } from "@/lib/geo";
import { REWARDS_CONFIG } from "./config";
import { verifyReceipt } from "./receiptToken";
import { claimVisitSchema, RewardError, type ClaimVisitInput } from "./service";

const L = REWARDS_CONFIG.limits;

/** POST /api/rewards/visits body. */
export const claimRequestSchema = z
  .object({
    placeId: z.string().min(1).max(100),
    /**
     * The phone's GPS fix at the moment of claiming. Used for the check, not stored. Optional: if
     * location is off, a recorded trip or a verified ride can still prove the visit (presence.ts).
     */
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyM: z.number().min(0).max(100_000).optional(),
      })
      .strict()
      .optional(),
    /** From POST /api/rewards/receipt. Required when receipt scanning is on. */
    receiptToken: z.string().min(10).max(4000).optional(),
    /** Typed receipt: only accepted when receipt scanning is off. */
    receipt: claimVisitSchema.shape.receipt.optional(),
    /** People on the bill. Overrides what the scan read (it's often not printed). */
    diners: z.number().int().min(1).max(L.maxDinersOnReceipt).optional(),
    travel: claimVisitSchema.shape.travel,
  })
  .strict();
export type ClaimRequest = z.infer<typeof claimRequestSchema>;

export type ClaimProofContext = {
  /** Where the place is. Without it we can't check you in, so the claim is refused. */
  placeCoords: LatLng | null;
  /** SESSION_SECRET, which signed the receipt token. */
  secret: string;
  /** True when receipt scanning is configured: then a scan is required. */
  requireReceiptScan: boolean;
  now?: Date;
};

const fail = (code: RewardError["code"], message: string): never => {
  throw new RewardError(code, message);
};

/** Checks the proof and returns the claim with receipt facts we can trust. Throws RewardError. */
export function resolveClaim(userId: string, req: ClaimRequest, ctx: ClaimProofContext): { input: ClaimVisitInput; checkInDistanceM?: number } {
  const now = ctx.now ?? new Date();

  // 1. We need to know where the place is to check you were there (the check itself runs in
  //    claimVisit, so a recorded trip or a verified ride can also count).
  if (!ctx.placeCoords) fail("bad_request", "We can't find where this place is, so we can't check you in.");

  // 2. Receipt: a signed scan, or (only with scanning off) the typed one.
  let receipt: ClaimVisitInput["receipt"];
  if (req.receiptToken) {
    const v = verifyReceipt(req.receiptToken, userId, ctx.secret, now);
    if (!v.ok) {
      fail("bad_request", v.reason === "expired" ? "That receipt scan expired. Scan the receipt again." : "That receipt scan isn't valid. Scan the receipt again.");
    } else {
      const { diners, ...facts } = v.facts;
      receipt = { ...facts, ...((req.diners ?? diners) ? { diners: req.diners ?? diners } : {}) };
    }
  } else if (ctx.requireReceiptScan) {
    fail("bad_request", "Scan your receipt to claim points.");
  } else if (req.receipt) {
    receipt = { ...req.receipt, ...(req.diners ? { diners: req.diners } : {}) };
  } else {
    fail("bad_request", "Add your receipt to claim points.");
  }

  const input: ClaimVisitInput = {
    placeId: req.placeId,
    receipt: receipt!,
    ...(req.travel ? { travel: req.travel } : {}),
    ...(req.location ? { presence: req.location } : {}),
  };
  const checkInDistanceM = req.location && ctx.placeCoords ? Math.round(distanceMeters(req.location, ctx.placeCoords)) : undefined;
  return { input, ...(checkInDistanceM != null ? { checkInDistanceM } : {}) };
}
