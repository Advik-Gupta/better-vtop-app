"use client";

import {
  calculateSubjectStats,
  canMissUntil,
  getExamSequenceForSubject,
  displayPct,
  meetsThreshold,
} from "@/app/lib/attendanceLogic";
import type { ExamCutoff } from "@/app/lib/calendarConfig";
import {
  Subject,
  DailyCalendarEntry,
  AttendanceRecord,
} from "@/app/types/attendance";

import "./AttendanceSummaryModal.css";

interface AttendanceSummaryModalProps {
  subjects: Subject[];
  calendar: DailyCalendarEntry[];
  attendance: AttendanceRecord;
  timetable: Record<number, string[]>;
  cutoffs: ExamCutoff[];
  onClose: () => void;
}

function getPctColor(p: number) {
  return p >= 85 ? "#2dd4bf" : meetsThreshold(p) ? "#fbbf24" : "#f87171";
}

function formatExamDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AttendanceSummaryModal({
  subjects,
  calendar,
  attendance,
  timetable,
  cutoffs,
  onClose,
}: AttendanceSummaryModalProps) {
  const today = new Date().toISOString().split("T")[0];

  const rows = subjects.map((sub) => {
    const current = calculateSubjectStats(
      sub,
      calendar,
      attendance,
      timetable,
      today,
    );

    const seq = getExamSequenceForSubject(sub, cutoffs);
    const nextExam = seq.find((e) => e.date >= today) ?? seq[seq.length - 1] ?? null;
    const canMiss = nextExam
      ? canMissUntil(sub, calendar, attendance, timetable, nextExam.date)
      : 0;

    return { sub, current, nextExam, canMiss };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.current.total,
      present: acc.present + r.current.present,
      absent: acc.absent + r.current.absent,
      canMiss: acc.canMiss + r.canMiss,
    }),
    { total: 0, present: 0, absent: 0, canMiss: 0 },
  );
  const overallRaw =
    totals.total === 0 ? 100 : (totals.present / totals.total) * 100;
  const overallPct = displayPct(overallRaw);

  return (
    <div className="asm-backdrop" onClick={onClose}>
      <div className="asm-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="asm-header">
          <div className="asm-header-left">
            <span className="asm-title">Attendance Summary</span>
            <div className="asm-exam-pill">
              <span className="asm-exam-label">Per-subject</span>
              <span className="asm-exam-name">next exam shown below</span>
            </div>
          </div>
          <button className="asm-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* ── Overall banner ── */}
        <div className="asm-banner">
          {[
            {
              val: `${overallPct}%`,
              label: "Overall",
              color: getPctColor(overallRaw),
            },
            { val: totals.total, label: "Total classes", color: "#e2e8f0" },
            { val: totals.present, label: "Present", color: "#2dd4bf" },
            { val: totals.absent, label: "Absent", color: "#f87171" },
            {
              val: totals.canMiss,
              label: "Can miss (next exam)",
              color: totals.canMiss === 0 ? "#f87171" : "#fbbf24",
            },
          ].map((item, i) => (
            <div key={i} className="asm-banner-stat">
              <span className="asm-banner-val" style={{ color: item.color }}>
                {item.val}
              </span>
              <span className="asm-banner-label">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="asm-warning">
          ⚠ Add any working Saturdays (with their day order) in the Academic
          Calendar until your next exam for the most accurate &ldquo;can
          miss&rdquo; counts.
        </div>

        {/* ── Body ── */}
        <div className="asm-body">
          {subjects.length === 0 ? (
            <div className="asm-empty">
              No subjects yet — add some in the timetable editor
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="asm-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Type</th>
                    <th className="num">Total</th>
                    <th className="num">Present</th>
                    <th className="num">Absent</th>
                    <th>Attendance</th>
                    <th>Next exam</th>
                    <th>Can miss</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ sub, current, nextExam, canMiss }) => {
                    const pct = displayPct(current.percentage);
                    const color = getPctColor(current.percentage);
                    return (
                      <tr key={sub.id}>
                        <td className="asm-td-name">{sub.name}</td>
                        <td>
                          <span
                            className={`asm-badge ${sub.type === "lab" ? "badge-lab" : "badge-theory"}`}
                          >
                            {sub.type}
                          </span>
                        </td>
                        <td className="num asm-muted">{current.total}</td>
                        <td className="num" style={{ color: "#2dd4bf" }}>
                          {current.present}
                        </td>
                        <td className="num" style={{ color: "#f87171" }}>
                          {current.absent}
                        </td>
                        <td>
                          <div className="asm-pct-cell">
                            <span className="asm-pct-val" style={{ color }}>
                              {pct}%
                            </span>
                            <div className="asm-bar-track">
                              <div
                                className="asm-bar-fill"
                                style={{
                                  width: `${Math.min(current.percentage, 100)}%`,
                                  background: color,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="asm-muted">
                          {nextExam ? (
                            <>
                              <strong style={{ color: "#c7d2fe" }}>
                                {nextExam.label}
                              </strong>
                              <br />
                              <span style={{ fontSize: "0.68rem" }}>
                                {formatExamDate(nextExam.date)}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <span
                            className="asm-miss-pill"
                            style={{
                              color: canMiss === 0 ? "#f87171" : "#2dd4bf",
                              background:
                                canMiss === 0
                                  ? "rgba(248,113,113,0.1)"
                                  : "rgba(45,212,191,0.1)",
                              borderColor:
                                canMiss === 0
                                  ? "rgba(248,113,113,0.25)"
                                  : "rgba(45,212,191,0.25)",
                            }}
                          >
                            {canMiss === 0
                              ? "⚠ 0 left"
                              : `${canMiss} class${canMiss !== 1 ? "es" : ""}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="asm-cards">
                {rows.map(({ sub, current, nextExam, canMiss }) => {
                  const pct = displayPct(current.percentage);
                  const color = getPctColor(current.percentage);
                  return (
                    <div key={sub.id} className="asm-card">
                      <div className="asm-card-top">
                        <div className="asm-card-name-row">
                          <span className="asm-card-name">{sub.name}</span>
                          <span
                            className={`asm-badge ${sub.type === "lab" ? "badge-lab" : "badge-theory"}`}
                          >
                            {sub.type}
                          </span>
                        </div>
                        <span className="asm-card-pct" style={{ color }}>
                          {pct}%
                        </span>
                      </div>

                      <div className="asm-bar-track asm-card-bar">
                        <div
                          className="asm-bar-fill"
                          style={{
                            width: `${Math.min(current.percentage, 100)}%`,
                            background: color,
                          }}
                        />
                      </div>

                      <div className="asm-card-stats">
                        {[
                          {
                            val: current.total,
                            label: "Total",
                            color: "#94a3b8",
                          },
                          {
                            val: current.present,
                            label: "Present",
                            color: "#2dd4bf",
                          },
                          {
                            val: current.absent,
                            label: "Absent",
                            color: "#f87171",
                          },
                          {
                            val: canMiss,
                            label: "Can miss",
                            color: canMiss === 0 ? "#f87171" : "#fbbf24",
                          },
                        ].map((s) => (
                          <div key={s.label} className="asm-card-stat">
                            <span
                              className="asm-card-stat-val"
                              style={{ color: s.color }}
                            >
                              {s.val}
                            </span>
                            <span className="asm-card-stat-label">
                              {s.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="asm-card-miss-row">
                        <span className="asm-card-miss-label">
                          Can miss till {nextExam ? nextExam.label : "exam"}:
                        </span>
                        <span
                          className="asm-miss-pill"
                          style={{
                            color: canMiss === 0 ? "#f87171" : "#2dd4bf",
                            background:
                              canMiss === 0
                                ? "rgba(248,113,113,0.1)"
                                : "rgba(45,212,191,0.1)",
                            borderColor:
                              canMiss === 0
                                ? "rgba(248,113,113,0.25)"
                                : "rgba(45,212,191,0.25)",
                          }}
                        >
                          {canMiss === 0
                            ? "⚠ 0 left"
                            : `${canMiss} class${canMiss !== 1 ? "es" : ""}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
