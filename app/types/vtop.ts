/* Shapes of everything we pull from VTOP, plus the user's local marks. */

export type Status = "present" | "absent" | "od";

export type CourseKind = "theory" | "lab" | "other";

export interface Semester {
  id: string; // e.g. VL20262701
  name: string; // e.g. Fall Semester 2026-27
}

export interface Course {
  code: string; // BECE302L - unique per registered course, used as the key
  name: string;
  kind: CourseKind;
  typeLabel: string; // "Theory Only", "Lab Only", "Soft Skill"…
  classId: string;
  classGroup: string;
  slot: string; // G2+TG2
  venue: string;
  faculty: string;
  attended: number;
  total: number;
  percentage: number; // as shown by VTOP (rounded up)
  debar: string | null;
  /** Needed to request the day-wise detail. */
  courseId: string;
  courseType: string;
}

/** One class period as recorded by VTOP. */
export interface ClassRecord {
  date: string; // ISO
  slot: string;
  time: string; // 15:00-15:50
  status: Status;
}

export interface TimetableEntry {
  day: number; // 1 = Monday … 7 = Sunday
  slot: string;
  code: string;
  kind: "theory" | "lab";
  venue: string;
  start: string; // HH:MM
  end: string;
}

export type DayType =
  | "instructional"
  | "holiday"
  | "exam"
  | "no_instruction"
  | "other";

export interface CalendarDay {
  date: string; // ISO
  type: DayType;
  label: string; // "Instructional Day", "CAT - II", "Holiday"…
  detail: string; // "Gandhi Jayanthi", "Monday Day Order"…
  /** Weekday (1 = Mon) whose timetable runs, when VTOP overrides it. */
  dayOrder?: number;
}

export interface Assignment {
  classId: string;
  code: string;
  course: string;
  title: string;
  due: string | null; // ISO
  maxMark: string;
  weightage: string;
  submitted: boolean;
  submittedOn: string;
}

/** A course on this semester's registration, with its credits. */
export interface RegisteredCourse {
  code: string;
  name: string;
  typeLabel: string;
  credits: number;
  category: string; // "Discipline Core", "Non-graded Core Requirement"…
  classId: string;
}

/** One evaluated component of a course, as on VTOP's Marks View. */
export interface MarkItem {
  title: string;
  max: number;
  weight: number; // marks this component is worth out of 100
  status: string; // "Present", "Absent"…
  scored: number;
  weighted: number; // scored, scaled to the weight
  remark: string;
}

export interface CourseMarks {
  classId: string;
  code: string;
  name: string;
  typeLabel: string;
  items: MarkItem[];
}

export interface GradedCourse {
  code: string;
  name: string;
  type: string;
  credits: number;
  grade: string;
  /** Grand total out of 100, when VTOP shows it (semester view only). */
  total?: number;
  gradingType?: string; // RG relative, AG absolute
  examMonth?: string;
}

export interface SemesterGrades {
  semester: Semester;
  gpa: number | null;
  courses: GradedCourse[];
}

export interface Grades {
  cgpa: number;
  creditsRegistered: number;
  creditsEarned: number;
  creditsRequired: number;
  /** Count of each grade, keyed by letter. */
  counts: Record<string, number>;
  /** Every course that counts towards the degree so far. */
  history: GradedCourse[];
  curriculum: { type: string; required: number; earned: number }[];
  semesters: SemesterGrades[];
}

export interface VtopData {
  regNo: string;
  semester: Semester;
  semesters: Semester[];
  courses: Course[];
  records: Record<string, ClassRecord[]>; // by course code
  timetable: TimetableEntry[];
  calendar: CalendarDay[];
  assignments: Assignment[];
  /** Added later than the rest; absent in data cached by an older version. */
  registered?: RegisteredCourse[];
  marks?: CourseMarks[];
  grades?: Grades;
  syncedAt: string; // ISO timestamp
}

/** Marks the user makes ahead of VTOP: date -> course code -> status. */
export type LocalMarks = Record<string, Record<string, Status>>;
