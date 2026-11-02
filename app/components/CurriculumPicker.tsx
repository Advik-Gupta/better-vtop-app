"use client";

import type { CurriculumEntry } from "@/app/lib/publicData";

export default function CurriculumPicker({
  list,
  value,
  onChange,
}: {
  list: CurriculumEntry[];
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <label className="field">
      <span>Branch and batch</span>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {list.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
