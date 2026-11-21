// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Profile > Account: who's signed in, their dietary restrictions, and Sign Out.
"use client";

import { useEffect, useState } from "react";
import { ListRow, ListSection } from "@/components/shared/ios";
import { getMe, logOut, type Me } from "@/lib/identity";

const LABELS: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  kosher: "Kosher",
  "gluten-free": "Gluten-free",
  "dairy-free": "Dairy-free",
  "nut-free": "Nut allergy",
};

export default function AccountSection() {
  const [me, setMe] = useState<Me | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getMe().then(setMe).catch(() => setMe(null));
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await logOut();
    } finally {
      window.location.replace("/login");
    }
  }

  const dietary = me?.preferences.dietary ?? [];

  return (
    <ListSection header="Account" footer={me?.user.isGuest ? "Guest progress is saved on this device only." : undefined}>
      <ListRow title={me?.user.displayName ?? "…"} subtitle={me ? (me.user.isGuest ? "Guest" : me.user.email) : undefined} />
      <ListRow title="Dietary" value={dietary.length ? dietary.map((d) => LABELS[d] ?? d).join(", ") : me ? "None" : "…"} />
      <ListRow title={signingOut ? "Signing out…" : "Sign Out"} destructive onClick={signingOut ? undefined : signOut} />
    </ListSection>
  );
}
