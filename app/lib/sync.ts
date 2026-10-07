/* Browser-side calls to our /api/vtop routes. */

import type { VtopData } from "@/app/types/vtop";

export class SessionExpired extends Error {
  constructor() {
    super("Your VTOP session has expired. Sign in again to refresh.");
  }
}

async function post<T>(path: string, body: object = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/vtop/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("You appear to be offline.");
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.error === "session_expired") throw new SessionExpired();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json as T;
}

export interface CaptchaReply {
  captcha: string | null;
  reason?: string;
}

export const fetchCaptcha = () => post<CaptchaReply>("captcha");

export const login = (username: string, password: string, captcha: string) =>
  post<{ regNo: string }>("login", { username, password, captcha });

export const logout = () => post("logout").catch(() => undefined);

export const SYNC_STEPS = [
  { key: "semesters", label: "Finding your semester" },
  { key: "attendance", label: "Attendance, class by class" },
  { key: "timetable", label: "Timetable" },
  { key: "calendar", label: "Academic calendar" },
  { key: "assignments", label: "Digital assignments" },
  { key: "marks", label: "Marks" },
  { key: "grades", label: "Grades and CGPA" },
] as const;

export type SyncStep = (typeof SYNC_STEPS)[number]["key"];

/** Pulls everything from VTOP, one part at a time so progress is real. */
export async function syncAll(
  onStep: (step: SyncStep) => void,
  preferredSemester?: string,
): Promise<VtopData> {
  onStep("semesters");
  const { regNo, semesters } = await post<Pick<VtopData, "regNo" | "semesters">>(
    "data",
    { part: "semesters" },
  );
  const semester =
    semesters.find((s) => s.id === preferredSemester) ?? semesters[0];
  if (!semester) throw new Error("VTOP did not list any semesters.");
  const semesterId = semester.id;

  onStep("attendance");
  const { courses, records } = await post<Pick<VtopData, "courses" | "records">>(
    "data",
    { part: "attendance", semesterId },
  );

  onStep("timetable");
  const { timetable, registered } = await post<
    Pick<VtopData, "timetable" | "registered">
  >("data", { part: "timetable", semesterId });

  onStep("calendar");
  const { calendar } = await post<Pick<VtopData, "calendar">>("data", {
    part: "calendar",
    semesterId,
    classGroup: courses[0]?.classGroup ?? "",
  });

  onStep("assignments");
  const { assignments } = await post<Pick<VtopData, "assignments">>("data", {
    part: "assignments",
    semesterId,
  });

  onStep("marks");
  const { marks } = await post<Pick<VtopData, "marks">>("data", {
    part: "marks",
    semesterId,
  });

  onStep("grades");
  const { grades } = await post<Pick<VtopData, "grades">>("data", {
    part: "grades",
    semesterId,
    since: semesters.map((s) => s.id).sort()[0],
  });

  return {
    regNo,
    semester,
    semesters,
    courses,
    records,
    timetable,
    registered,
    calendar,
    assignments,
    marks,
    grades,
    syncedAt: new Date().toISOString(),
  };
}
