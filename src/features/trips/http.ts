// Owner: P2 - Data & Integrations (see TEAM.md)
// Shared Route Handler bits for /api/trips/*.
import type { PrismaClient } from "@/generated/prisma/client";
import { apiError } from "@/lib/api";
import { getSeedPlaces, googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import { normalizeCode } from "@/features/rooms/code";
import { latestRoomPlan } from "@/features/squads/store";
import { TripError, type TripPlace } from "./service";

export function tripErrorResponse(err: unknown): Response {
  if (err instanceof TripError) return apiError(err.code, err.message);
  throw err;
}

/** The destination: `placeId` if given, else the group plan's #1 pick. Null if unknown or it has no location. */
export async function resolveDestination(db: PrismaClient, placeId: string | undefined, roomId: string | undefined): Promise<TripPlace | null> {
  let id = placeId;
  if (!id && roomId) {
    const code = normalizeCode(roomId);
    const plan = code ? ((await latestRoomPlan(db, code))?.result as { recommended?: { place?: { id?: string } } | null } | undefined) : undefined;
    id = plan?.recommended?.place?.id;
  }
  return id ? findPlace(id) : null;
}

/** A restaurant's name and location by id (live source, then the demo seed list). Null if unknown or it has no location. */
export async function findPlace(id: string): Promise<TripPlace | null> {
  const { places } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
  // Demo seed places too, so seed ids work even when Google Places is on.
  const p = places.find((x) => x.id === id) ?? getSeedPlaces().find((x) => x.id === id);
  if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
  return { id: p.id, name: p.name ?? null, lat: p.lat, lng: p.lng };
}
