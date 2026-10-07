"use client";

import { createContext, useContext } from "react";
import type { CourseStats, Lookup } from "@/app/lib/engine";
import type { ImportantDates } from "@/app/lib/importantDates";
import type { CoursePlan, GradePicks, MarkPlans } from "@/app/lib/marks";
import type { LocalMarks, Status, VtopData } from "@/app/types/vtop";

export interface AppState {
  data: VtopData;
  look: Lookup;
  marks: LocalMarks;
  important: ImportantDates;
  today: string;
  /** Sorted most-at-risk first. */
  stats: CourseStats[];
  statsByCode: Map<string, CourseStats>;
  /** Set (or clear, with null) the user's own mark for a class. */
  mark: (date: string, code: string, status: Status | null) => void;
  /** Flag a date as important with a note; null removes the flag. */
  setImportant: (date: string, note: string | null) => void;
  /** The student's own marks components and expectations, per course. */
  plans: MarkPlans;
  updatePlan: (code: string, change: (plan: CoursePlan) => CoursePlan) => void;
  /** Grades picked in the CGPA calculator; null clears one. */
  picks: GradePicks;
  setPick: (code: string, grade: string | null) => void;
  openDay: (date: string) => void;
  openCourse: (code: string) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside the app shell");
  return ctx;
}
