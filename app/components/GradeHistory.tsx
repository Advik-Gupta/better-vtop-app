"use client";

import { useState } from "react";
import { useApp } from "@/app/lib/appContext";
import { GRADE_LETTERS, countsForGpa, gpaOf } from "@/app/lib/marks";

/** Bars run from 5 to 10 so that differences between semesters show. */
const barHeight = (gpa: number | null) =>
  Math.max(4, Math.min(100, (((gpa ?? 5) - 5) / 5) * 100));

export default function GradeHistory() {
  const { data } = useApp();
  const grades = data.grades!;
  const [selected, setSelected] = useState(grades.semesters[0]?.semester.id ?? "");
  const current = grades.semesters.find((s) => s.semester.id === selected);

  const graded = gpaOf(grades.history);
  const totalGrades = GRADE_LETTERS.reduce((n, g) => n + (grades.counts[g] ?? 0), 0);
  // Oldest first reads naturally as a trend.
  const timeline = [...grades.semesters].reverse();

  return (
    <div className="stack">
      <section className="summary summary-4">
        <div className="tile">
          <span className="tile-num">{grades.cgpa.toFixed(2)}</span>
          <span className="tile-label">CGPA</span>
        </div>
        <div className="tile">
          <span className="tile-num">
            {grades.creditsEarned}
            <span className="tile-of">/{grades.creditsRequired}</span>
          </span>
          <span className="tile-label">Credits earned</span>
        </div>
        <div className="tile">
          <span className="tile-num">{graded.credits}</span>
          <span className="tile-label">Credits in the CGPA</span>
        </div>
        <div className="tile">
          <span className="tile-num">{grades.history.length}</span>
          <span className="tile-label">Courses completed</span>
        </div>
      </section>

      <section className="card pad">
        <div className="card-head">
          <h2>Grades so far</h2>
        </div>
        <div className="grade-dist">
          {GRADE_LETTERS.filter((g) => grades.counts[g]).map((g) => (
            <span
              key={g}
              className={`gd gd-${g}`}
              style={{ flexGrow: grades.counts[g] }}
              title={`${grades.counts[g]} ${g} grade${grades.counts[g] === 1 ? "" : "s"}`}
            >
              <strong>{g}</strong> {grades.counts[g]}
            </span>
          ))}
        </div>
        <p className="muted small">
          {totalGrades} graded courses. Pass/fail and non-graded courses are not
          part of the CGPA.
        </p>
      </section>

      <section className="card pad">
        <div className="card-head">
          <h2>GPA by semester</h2>
        </div>
        <div className="gpa-trend">
          {timeline.map((s) => (
            <button
              key={s.semester.id}
              className={`gpa-col ${s.semester.id === selected ? "active" : ""}`}
              onClick={() => setSelected(s.semester.id)}
              aria-pressed={s.semester.id === selected}
            >
              <span className="gpa-val">{s.gpa?.toFixed(2) ?? "-"}</span>
              <span className="gpa-bar">
                <span style={{ height: `${barHeight(s.gpa)}%` }} />
              </span>
              <span className="gpa-name">
                {s.semester.name.replace(" Semester", "").replace(/20(\d\d)-/, "$1-")}
              </span>
            </button>
          ))}
        </div>
      </section>

      {current && (
        <section className="card pad">
          <div className="card-head">
            <h2>{current.semester.name}</h2>
            <span className="num">GPA {current.gpa?.toFixed(2) ?? "-"}</span>
          </div>
          <div className="table-scroll">
            <table className="exam-table grade-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Type</th>
                  <th className="num">Credits</th>
                  <th className="num">Total</th>
                  <th className="num">Grade</th>
                </tr>
              </thead>
              <tbody>
                {current.courses.map((c) => (
                  <tr key={c.code}>
                    <td>
                      <span className="course-name">{c.name}</span>
                      <span className="muted small block">
                        {c.code}
                        {c.gradingType === "RG"
                          ? " · relative grading"
                          : c.gradingType === "AG"
                            ? " · absolute grading"
                            : ""}
                      </span>
                    </td>
                    <td className="muted">{c.type}</td>
                    <td className="num">{c.credits}</td>
                    <td className="num">{c.total ?? "-"}</td>
                    <td className="num">
                      <span className={`grade-pill gd-${c.grade}`}>{c.grade}</span>
                      {!countsForGpa(c.grade) && (
                        <span className="muted small block">not in GPA</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card pad">
        <div className="card-head">
          <h2>Credits by curriculum area</h2>
        </div>
        <ul className="credit-rows">
          {grades.curriculum
            .filter((r) => r.required > 0 || r.earned > 0)
            .map((r) => (
              <li key={r.type}>
                <div className="credit-top">
                  <span>{r.type.replace(/\s*\(.*\)$/, "")}</span>
                  <span className="num">
                    {r.earned}
                    <span className="tile-of">/{r.required}</span>
                  </span>
                </div>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${r.required ? Math.min(100, (r.earned / r.required) * 100) : 100}%`,
                    }}
                  />
                </div>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
