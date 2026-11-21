// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Station select as an iOS form row. Uses a native <select>, so iPhones show the system
// wheel picker. Put inside <ListSection>.
"use client";

export type StationOption = { id: string; name: string };

type Props = {
  label: string;
  stations: readonly StationOption[];
  value: string;
  onChange: (stationId: string) => void;
  placeholder?: string;
};

export default function StationPicker({ label, stations, value, onChange, placeholder = "Choose" }: Props) {
  const id = `station-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="ios-row flex items-center">
      <div className="ios-row-body ml-4 flex min-h-11 flex-1 items-center gap-3 pr-4">
        <label htmlFor={id} className="shrink-0 text-[17px]">
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`min-w-0 flex-1 appearance-none bg-transparent py-2.5 text-right text-[17px] outline-none ${value ? "text-label-2" : "text-tint"}`}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
