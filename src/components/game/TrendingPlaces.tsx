// Owner: P4 - Game Layer & Map (see TEAM.md)
// "Trending Right Now" under the T map. Tapping a place shows it on the map with the route there
// (/map?to=...). Server component: reads this week's activity from the database.
import { connection } from "next/server";
import { ListRow, ListSection } from "@/components/shared/ios";
import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import { routeMapHref } from "@/features/directions/types";
import { trendingPlaces } from "@/features/trending";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

function FlameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c.5 3.2-1.4 5-2.9 6.6C7.6 10.2 6 11.9 6 14.6A6 6 0 0 0 12 21a6 6 0 0 0 6-6.2c0-2.3-1-4.1-2.3-5.6-.2 1.5-.9 2.6-2 3.2.3-3.6-.6-7.4-1.7-10.4Z" />
    </svg>
  );
}

/** `active`: the place the map is currently showing, if any. */
export default async function TrendingPlaces({ active }: { active?: LatLng | null }) {
  // "This week" and live activity are per-request: don't let prerendering run the clock.
  await connection();
  const { places } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
  const trending = await trendingPlaces(db, places);
  if (!trending.length) return null;

  return (
    <ListSection header="Trending Right Now" footer="What people in Taste of T are liking, visiting and rating this week. Tap one to see it on the map and how to get there.">
      {trending.map((t, i) => {
        const isActive = !!active && Math.abs(active.lat - t.lat) < 1e-5 && Math.abs(active.lng - t.lng) < 1e-5;
        const detail = [t.neighborhood, t.cuisines[0] ? cap(t.cuisines[0]) : null].filter(Boolean).join(" · ");
        return (
          <ListRow
            key={t.id}
            icon={t.buzzing ? <FlameIcon /> : <span className="text-[14px] font-bold">{i + 1}</span>}
            title={isActive ? `${t.name} (on the map)` : t.name}
            subtitle={detail ? `${t.why} · ${detail}` : t.why}
            href={routeMapHref(t)!}
          />
        );
      })}
    </ListSection>
  );
}
