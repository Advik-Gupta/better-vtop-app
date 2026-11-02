/* The public tools work without VTOP: curricula come from files saved by
   students who synced, and everything else is typed in. */

import { useEffect, useState } from "react";
import type { Curriculum, Grades, VtopData } from "@/app/types/vtop";

export interface CurriculumEntry {
  key: string;
  label: string;
}

export function useCurricula() {
  const [list, setList] = useState<CurriculumEntry[] | null>(null);
  useEffect(() => {
    fetch("/curricula/index.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((entries: CurriculumEntry[]) => setList(entries))
      .catch(() => setList([]));
  }, []);
  return list;
}

export function useCurriculum(key: string | null) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch(`/curricula/${encodeURIComponent(key)}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((file) => live && setCurriculum(file?.curriculum ?? null))
      .catch(() => live && setCurriculum(null));
    return () => {
      live = false;
    };
  }, [key]);
  return key ? curriculum : null;
}

/** "Fall Semester 2026-27" from July to December, "Winter Semester 2025-26"
 *  from January to June. */
export function currentTerm(date = new Date()): string {
  const y = date.getFullYear();
  return date.getMonth() >= 6
    ? `Fall Semester ${y}-${String(y + 1).slice(2)}`
    : `Winter Semester ${y - 1}-${String(y).slice(2)}`;
}

/** Grades that add up to a given CGPA over given credits, for the CGPA
 *  maths: an S-graded share and an F-graded share of the credits. */
export function gradesFor(cgpa: number, credits: number, finishedSemesters = 0): Grades {
  const safe = Math.max(0, Math.min(10, cgpa));
  const strong = (safe / 10) * credits;
  return {
    cgpa: safe,
    creditsRegistered: credits,
    creditsEarned: credits,
    creditsRequired: 0,
    counts: {},
    history:
      credits > 0
        ? [
            { code: "PASTA", name: "", type: "", credits: strong, grade: "S" },
            { code: "PASTB", name: "", type: "", credits: credits - strong, grade: "F" },
          ]
        : [],
    curriculum: [],
    semesters: Array.from({ length: finishedSemesters }, (_, i) => ({
      semester: { id: `past-${i}`, name: i % 2 ? "Winter Semester" : "Fall Semester" },
      gpa: null,
      courses: [],
    })),
  };
}

/** Just enough of VtopData for the planners. */
export function plannerData(curriculum: Curriculum, semesterNumber: number): VtopData {
  return {
    regNo: "",
    semester: { id: "public", name: currentTerm() },
    semesters: [],
    courses: [],
    records: {},
    timetable: [],
    calendar: [],
    assignments: [],
    registered: [],
    grades: { ...gradesFor(0, 0, Math.max(0, semesterNumber - 1)), creditsRequired: curriculum.total },
    curriculum,
    syncedAt: new Date().toISOString(),
  };
}
