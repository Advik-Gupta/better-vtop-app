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
  { key: "marks", label: "Marks" },
] as const;

export type SyncStep = (typeof SYNC_STEPS)[number]["key"];

/** Pulled after the app has opened. Most of these hardly ever change, so they
 *  are only asked for when missing; assignments are refreshed every time. */
export type Part = "assignments" | "timetable" | "calendar" | "grades" | "curriculum";

export const PART_LABELS: Record<Part, string> = {
  assignments: "assignments",
  timetable: "timetable",
  calendar: "academic calendar",
  grades: "grades",
  curriculum: "curriculum",
};

/** What has to be fetched before the app opens: the things that change from
 *  day to day. Everything else is carried over from the last sync. */
export async function syncQuick(
  onStep: (step: SyncStep) => void,
  previous: VtopData | null,
): Promise<VtopData> {
  onStep("semesters");
  const { regNo, semesters } = await post<Pick<VtopData, "regNo" | "semesters">>("data", {
    part: "semesters",
  });
  const semester =
    semesters.find((s) => s.id === previous?.semester.id) ?? semesters[0];
  if (!semester) throw new Error("VTOP did not list any semesters.");
  const semesterId = semester.id;

  onStep("attendance");
  const { courses, records } = await post<Pick<VtopData, "courses" | "records">>("data", {
    part: "attendance",
    semesterId,
  });

  onStep("marks");
  const { marks } = await post<Pick<VtopData, "marks">>("data", { part: "marks", semesterId });

  const same = previous?.regNo === regNo;
  const sameSemester = same && previous?.semester.id === semesterId;
  return {
    regNo,
    semester,
    semesters,
    courses,
    records,
    marks,
    timetable: sameSemester ? previous.timetable : [],
    registered: sameSemester ? previous.registered : undefined,
    calendar: sameSemester ? previous.calendar : [],
    assignments: sameSemester ? previous.assignments : [],
    grades: same ? previous.grades : undefined,
    curriculum: same ? previous.curriculum : undefined,
    updated: sameSemester ? previous.updated : same ? { curriculum: previous.updated?.curriculum } : {},
    syncedAt: new Date().toISOString(),
  };
}

/** The background parts this data still needs. */
export function partsToFetch(data: VtopData): Part[] {
  const parts: Part[] = ["assignments"];
  if (!data.timetable.length || !data.registered) parts.push("timetable");
  if (!data.calendar.length) parts.push("calendar");
  if (!data.grades) parts.push("grades");
  if (!data.curriculum?.categories.length) parts.push("curriculum");
  return parts;
}

export async function fetchPart(part: Part, data: VtopData): Promise<Partial<VtopData>> {
  const semesterId = data.semester.id;
  if (part === "assignments") return post("data", { part, semesterId });
  if (part === "timetable") return post("data", { part, semesterId });
  if (part === "calendar") {
    return post("data", { part, semesterId, classGroup: data.courses[0]?.classGroup ?? "" });
  }
  if (part === "grades") {
    return post("data", {
      part,
      semesterId,
      since: data.semesters.map((s) => s.id).sort()[0],
    });
  }
  return post("data", { part, semesterId });
}
