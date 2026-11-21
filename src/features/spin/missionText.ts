// Owner: P1 - Planner & Quests (see TEAM.md)
// Quest title / mission text for Spin the T.

export function questTitle(placeName: string | null): string {
  return `Eat at ${placeName ?? "a mystery spot"}`;
}

export function distanceText(miles: number | null): string {
  if (miles == null) return "Nearby";
  if (miles < 0.1) return "Right around the corner";
  return `${miles < 1 ? miles.toFixed(1) : miles.toFixed(1).replace(/\.0$/, "")} mi away`;
}

export function missionText(p: { name: string | null; neighborhood: string | null; distanceMiles: number | null }): string {
  const where = p.neighborhood ? ` in ${p.neighborhood}` : "";
  const how = p.distanceMiles != null && p.distanceMiles < 0.6 ? "It's a short walk" : "Take the bus or T there for bonus points";
  return `${distanceText(p.distanceMiles)}${where}. ${how}. Start the trip and the quest completes when you arrive.`;
}

export const priceText = (level: number | null) => (level ? "$".repeat(level) : null);
