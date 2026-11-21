// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// iOS form controls: text field rows (inside ListSection) and a segmented control.
"use client";

import type { InputHTMLAttributes } from "react";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { label: string };

/** A labeled text field row, like a SwiftUI Form TextField. Put inside <ListSection>. */
export function TextFieldRow({ label, id, ...input }: FieldProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="ios-row flex items-center">
      <div className="ios-row-body ml-4 flex min-h-11 flex-1 items-center gap-3 pr-4">
        <label htmlFor={inputId} className="w-24 shrink-0 text-[17px]">
          {label}
        </label>
        <input id={inputId} className="min-w-0 flex-1 bg-transparent py-2.5 text-[17px] outline-none placeholder:text-label-3" {...input} />
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
      <div className="ios-row-body ml-4 flex min-h-11 flex-1 items-center gap-3 pr-4">
        <label htmlFor={id} className="shrink-0 text-[17px]">
          {label}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => {
            const picked = options.find((o) => String(o.value) === e.target.value);
            if (picked) onChange(picked.value);
          }}
          className="min-w-0 flex-1 appearance-none bg-transparent py-2.5 text-right text-[17px] text-label-2 outline-none"
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

/** iOS segmented control (UISegmentedControl / Picker .segmented). */
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex rounded-[9px] bg-cell-2 p-[2px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-[7px] py-1.5 text-[13px] font-semibold transition-all ${active ? "bg-cell shadow-sm ring-[0.5px] ring-black/5" : "text-label-2"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
