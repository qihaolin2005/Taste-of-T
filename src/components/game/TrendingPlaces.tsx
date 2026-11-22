// Owner: P4 - Game Layer & Map (see TEAM.md)
// "Trending Right Now" under the T map. Tapping a place shows it on the map with the route there
// (/map?to=...); its chevron expands a photo. Server component: reads this week's activity from
// the database; the rows themselves are TrendingList (client, for expanding).
import { connection } from "next/server";
import { ListSection } from "@/components/shared/ios";
import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { warmGallery } from "@/lib/places/photos";
import { loadRestaurants } from "@/features/ml";
import { trendingPlaces } from "@/features/trending";
import TrendingList from "./TrendingList";

/** `active`: the place the map is currently showing, if any. */
export default async function TrendingPlaces({ active }: { active?: LatLng | null }) {
  // "This week" and live activity are per-request: don't let prerendering run the clock.
  await connection();
  const { places } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
  const trending = await trendingPlaces(db, places);
  if (!trending.length) return null;
  // Start loading their photos now, so expanding a row shows its photo right away.
  for (const t of trending) warmGallery(t.id);
  const activeId = active ? (trending.find((t) => Math.abs(active.lat - t.lat) < 1e-5 && Math.abs(active.lng - t.lng) < 1e-5)?.id ?? null) : null;

  return (
    <ListSection header="Trending Right Now" footer="What people in Taste of T are liking, visiting and rating this week. Tap one to see it on the map and how to get there, or the arrow to see a photo.">
      <TrendingList items={trending} activeId={activeId} />
    </ListSection>
  );
}
