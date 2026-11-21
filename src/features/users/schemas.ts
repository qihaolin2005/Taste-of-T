// Owner: P2 - Data & Integrations (see TEAM.md)
// Request validation for profile, preferences, and location endpoints.
import { z } from "zod";
import { isKnownStation } from "@/lib/mbta/stations";

/** Tags are lowercased, trimmed, de-duplicated so planner matching is predictable. */
const tagList = z
  .array(z.string().trim().min(1).max(32))
  .max(20)
  .transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()))]);

const stationId = z.string().min(1).max(64).refine(isKnownStation, "Unknown station id");

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    avatar: z.string().trim().max(16).nullable(),
  })
  .partial()
  .strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const preferencesUpdateSchema = z
  .object({
    tastes: tagList,
    avoid: tagList,
    dietary: tagList,
    defaultBudget: z.number().int().min(0).max(1000).nullable(),
    maxWalkMinutes: z.number().int().min(1).max(60).nullable(),
    homeStationId: stationId.nullable(),
    usualStartStationId: stationId.nullable(),
    city: z.string().trim().min(1).max(60).nullable(),
    shareLocation: z.boolean(),
  })
  .partial()
  .strict();
export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>;

export const locationUpdateSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(100_000).optional(),
  })
  .strict();
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

/** Read a Json column that should hold string[]; tolerate bad/legacy data. */
export function readTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
