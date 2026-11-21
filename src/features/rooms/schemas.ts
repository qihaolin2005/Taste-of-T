// Owner: P3 - Group Mode & App Shell (see TEAM.md)
import { z } from "zod";
import { isKnownStation } from "@/lib/mbta/stations";

export const STOP_CATEGORIES = ["dinner", "dessert", "activity"] as const;
export type StopCategory = (typeof STOP_CATEGORIES)[number];

const stationId = z.string().min(1).max(64).refine(isKnownStation, "Pick a T station");

export const createRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    /** "tonight" | "tomorrow" (Boston dates are computed on the server). */
    day: z.enum(["tonight", "tomorrow"]),
    /** Minutes after midnight, e.g. 19:00 = 1140. Half-hour steps. */
    startTime: z.number().int().min(0).max(1439).refine((m) => m % 30 === 0, "Use :00 or :30"),
    slots: z
      .array(z.enum(STOP_CATEGORIES))
      .min(1, "Pick at least one stop")
      .max(3)
      .transform((s) => STOP_CATEGORIES.filter((c) => s.includes(c))), // canonical order, deduped
  })
  .strict();
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/** What a member types into the join form. Tastes and dietary needs come from their profile. */
export const memberInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    startStationId: stationId,
    homeStationId: stationId,
    budget: z.number().int().min(0).max(500),
    /** Leave-early time in minutes after midnight (can pass 1440 for after midnight). */
    leaveBy: z.number().int().min(0).max(1440 + 4 * 60).nullable().optional(),
    maxWalkMinutes: z.number().int().min(1).max(60).nullable().optional(),
  })
  .strict();
export type MemberInput = z.infer<typeof memberInputSchema>;
