// Owner: P4 - Game Layer & Map (see TEAM.md)
// Profile "Food" rows with real counts, the Food & Diet settings, and the entry to claim points for a meal.
"use client";

import { useEffect, useState } from "react";
import { ForkKnifeIcon, HeartIcon, ListRow, ListSection, StarIcon } from "@/components/shared/ios";
import { DIETARY } from "@/components/auth/foodOptions";

const count = (path: string, key: string) =>
  fetch(path, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => (Array.isArray(b?.[key]) ? (b[key] as unknown[]).length : null))
    .catch(() => null);

export default function FoodRows() {
  const [ratings, setRatings] = useState<number | null>(null);
  const [wishlist, setWishlist] = useState<number | null>(null);
  const [diet, setDiet] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/me/preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const list: string[] = Array.isArray(b?.preferences?.dietary) ? b.preferences.dietary : [];
        const labels = list.map((d) => DIETARY.find((x) => x.value === d)?.label ?? d);
        setDiet(labels.length === 0 ? "None" : labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`);
      })
      .catch(() => {});
    void count("/api/ratings", "ratings").then(setRatings);
    void count("/api/wishlist", "wishlist").then(setWishlist);
  }, []);
  return (
    <ListSection header="Food" footer="Ate at a place we recommended? Claim points with your receipt.">
      <ListRow icon={<ForkKnifeIcon size={16} />} title="Food & diet" value={diet ?? undefined} href="/profile/food" />
      <ListRow icon={<StarIcon size={17} />} title="Claim points for a meal" href="/rewards/claim" />
      <ListRow icon={<StarIcon size={17} />} title="My ratings" value={ratings ?? "–"} />
      <ListRow icon={<HeartIcon size={16} />} title="Wishlist" value={wishlist ?? "–"} />
    </ListSection>
  );
}
