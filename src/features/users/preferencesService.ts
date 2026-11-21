// Owner: P2 - Data & Integrations (see TEAM.md)
// Food/travel preferences that prefill Spin and room join forms.
import { readTags, type PreferencesUpdate } from "./schemas";
import type { Db } from "./userService";

export type Preferences = {
  tastes: string[];
  avoid: string[];
  dietary: string[];
  defaultBudget: number | null;
  maxWalkMinutes: number | null;
  homeStationId: string | null;
  usualStartStationId: string | null;
  city: string | null;
  shareLocation: boolean;
  updatedAt: string;
};

type Row = Awaited<ReturnType<Db["userPreferences"]["upsert"]>>;

function toPreferences(p: Row): Preferences {
  return {
    tastes: readTags(p.tastes),
    avoid: readTags(p.avoid),
    dietary: readTags(p.dietary),
    defaultBudget: p.defaultBudget,
    maxWalkMinutes: p.maxWalkMinutes,
    homeStationId: p.homeStationId,
    usualStartStationId: p.usualStartStationId,
    city: p.city,
    shareLocation: p.shareLocation,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function getPreferences(db: Db, userId: string): Promise<Preferences> {
  // upsert so older users without a row still get defaults
  const p = await db.userPreferences.upsert({ where: { userId }, create: { userId }, update: {} });
  return toPreferences(p);
}

/** Partial update. Turning shareLocation off also deletes any stored location. */
export async function updatePreferences(db: Db, userId: string, patch: PreferencesUpdate): Promise<Preferences> {
  const [p] = await db.$transaction([
    db.userPreferences.upsert({ where: { userId }, create: { userId, ...patch }, update: patch }),
    ...(patch.shareLocation === false ? [db.userLocation.deleteMany({ where: { userId } })] : []),
  ]);
  return toPreferences(p as Row);
}
