export type AttendanceStatus = "present" | "absent" | "od" | "cancelled";

export interface Subject {
  id: string;
  name: string;
  type: "theory" | "lab";
}

export interface DailyCalendarEntry {
  date: string;
  dayName: string;
  type: DayType;
  title: string;
  /** Weekday (1=Mon..5=Fri) whose timetable runs this day. Set for
   *  instructional days and day-order overrides (e.g. a working Saturday). */
  dayOrder?: Weekday;
}

export interface AttendanceRecord {
  [date: string]: {
    [subjectId: string]: AttendanceStatus;
  };
}

export type Weekday = 1 | 2 | 3 | 4 | 5;

export type Timetable = Record<Weekday, string[]>;

export type DayType =
  | "instructional"
  | "holiday"
  | "exam"
  | "vacation"
  | "festival"
  | "no_instruction"
  | "academic_process";
