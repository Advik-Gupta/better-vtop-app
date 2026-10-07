"use client";

import { useState } from "react";
import { useApp } from "@/app/lib/appContext";
import CgpaCalculator from "./CgpaCalculator";
import GradeHistory from "./GradeHistory";
import MarksSemester from "./MarksSemester";

const SECTIONS = [
  { key: "semester", label: "This semester" },
  { key: "grades", label: "Grades" },
  { key: "cgpa", label: "CGPA" },
] as const;

type Section = (typeof SECTIONS)[number]["key"];

export default function MarksView({ onSync }: { onSync: () => void }) {
  const { data } = useApp();
  const [section, setSection] = useState<Section>("semester");

  // Data cached before marks existed has none of this yet.
  if (!data.marks || !data.grades) {
    return (
      <section className="card">
        <div className="empty">
          <p>Marks and grades haven&apos;t been loaded yet.</p>
          <button className="btn btn-primary btn-inline" onClick={onSync}>
            Sync with VTOP
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="chips sections" role="tablist" aria-label="Marks sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={section === s.key}
            className={`chip ${section === s.key ? "active" : ""}`}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "semester" && <MarksSemester />}
      {section === "grades" && <GradeHistory />}
      {section === "cgpa" && <CgpaCalculator />}
    </div>
  );
}
