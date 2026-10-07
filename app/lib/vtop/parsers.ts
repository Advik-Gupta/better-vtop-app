/* VTOP answers with HTML fragments; these turn them into typed data. Each
   parser is deliberately tolerant - a missing table yields an empty list. */

import * as cheerio from "cheerio";
import type {
  Assignment,
  CalendarDay,
  ClassRecord,
  Course,
  CourseKind,
  CourseMarks,
  DayType,
  GradedCourse,
  Grades,
  RegisteredCourse,
  Semester,
  SemesterGrades,
  Status,
  TimetableEntry,
} from "../../types/vtop";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "06-10-2026" or "02-Nov-2026" -> "2026-10-06". */
export function toISODate(raw: string): string | null {
  const m = clean(raw).match(/^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{4})/);
  if (!m) return null;
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${pad(month)}-${pad(Number(m[1]))}`;
}

function cells($: cheerio.CheerioAPI, row: Parameters<cheerio.CheerioAPI>[0]) {
  return $(row)
    .children("td, th")
    .map((_, c) => clean($(c).text()))
    .get();
}

/* ── Login / session pages ── */

export function parseCsrf(html: string): string | null {
  return (
    html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1] ??
    html.match(/csrfValue\s*=\s*"([^"]+)"/)?.[1] ??
    null
  );
}

/** The image captcha as a data URI, or null when VTOP is showing reCAPTCHA. */
export function parseCaptchaImage(html: string): string | null {
  const $ = cheerio.load(html);
  const src =
    $("#captchaBlock img").attr("src") ??
    $('img[src^="data:image"]').attr("src");
  return src && src.startsWith("data:image") ? src.replace(/\s+/g, "") : null;
}

export function parseRegNo(html: string): string | null {
  return (
    html.match(/id="authorizedIDX?"[^>]*value="([^"]+)"/)?.[1] ??
    html.match(/name="authorizedID"[^>]*value="([^"]+)"/)?.[1] ??
    html.match(/var\s+id\s*=\s*"(\d{2}[A-Z]{3}\d{4})"/)?.[1] ??
    html.match(/\b\d{2}[A-Z]{3}\d{4}\b/)?.[0] ??
    null
  );
}

/** Best-effort reason shown by VTOP on a failed login. */
export function parseLoginError(html: string): string | null {
  const known = html.match(
    /Invalid\s+Captcha|Invalid\s+(?:Login\s*Id|User\s*Id|Username)[^<]{0,40}|(?:User|Account)[^<]{0,30}(?:locked|blocked)[^<]{0,40}|Maximum[^<]{0,60}attempts[^<]{0,40}/i,
  );
  if (known) return clean(known[0]);
  const $ = cheerio.load(html);
  const text = $(".text-danger, .alert-danger, [role='alert']")
    .map((_, e) => clean($(e).text()))
    .get()
    .find(
      (t) => t.length > 3 && t.length < 160 && !/session timed out/i.test(t),
    );
  return text ?? null;
}

export const isLoginPage = (html: string) =>
  html.includes('id="vtopLoginForm"');

/* ── Semesters ── */

export function parseSemesters(html: string): Semester[] {
  const $ = cheerio.load(html);
  return $("#semesterSubId option")
    .map((_, o) => ({
      id: $(o).attr("value") ?? "",
      name: clean($(o).text()).replace(/\s*-\s*VLR$/i, ""),
    }))
    .get()
    .filter((s) => s.id);
}

/* ── Attendance ── */

function courseKind(typeLabel: string, courseType: string): CourseKind {
  if (courseType === "LO" || /lab/i.test(typeLabel)) return "lab";
  if (courseType === "TH" || /theory/i.test(typeLabel)) return "theory";
  return "other";
}

export function parseAttendanceSummary(html: string): Course[] {
  const $ = cheerio.load(html);
  const courses: Course[] = [];
  $("#AttendanceDetailDataTable tr").each((_, row) => {
    const c = cells($, row);
    if (c.length < 8 || !/^\d+$/.test(c[0])) return;

    // "BECE302L - Control Systems - Theory Only"; names may contain " - ".
    const course = c[2].split(" - ");
    const code = course[0];
    const typeLabel = course.length > 2 ? course[course.length - 1] : "";
    const name = course
      .slice(1, course.length > 2 ? -1 : undefined)
      .join(" - ");
    const [classId = "", slot = "", venue = ""] = c[3].split(" - ");

    // onclick="callStudentAttendanceDetailDisplay('sem','reg','courseId','TH')"
    const onclick = $(row).find("[onclick]").attr("onclick") ?? "";
    const args = [...onclick.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const courseType = args[3] ?? "";

    const debar = c[8] && c[8] !== "-" ? c[8] : null;
    courses.push({
      code,
      name,
      kind: courseKind(typeLabel, courseType),
      typeLabel,
      classId,
      classGroup: c[1],
      slot,
      venue,
      faculty: c[4].replace(/\s*-\s*[A-Z]+$/, ""),
      attended: Number(c[5]) || 0,
      total: Number(c[6]) || 0,
      percentage: parseInt(c[7], 10) || 0,
      debar,
      courseId: args[2] ?? "",
      courseType,
    });
  });
  return courses;
}

function toStatus(raw: string): Status | null {
  const s = raw.toLowerCase();
  if (s.startsWith("present")) return "present";
  if (s.startsWith("absent")) return "absent";
  if (s.includes("duty")) return "od";
  return null; // medical leave etc. - not counted by VTOP either
}

export function parseAttendanceDetail(html: string): ClassRecord[] {
  const $ = cheerio.load(html);
  const records: ClassRecord[] = [];
  $("#StudentAttendanceDetailDataTable tr").each((_, row) => {
    const c = cells($, row);
    if (c.length < 5) return;
    const date = toISODate(c[1]);
    const status = toStatus(c[4]);
    if (!date || !status) return;
    records.push({
      date,
      slot: c[2],
      time: c[3].split("/").pop()?.trim() ?? "",
      status,
    });
  });
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Timetable ── */

const DAY_INDEX: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

export function parseTimetable(html: string): TimetableEntry[] {
  const $ = cheerio.load(html);
  const times: Record<"theory" | "lab", { start: string[]; end: string[] }> = {
    theory: { start: [], end: [] },
    lab: { start: [], end: [] },
  };
  const entries: TimetableEntry[] = [];
  let headerKind: "theory" | "lab" = "theory";
  let day = 0;

  $("#timeTableStyle tr").each((_, row) => {
    const c = cells($, row);
    if (c.length < 3) return;

    // Header rows: [THEORY|LAB, Start, …] followed by [End, …].
    if (c[1] === "Start") {
      headerKind = c[0].toUpperCase() === "LAB" ? "lab" : "theory";
      times[headerKind].start = c.slice(2);
      return;
    }
    if (c[0] === "End") {
      times[headerKind].end = c.slice(1);
      return;
    }

    // Day rows: [MON, THEORY, …] followed by [LAB, …].
    let kindCell = c[0];
    let rest = c.slice(1);
    if (DAY_INDEX[c[0].toUpperCase()]) {
      day = DAY_INDEX[c[0].toUpperCase()];
      kindCell = c[1];
      rest = c.slice(2);
    }
    const kind = kindCell.toUpperCase() === "LAB" ? "lab" : "theory";
    if (!day) return;

    rest.forEach((cell, i) => {
      // "G2-BECE302L-TH-TT531-ALL" - an occupied slot.
      const parts = cell.split("-");
      if (parts.length < 4 || !/^[A-Z]{3,5}\d{3}[A-Z]?$/.test(parts[1])) return;
      entries.push({
        day,
        slot: parts[0],
        code: parts[1],
        kind,
        venue: parts.slice(3, -1).join("-"),
        start: times[kind].start[i] ?? "",
        end: times[kind].end[i] ?? "",
      });
    });
  });
  return entries;
}

/* ── Academic calendar ── */

export function parseClassGroups(html: string): { id: string; name: string }[] {
  const $ = cheerio.load(html);
  return $("#classGroupId option")
    .map((_, o) => ({ id: $(o).attr("value") ?? "", name: clean($(o).text()) }))
    .get()
    .filter((g) => g.id);
}

/** Month keys such as "01-OCT-2026" offered for a semester. */
export function parseCalendarMonths(html: string): string[] {
  return [
    ...html.matchAll(/processViewCalendar\((?:&#39;|')([^'&]+)(?:&#39;|')\)/g),
  ].map((m) => m[1]);
}

function dayType(label: string): DayType {
  const l = label.toLowerCase();
  if (!l) return "no_instruction";
  if (/no\s+instruction|non[-\s]?instruction/.test(l)) return "no_instruction";
  if (l.includes("instructional")) return "instructional";
  if (l.includes("holiday")) return "holiday";
  if (/\b(cat|fat|exam|assessment)/.test(l)) return "exam";
  if (/vacation|break/.test(l)) return "no_instruction";
  return "other";
}

/** `monthKey` is the "01-OCT-2026" value the month was requested with. */
export function parseCalendarMonth(
  html: string,
  monthKey: string,
): CalendarDay[] {
  const first = toISODate(monthKey);
  if (!first) return [];
  const prefix = first.slice(0, 8);
  const $ = cheerio.load(html);
  const days: CalendarDay[] = [];

  $("table.calendar-table td, table td").each((_, td) => {
    const spans = $(td)
      .children("span")
      .map((__, s) => clean($(s).text()))
      .get();
    if (!spans.length || !/^\d{1,2}$/.test(spans[0])) return;
    const date = prefix + pad(Number(spans[0]));
    if (days.some((d) => d.date === date)) return;

    const label = spans[1] ?? "";
    const detail = (spans[2] ?? "").replace(/^\(|\)$/g, "");
    const type =
      detail.toLowerCase().includes("exam") && dayType(label) === "other"
        ? "exam"
        : dayType(label);
    const order = detail
      .match(/^(\w+)\s+Day Order/i)?.[1]
      .slice(0, 3)
      .toUpperCase();
    days.push({
      date,
      type,
      label,
      detail,
      ...(order && DAY_INDEX[order] ? { dayOrder: DAY_INDEX[order] } : {}),
    });
  });
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Digital assignments ── */

export interface AssignmentCourse {
  classId: string;
  code: string;
  course: string;
}

export function parseAssignmentCourses(html: string): AssignmentCourse[] {
  const $ = cheerio.load(html);
  const list: AssignmentCourse[] = [];
  $("table tr").each((_, row) => {
    const c = cells($, row);
    if (c.length < 4 || !/^[A-Z]{2}\d{10,}$/.test(c[1])) return;
    list.push({ classId: c[1], code: c[2], course: c[3] });
  });
  return list;
}

export function parseAssignments(
  html: string,
  of: AssignmentCourse,
): Assignment[] {
  const $ = cheerio.load(html);
  const list: Assignment[] = [];
  $("table tr").each((_, row) => {
    const c = cells($, row);
    // [Sl.No, Title, Max mark, Weightage, Due date, QP, Last updated, …]
    if (c.length < 7 || !/^\d+$/.test(c[0])) return;
    const due = toISODate(c[4]);
    if (!due && !c[1]) return;
    const submittedOn = /\d{4}/.test(c[6]) ? c[6] : "";
    list.push({
      ...of,
      title: c[1],
      due,
      maxMark: c[2],
      weightage: c[3],
      submitted: Boolean(submittedOn),
      submittedOn,
    });
  });
  return list;
}

/* ── Registered courses (from the timetable page) ── */

export function parseRegistered(html: string): RegisteredCourse[] {
  const $ = cheerio.load(html);
  const list: RegisteredCourse[] = [];
  $("table tr").each((_, row) => {
    const c = cells($, row);
    // [Sl.No, Class group, "CODE - Name ( Type )", "L T P J C", Category, Option, Class id, …]
    if (c.length < 9 || !/^\d+$/.test(c[0])) return;
    const m = c[2].match(/^([A-Z]{3,5}\d{3}[A-Z]?)\s*-\s*(.*?)\s*\(\s*([^)]*?)\s*\)\s*$/);
    const credits = Number(c[3].split(" ").pop());
    if (!m || Number.isNaN(credits)) return;
    list.push({
      code: m[1],
      name: m[2],
      typeLabel: m[3],
      credits,
      category: c[4],
      classId: c[6],
    });
  });
  return list;
}

/* ── Marks ── */

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};

export function parseMarks(html: string): CourseMarks[] {
  const $ = cheerio.load(html);
  const courses: CourseMarks[] = [];
  // Course rows and the rows of each course's nested marks table come out
  // in document order, so a mark row belongs to the course before it.
  $("tr").each((_, row) => {
    const c = cells($, row);
    if (c.length >= 8 && /^[A-Z]{2}\d{10,}$/.test(c[1])) {
      courses.push({ classId: c[1], code: c[2], name: c[3], typeLabel: c[4], items: [] });
      return;
    }
    const current = courses[courses.length - 1];
    if (!current || c.length < 7 || !/^\d+$/.test(c[0]) || !/^[\d.]+$/.test(c[2])) return;
    current.items.push({
      title: c[1],
      max: num(c[2]),
      weight: num(c[3]),
      status: c[4],
      scored: num(c[5]),
      weighted: num(c[6]),
      remark: c[7] ?? "",
    });
  });
  return courses;
}

/* ── Grades ── */

export function parseSemesterGrades(html: string): Omit<SemesterGrades, "semester"> {
  const $ = cheerio.load(html);
  const courses: GradedCourse[] = [];
  $("table tr").each((_, row) => {
    const c = cells($, row);
    // [Sl.No, Code, Title, Type, L, P, J, C, Grading type, Grand total, Grade, …]
    if (c.length < 11 || !/^\d+$/.test(c[0]) || !/^[A-Z]{3,5}\d{3}/.test(c[1])) return;
    courses.push({
      code: c[1],
      name: c[2],
      type: c[3],
      credits: num(c[7]),
      gradingType: c[8],
      total: c[9] === "" ? undefined : num(c[9]),
      grade: c[10],
    });
  });
  const gpa = html.match(/GPA\s*:\s*([\d.]+)/)?.[1];
  return { courses, gpa: gpa ? Number(gpa) : null };
}

export function parseGradeHistory(html: string): Omit<Grades, "semesters"> {
  const $ = cheerio.load(html);
  const history: GradedCourse[] = [];
  const curriculum: Grades["curriculum"] = [];
  let summary: string[] = [];
  let summaryHead: string[] = [];

  $("table tr").each((_, row) => {
    const c = cells($, row);
    // Effective grades: [Sl.No, Code, Title, Type, Credits, Grade, Exam month, Result, Distribution, …]
    if (c.length >= 9 && /^\d+$/.test(c[0]) && /^[A-Z]{3,5}\d{3}/.test(c[1])) {
      history.push({
        code: c[1],
        name: c[2],
        type: c[3],
        credits: num(c[4]),
        grade: c[5],
        examMonth: c[6],
      });
    } else if (c.length === 3 && /^[\d.]+$/.test(c[1]) && /^[\d.]+$/.test(c[2])) {
      curriculum.push({ type: c[0], required: num(c[1]), earned: num(c[2]) });
    } else if (c.length >= 4 && c[0] === "Credits Registered") {
      summaryHead = c;
    } else if (summaryHead.length && !summary.length && c.length === summaryHead.length) {
      summary = c;
    }
  });

  const at = (label: string) => num(summary[summaryHead.indexOf(label)] ?? "");
  const counts: Record<string, number> = {};
  summaryHead.forEach((h, i) => {
    const g = h.match(/^([A-Z]) Grades$/)?.[1];
    if (g) counts[g] = num(summary[i] ?? "");
  });
  const total = curriculum.find((r) => /^total credits/i.test(r.type));

  return {
    cgpa: at("CGPA"),
    creditsRegistered: at("Credits Registered"),
    creditsEarned: at("Credits Earned"),
    creditsRequired: total?.required ?? 0,
    counts,
    history,
    curriculum: curriculum.filter((r) => r !== total),
  };
}
