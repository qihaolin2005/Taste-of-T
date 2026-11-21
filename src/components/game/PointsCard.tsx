// Owner: P4 - Game Layer & Map (see TEAM.md)
// Profile header (name + points total) and the points history list.
"use client";

import { useEffect, useState } from "react";
import { ListRow, ListSection, PersonIcon, StarIcon } from "@/components/shared/ios";
import { getMe } from "@/lib/identity";
import { formatPoints, usePoints } from "./usePoints";

export function ProfileHeader() {
  const points = usePoints();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    getMe()
      .then(({ user }) => setName(user.displayName))
      .catch(() => setName(null));
  }, []);

  return (
    <div className="mt-3 flex items-center gap-4 rounded-[10px] bg-cell p-4">
      <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-tint/15 text-tint">
        <PersonIcon size={40} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[20px] font-semibold">{name ?? "…"}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-label-2">
          <StarIcon size={15} className="text-[#ffcc00]" />
          <span className="font-semibold tabular-nums text-label">{points ? points.total.toLocaleString("en-US") : "–"}</span> points
        </p>
      </div>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PointsHistory() {
  const points = usePoints();
  return (
    <ListSection header="Points History" footer={points && points.events.length === 0 ? "Complete a quest to earn your first points." : undefined}>
      {!points ? (
        <ListRow title="Loading…" />
      ) : points.events.length === 0 ? (
        <ListRow title="No points yet" />
      ) : (
        points.events.map((e) => (
          <ListRow
            key={e.id}
            icon={<StarIcon size={17} />}
            iconBg="#ffcc00"
            title={e.questTitle ?? "Quest completed"}
            subtitle={when(e.createdAt)}
            value={<span className="font-semibold text-tint">+{e.amount}</span>}
          />
        ))
      )}
    </ListSection>
  );
}

/** Just the total, e.g. for the Home "Your Progress" row. */
export function PointsValue() {
  const points = usePoints();
  return <>{points ? formatPoints(points.total) : "–"}</>;
}
