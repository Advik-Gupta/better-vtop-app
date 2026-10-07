import { NextResponse, type NextRequest } from "next/server";
import {
  SessionExpiredError,
  openMenu,
  pooled,
  readSession,
  vtopPost,
  writeSession,
  type VtopSession,
} from "@/app/lib/vtop/client";
import {
  parseAssignmentCourses,
  parseAssignments,
  parseAttendanceDetail,
  parseAttendanceSummary,
  parseCalendarMonth,
  parseCalendarMonths,
  parseClassGroups,
  parseGradeHistory,
  parseMarks,
  parseRegistered,
  parseSemesterGrades,
  parseSemesters,
  parseTimetable,
} from "@/app/lib/vtop/parsers";
import type { ClassRecord, SemesterGrades } from "@/app/types/vtop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* The sync is split into parts so the client can show real progress and no
   single request runs long. */

async function semesters(s: VtopSession) {
  const html = await openMenu(s, "academics/common/StudentAttendance");
  const list = parseSemesters(html).sort((a, b) => b.id.localeCompare(a.id));
  return { regNo: s.regNo, semesters: list };
}

async function attendance(s: VtopSession, semesterSubId: string) {
  await openMenu(s, "academics/common/StudentAttendance");
  const courses = parseAttendanceSummary(
    await vtopPost(s, "processViewStudentAttendance", { semesterSubId }),
  );
  const details = await pooled(courses, 3, async (c) =>
    c.courseId
      ? parseAttendanceDetail(
          await vtopPost(s, "processViewAttendanceDetail", {
            semesterSubId,
            registerNumber: s.regNo,
            courseId: c.courseId,
            courseType: c.courseType,
          }),
        )
      : [],
  );
  const records: Record<string, ClassRecord[]> = {};
  courses.forEach((c, i) => (records[c.code] = details[i]));
  return { courses, records };
}

async function timetable(s: VtopSession, semesterSubId: string) {
  await openMenu(s, "academics/common/StudentTimeTable");
  const html = await vtopPost(s, "processViewTimeTable", { semesterSubId });
  // The same page lists every registered course with its credits.
  return { timetable: parseTimetable(html), registered: parseRegistered(html) };
}

async function marks(s: VtopSession, semesterSubId: string) {
  await openMenu(s, "examinations/StudentMarkView");
  return {
    marks: parseMarks(
      await vtopPost(s, "examinations/doStudentMarkView", { semesterSubId }, true),
    ),
  };
}

/** `since` is the student's first semester: VTOP's grade page offers every
 *  semester the university has ever run. */
async function grades(s: VtopSession, since: string, current: string) {
  const menu = await openMenu(s, "examinations/examGradeView/StudentGradeView");
  const mine = parseSemesters(menu).filter(
    (sem) => /^[A-Z]{2}\d{8}$/.test(sem.id) && sem.id >= since && sem.id <= current,
  );
  const perSemester = await pooled(mine, 3, async (semester) => ({
    semester,
    ...parseSemesterGrades(
      await vtopPost(
        s,
        "examinations/examGradeView/doStudentGradeView",
        { semesterSubId: semester.id },
        true,
      ),
    ),
  }));
  const semesters: SemesterGrades[] = perSemester
    .filter((g) => g.courses.length > 0)
    .sort((a, b) => b.semester.id.localeCompare(a.semester.id));

  const history = parseGradeHistory(
    await openMenu(s, "examinations/examGradeView/StudentGradeHistory"),
  );
  return { grades: { ...history, semesters } };
}

async function calendar(s: VtopSession, semSubId: string, classGroup: string) {
  await openMenu(s, "academics/common/CalendarPreview");
  const groups = parseClassGroups(
    await vtopPost(s, "getDateForSemesterPreview", {
      paramReturnId: "getDateForSemesterPreview",
      semSubId,
    }),
  );
  // Calendars differ per class group; use the one the student's courses are in.
  const classGroupId =
    groups.find((g) => g.name.toLowerCase() === classGroup.toLowerCase())?.id ??
    "ALL";
  const months = parseCalendarMonths(
    await vtopPost(s, "getListForSemester", {
      paramReturnId: "getListForSemester",
      semSubId,
      classGroupId,
    }),
  );
  const days = await pooled(months, 3, async (calDate) =>
    parseCalendarMonth(
      await vtopPost(s, "processViewCalendar", { calDate, semSubId, classGroupId }),
      calDate,
    ),
  );
  return { calendar: days.flat() };
}

async function assignments(s: VtopSession, semesterSubId: string) {
  await openMenu(s, "examinations/StudentDA");
  const courses = parseAssignmentCourses(
    await vtopPost(s, "examinations/doDigitalAssignment", { semesterSubId }, true),
  );
  const lists = await pooled(courses, 3, async (c) =>
    parseAssignments(
      await vtopPost(s, "examinations/processDigitalAssignment", {
        classId: c.classId,
      }),
      c,
    ),
  );
  return { assignments: lists.flat() };
}

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session?.regNo) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const { part, semesterId = "", classGroup = "", since = "" } = await req
    .json()
    .catch(() => ({}));

  try {
    let result: object;
    if (part === "semesters") result = await semesters(session);
    else if (!semesterId) throw new Error("Missing semester");
    else if (part === "attendance") result = await attendance(session, semesterId);
    else if (part === "timetable") result = await timetable(session, semesterId);
    else if (part === "calendar")
      result = await calendar(session, semesterId, classGroup);
    else if (part === "assignments")
      result = await assignments(session, semesterId);
    else if (part === "marks") result = await marks(session, semesterId);
    else if (part === "grades")
      result = await grades(session, since || semesterId, semesterId);
    else throw new Error("Unknown part");

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      const res = NextResponse.json({ error: "session_expired" }, { status: 401 });
      writeSession(res, null);
      return res;
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "VTOP request failed" },
      { status: 502 },
    );
  }
}
