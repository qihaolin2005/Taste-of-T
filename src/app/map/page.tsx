// Owner: P4 - Game Layer & Map (see TEAM.md)
// T map: real MBTA lines and stations (offline snapshot), live trains, and your stamps.
// /map?to=lat,lng&name=Place shows the route there by T and bus (linked from Spin, group picks
// and the trending list). Below the map: places trending this week.
import { Suspense } from "react";
import { Screen } from "@/components/shared/ios";
import TMap from "@/components/game/TMap";
import TrendingPlaces from "@/components/game/TrendingPlaces";
import { getLines, getStations } from "@/lib/mbta/stations";
import { googlePlaceId, parseLatLng } from "@/features/directions/types";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function readDestination(searchParams: SearchParams) {
  const sp = await searchParams;
  const to = parseLatLng(first(sp.to));
  const name = first(sp.name)?.slice(0, 120) || undefined;
  // Google Place ID (from routeMapHref) so "Open in Google Maps" opens this exact place
  const placeId = googlePlaceId(`google:${first(sp.pid) ?? ""}`) ?? undefined;
  return to ? { ...to, name, placeId } : null;
}

/** Reads the destination from the URL. Request-time, so it streams in behind the static shell. */
async function RoutedTMap({ searchParams }: { searchParams: SearchParams }) {
  return <TMap stations={getStations()} lines={getLines()} destination={await readDestination(searchParams)} />;
}

async function Trending({ searchParams }: { searchParams: SearchParams }) {
  return <TrendingPlaces active={await readDestination(searchParams)} />;
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Screen title="T Map" tab="map">
      <Suspense fallback={<div className="mt-3 h-[58dvh] min-h-[360px] animate-pulse rounded-[12px] bg-cell" aria-label="Loading map" />}>
        <RoutedTMap searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="mt-6 h-[300px] animate-pulse rounded-[14px] bg-cell" aria-label="Loading trending places" />}>
        <Trending searchParams={searchParams} />
      </Suspense>
    </Screen>
  );
}
