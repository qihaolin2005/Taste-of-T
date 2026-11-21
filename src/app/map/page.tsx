// Owner: P4 - Game Layer & Map (see TEAM.md)
// SVG T map: unlocked vs unexplored stations.
// TODO(P4): replace the placeholder card with <TMap /> rendered from data/stations.json.
import { ListRow, ListSection, Screen } from "@/components/shared/ios";

const LINES = [
  { name: "Red Line", color: "var(--line-red)" },
  { name: "Orange Line", color: "var(--line-orange)" },
  { name: "Blue Line", color: "var(--line-blue)" },
  { name: "Green Line", color: "var(--line-green)" },
];

export default function Page() {
  return (
    <Screen title="T Map" tab="map">
      <div className="mt-3 flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-cell">
        <svg viewBox="0 0 200 200" className="h-4/5 w-4/5" aria-label="T map placeholder">
          <path d="M40 30 L100 100 L150 170" stroke="var(--line-red)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M100 20 L100 180" stroke="var(--line-orange)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M100 100 L175 60" stroke="var(--line-blue)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M25 120 L100 100 L130 70" stroke="var(--line-green)" strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="100" cy="100" r="7" fill="var(--cell)" stroke="var(--label)" strokeWidth="3" />
        </svg>
      </div>

      <ListSection header="Lines">
        {LINES.map((l) => (
          <ListRow key={l.name} icon={<span className="block h-2 w-4 rounded-full bg-white" />} iconBg={l.color} title={l.name} value="0 stamps" />
        ))}
      </ListSection>
    </Screen>
  );
}
