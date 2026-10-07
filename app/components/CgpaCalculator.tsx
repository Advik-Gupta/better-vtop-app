"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/app/lib/appContext";
import {
  GRADE_LETTERS,
  GRADE_POINTS,
  analyseCourse,
  fmt,
  gpaNeeded,
  gradedThisSemester,
  projectCgpa,
  reachableGrades,
  subjectOf,
  type ExtraCredit,
} from "@/app/lib/marks";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";
import type { RegisteredCourse } from "@/app/types/vtop";
import { IconClose, IconPlus } from "./Icons";

function AddExtra({ onAdd }: { onAdd: (e: ExtraCredit) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [credits, setCredits] = useState("");
  const [grade, setGrade] = useState("S");
  const value = Number(credits);
  const valid = value > 0 && value <= 30;

  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)}>
        <IconPlus width={16} height={16} />
        Add extra credits
        <span className="muted">NPTEL, project, internship…</span>
      </button>
    );
  }

  return (
    <form
      className="add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({
          id: Date.now().toString(36),
          title: title.trim() || "Extra credits",
          credits: value,
          grade,
        });
        setTitle("");
        setCredits("");
        setOpen(false);
      }}
    >
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Name, e.g. NPTEL course"
        aria-label="Name"
      />
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min="0"
        max="30"
        step="0.5"
        value={credits}
        onChange={(e) => setCredits(e.target.value)}
        placeholder="Credits"
        aria-label="Credits"
      />
      <div className="grade-picker span-2" role="group" aria-label="Grade">
        {GRADE_LETTERS.map((g) => (
          <button
            type="button"
            key={g}
            className={`grade-btn gd-${g} ${grade === g ? "active" : ""}`}
            aria-pressed={grade === g}
            onClick={() => setGrade(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="add-actions">
        <button className="btn btn-primary" disabled={!valid}>
          Add
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function CgpaCalculator() {
  const { data, plans, picks, setPick } = useApp();
  const grades = data.grades!;
  const courses = useMemo(() => gradedThisSemester(data), [data]);
  const skipped = (data.registered ?? []).filter((c) => !courses.includes(c));
  const [target, setTarget] = useState("");
  const [extras, setExtras] = useState<ExtraCredit[]>(() =>
    loadFromStorage<ExtraCredit[]>("extraCredits", []),
  );
  const saveExtras = (next: ExtraCredit[]) => {
    setExtras(next);
    saveToStorage("extraCredits", next);
  };

  // Theory and lab of the same subject sit together.
  const subjects = useMemo(() => {
    const map = new Map<string, RegisteredCourse[]>();
    for (const c of courses) {
      const key = subjectOf(c.code);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.values()];
  }, [courses]);

  // For labs and skill courses the marks already decide which grades are
  // still possible; for theory (relative grading) nothing can be ruled out.
  const possible = useMemo(() => {
    const map = new Map<string, { grades: Set<string> | null; best: number }>();
    for (const c of courses) {
      const a = analyseCourse(data, plans, c);
      map.set(c.code, { grades: reachableGrades(a), best: a.best });
    }
    return map;
  }, [courses, data, plans]);

  const p = projectCgpa(grades, courses, picks, extras);
  const picked = courses.filter((c) => picks[c.code]).length;
  const any = picked > 0 || extras.length > 0;
  const totalCredits =
    courses.reduce((n, c) => n + c.credits, 0) +
    extras.reduce((n, e) => n + e.credits, 0);
  const delta =
    p.cgpaAfter !== null && p.cgpaNow !== null ? p.cgpaAfter - p.cgpaNow : null;

  const setAll = (grade: string | null) =>
    courses.forEach((c) => {
      const ok = possible.get(c.code)?.grades;
      if (grade === null || !ok || ok.has(grade)) setPick(c.code, grade);
    });

  const wanted = Number(target);
  const need = target && wanted > 0 ? gpaNeeded(grades, totalCredits, wanted) : null;

  if (courses.length === 0) {
    return (
      <p className="empty">VTOP lists no graded courses for this semester yet.</p>
    );
  }

  return (
    <div className="stack">
      <section className="summary summary-4">
        <div className="tile">
          <span className="tile-num">{p.cgpaNow?.toFixed(2) ?? "-"}</span>
          <span className="tile-label">CGPA now</span>
        </div>
        <div className="tile">
          <span className="tile-num">{p.semesterGpa?.toFixed(2) ?? "-"}</span>
          <span className="tile-label">
            This semester · {picked}/{courses.length} picked
          </span>
        </div>
        <div className="tile">
          <span className="tile-num">
            {any ? (p.cgpaAfter?.toFixed(2) ?? "-") : "-"}
          </span>
          <span className="tile-label">CGPA after</span>
        </div>
        <div className="tile">
          <span
            className={`tile-num ${!any || delta === null ? "" : delta >= 0 ? "good" : "bad"}`}
          >
            {!any || delta === null
              ? "-"
              : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}
          </span>
          <span className="tile-label">Change</span>
        </div>
      </section>

      <section className="card pad">
        <div className="card-head">
          <h2>Pick your grades</h2>
          <div className="quick">
            <span className="muted small">All</span>
            {["S", "A", "B", "C"].map((g) => (
              <button key={g} className="grade-btn small" onClick={() => setAll(g)}>
                {g}
              </button>
            ))}
            <button className="link" onClick={() => setAll(null)}>
              Clear
            </button>
          </div>
        </div>

        <div className="cg-subjects">
          {subjects.map((group) => (
            <div key={group[0].code} className="cg-subject">
              {group.map((c) => {
                const info = possible.get(c.code);
                const ruledOut =
                  info?.grades && info.grades.size < GRADE_LETTERS.length;
                return (
                  <div key={c.code} className="cg-row">
                    <div className="cg-course">
                      <span className="course-name">{c.name}</span>
                      <span className="muted small">
                        {c.code} · {c.credits} credit{c.credits === 1 ? "" : "s"}
                        {ruledOut && ` · best possible ${fmt(Math.floor(info!.best))}`}
                      </span>
                    </div>
                    <div
                      className="grade-picker"
                      role="group"
                      aria-label={`Grade for ${c.name}`}
                    >
                      {GRADE_LETTERS.map((g) => {
                        const off = info?.grades ? !info.grades.has(g) : false;
                        return (
                          <button
                            key={g}
                            className={`grade-btn gd-${g} ${picks[c.code] === g ? "active" : ""}`}
                            aria-pressed={picks[c.code] === g}
                            disabled={off}
                            title={
                              off
                                ? `${g} is no longer possible with your marks`
                                : `${g} = ${GRADE_POINTS[g]} points`
                            }
                            onClick={() =>
                              setPick(c.code, picks[c.code] === g ? null : g)
                            }
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <p className="muted small">
          Greyed-out grades are ruled out by the marks you already have (labs
          and skill courses only - theory is graded relative to the class).
          {skipped.length > 0 &&
            ` Not counted: ${skipped.map((c) => c.name).join(", ")} (non-graded).`}
        </p>
        {picked > 0 && picked < courses.length && (
          <p className="warn small">
            Only the {picked} course{picked === 1 ? "" : "s"} you picked are in the
            numbers above.
          </p>
        )}
      </section>

      <section className="card pad">
        <div className="card-head">
          <h2>Extra credits</h2>
        </div>
        {extras.length > 0 && (
          <ul className="cg-extras">
            {extras.map((e) => (
              <li key={e.id}>
                <div className="cg-course">
                  <span className="course-name">{e.title}</span>
                  <span className="muted small">
                    {e.credits} credit{e.credits === 1 ? "" : "s"}
                  </span>
                </div>
                <span className={`grade-pill gd-${e.grade}`}>{e.grade}</span>
                <button
                  className="mk-remove"
                  onClick={() => saveExtras(extras.filter((x) => x.id !== e.id))}
                  aria-label={`Remove ${e.title}`}
                >
                  <IconClose width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddExtra onAdd={(e) => saveExtras([...extras, e])} />
        <p className="muted small">
          For graded credits that are not on your timetable. They are added to
          this semester&apos;s GPA and to the CGPA after.
        </p>
      </section>

      <section className="card pad">
        <div className="card-head">
          <h2>Aiming for a CGPA?</h2>
        </div>
        <div className="cg-target">
          <label className="field">
            <span>Target CGPA after this semester</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              max="10"
              step="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={grades.cgpa.toFixed(2)}
            />
          </label>
          <p className="cg-answer">
            {need === null ? (
              <span className="muted">
                Enter a target to see the GPA you would need over this
                semester&apos;s {totalCredits} credits.
              </span>
            ) : need > 10 ? (
              <>
                Not reachable this semester - it would take a GPA of{" "}
                <strong className="bad">{need.toFixed(2)}</strong>. The most you
                can reach is{" "}
                <strong>
                  {(
                    (p.creditsNow * (p.cgpaNow ?? 0) + totalCredits * 10) /
                    (p.creditsNow + totalCredits)
                  ).toFixed(2)}
                </strong>
                .
              </>
            ) : need <= 0 ? (
              <>You are already above that whatever happens this semester.</>
            ) : (
              <>
                You need a GPA of{" "}
                <strong className="good">{need.toFixed(2)}</strong> this semester.
              </>
            )}
          </p>
        </div>
      </section>

      <p className="muted small center">
        S 10 · A 9 · B 8 · C 7 · D 6 · E 5 · F 0. The CGPA is worked out from
        every graded course in your history, the same way VTOP does.
      </p>
    </div>
  );
}
