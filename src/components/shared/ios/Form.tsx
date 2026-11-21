// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Form controls in the Taste of T style: text field and select rows (inside ListSection)
// and the lavender segmented control.
"use client";

import type { InputHTMLAttributes } from "react";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { label: string };

/** A labeled text field row, like a SwiftUI Form TextField. Put inside <ListSection>. */
export function TextFieldRow({ label, id, ...input }: FieldProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="ios-row flex items-center">
      <div className="ios-row-body ml-4 flex min-h-[56px] flex-1 items-center gap-3 pr-4">
        <label htmlFor={inputId} className="w-24 shrink-0 text-[16px] font-semibold">
          {label}
        </label>
        <input id={inputId} className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-label-3" {...input} />
      </div>
    </div>
  );
}

/** A row with a native <select> on the right (iPhone shows the wheel picker). Put inside <ListSection>. */
export function SelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = `sel-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="ios-row flex items-center">
      <div className="ios-row-body ml-4 flex min-h-[56px] flex-1 items-center gap-3 pr-4">
        <label htmlFor={id} className="shrink-0 text-[16px] font-semibold">
          {label}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => {
            const picked = options.find((o) => String(o.value) === e.target.value);
            if (picked) onChange(picked.value);
          }}
          className="min-w-0 flex-1 appearance-none bg-transparent py-3 text-right text-[16px] text-label-2 outline-none"
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Segmented control: lavender track, white pill on the selected option (Figma "tabs"). */
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex rounded-[16px] bg-lavender p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`h-10 flex-1 rounded-[13px] text-[15px] font-semibold transition-all ${active ? "bg-cell text-label shadow-[0_3px_9px_rgb(56_46_90/0.08)]" : "text-label-2"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
