// Owner: P4 - Game Layer & Map (see TEAM.md)
// Profile "Food" rows with real counts, plus the entry to claim points for a meal.
"use client";

import { useEffect, useState } from "react";
import { HeartIcon, ListRow, ListSection, StarIcon } from "@/components/shared/ios";

const count = (path: string, key: string) =>
  fetch(path, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => (Array.isArray(b?.[key]) ? (b[key] as unknown[]).length : null))
    .catch(() => null);

export default function FoodRows() {
  const [ratings, setRatings] = useState<number | null>(null);
  const [wishlist, setWishlist] = useState<number | null>(null);
  useEffect(() => {
    void count("/api/ratings", "ratings").then(setRatings);
    void count("/api/wishlist", "wishlist").then(setWishlist);
  }, []);
  return (
    <ListSection header="Food" footer="Ate at a place we recommended? Claim points with your receipt.">
      <ListRow icon={<StarIcon size={17} />} title="Claim points for a meal" href="/rewards/claim" />
      <ListRow icon={<StarIcon size={17} />} title="My ratings" value={ratings ?? "–"} />
      <ListRow icon={<HeartIcon size={16} />} title="Wishlist" value={wishlist ?? "–"} />
    </ListSection>
  );
}
