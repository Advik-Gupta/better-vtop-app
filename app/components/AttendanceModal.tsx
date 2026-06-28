import {
  calculateSubjectStats,
  canMissUntil,
  getAttendanceHistory,
  getExamSequenceForSubject,
  displayPct,
  meetsThreshold,
} from "@/app/lib/attendanceLogic";
import type { ExamCutoff } from "@/app/lib/calendarConfig";
import {
  Subject,
  DailyCalendarEntry,
  AttendanceRecord,
  AttendanceStatus,
} from "../types/attendance";

import "./AttendanceModal.css";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short" }).toUpperCase();
  return `${day} ${month}`;
}

interface AttendanceModalProps {
  subject: Subject | null;
  calendar: DailyCalendarEntry[];
  attendance: AttendanceRecord;
  timetable: Record<number, string[]>;
  cutoffs: ExamCutoff[];
  onClose: () => void;
}

export default function AttendanceModal({
  subject,
  calendar,
  attendance,
  timetable,
  cutoffs,
  onClose,
}: AttendanceModalProps) {
  if (!subject) return null;

  const todayISO = new Date().toISOString().split("T")[0];
  const seq = getExamSequenceForSubject(subject, cutoffs);

  const overallStats = calculateSubjectStats(
    subject,
    calendar,
    attendance,
    timetable,
  );
  const presentStats = calculateSubjectStats(
    subject,
    calendar,
    attendance,
    timetable,
    todayISO,
  );

  // One stat block per exam in the subject's sequence (cumulative cutoff).
  const examBlocks = seq.map((exam, i) => {
    const stats = calculateSubjectStats(
      subject,
      calendar,
      attendance,
      timetable,
      exam.date,
    );
    const canMiss = canMissUntil(
      subject,
      calendar,
      attendance,
      timetable,
      exam.date,
    );
    const prev = i > 0 ? seq[i - 1].date : undefined;
    const history = getAttendanceHistory(
      subject,
      calendar,
      attendance,
      timetable,
      exam.date,
      prev,
    );
    return { exam, stats, canMiss, history };
  });

  const getPctColor = (p: number) =>
    p >= 85 ? "#2dd4bf" : meetsThreshold(p) ? "#fbbf24" : "#f87171";
  const getPctBg = (p: number) =>
    p >= 85 ? "#0d2926" : meetsThreshold(p) ? "#2d2208" : "#2d1515";
  const getPctBorder = (p: number) =>
    p >= 85 ? "#134e4a" : meetsThreshold(p) ? "#7c2d12" : "#7f1d1d";

  const statBlocks = [
    ...examBlocks.map((b) => ({
      label: `Before ${b.exam.label}`,
      stats: b.stats,
      extra: { label: "Safe absences left", value: b.canMiss },
    })),
    { label: "Till Today", stats: presentStats, extra: null },
    { label: "Overall Semester", stats: overallStats, extra: null },
  ];

  const nextExam = seq.find((e) => e.date >= todayISO) ?? seq[seq.length - 1];
  const safeTillNext = nextExam
    ? canMissUntil(subject, calendar, attendance, timetable, nextExam.date)
    : 0;

  const overallHistory = getAttendanceHistory(
    subject,
    calendar,
    attendance,
    timetable,
  );
  const presentHistory = getAttendanceHistory(
    subject,
    calendar,
    attendance,
    timetable,
    todayISO,
  );

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.2rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <span className="modal-subject-name">{subject.name}</span>
                <span
                  className={`modal-subject-badge ${subject.type === "lab" ? "badge-lab" : "badge-theory"}`}
                >
                  {subject.type}
                </span>
              </div>
              {nextExam && (
                <div className="modal-missable">
                  You can miss another{" "}
                  <span style={{ color: "#818cf8", fontWeight: 700 }}>
                    {safeTillNext}
                  </span>{" "}
                  classes until {nextExam.label} to maintain 75%
                </div>
              )}
            </div>
            <button className="modal-close-btn" onClick={onClose}>
              ✕ Close
            </button>
          </div>

          <div className="modal-saturday-note">
            ⚠ Add working Saturdays (with their day order) in the Academic
            Calendar until {nextExam ? nextExam.label : "your next exam"} for the
            most accurate numbers.
          </div>

          <div className="modal-body">
            <div className="modal-stats-col">
              <span className="modal-section-label">Attendance Breakdown</span>
              {statBlocks.map(({ label, stats, extra }) => {
                const color = getPctColor(stats.percentage);
                const bg = getPctBg(stats.percentage);
                const border = getPctBorder(stats.percentage);
                return (
                  <div
                    key={label}
                    className="stat-block"
                    style={{ borderColor: border + "40", background: bg + "20" }}
                  >
                    <span className="stat-block-title">{label}</span>
                    <div className="stat-pct-row">
                      <span className="stat-pct-pill" style={{ color }}>
                        {displayPct(stats.percentage)}%
                      </span>
                      <div className="stat-pct-bar-wrap">
                        <div
                          className="stat-pct-bar-fill"
                          style={{
                            width: `${Math.min(stats.percentage, 100)}%`,
                            background: color,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                    <div className="stat-pills-row">
                      <span className="stat-mini-pill pill-total">
                        {stats.total} total
                      </span>
                      <span className="stat-mini-pill pill-present">
                        {stats.present} present
                      </span>
                      <span className="stat-mini-pill pill-absent">
                        {stats.absent} absent
                      </span>
                      {stats.od > 0 && (
                        <span className="stat-mini-pill pill-od">
                          {stats.od} OD
                        </span>
                      )}
                      {extra && (
                        <span className="stat-mini-pill pill-safe">
                          {extra.value} safe left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-history-col">
              <span className="modal-section-label">Absence / OD Log</span>
              {[
                ...examBlocks.map((b) => ({
                  title: `Before ${b.exam.label}`,
                  history: b.history,
                })),
                { title: "Till Today", history: presentHistory },
                { title: "Overall Semester", history: overallHistory },
              ].map(({ title, history }) => (
                <HistoryBlock key={title} title={title} history={history} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface HistoryItem {
  date: string;
  status: AttendanceStatus;
}

interface HistoryBlockProps {
  title: string;
  history: HistoryItem[];
}

function HistoryBlock({ title, history }: HistoryBlockProps) {
  return (
    <div className="history-block">
      <span className="history-block-title">{title}</span>
      {history.length === 0 ? (
        <span className="history-empty">— no absences or OD</span>
      ) : (
        <div className="history-chips">
          {history.map((item) => (
            <span
              key={item.date}
              className={`history-chip ${item.status === "absent" ? "chip-absent" : "chip-od"}`}
              title={item.status}
            >
              {formatDate(item.date)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
