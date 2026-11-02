"use client";

import { useEffect, useMemo, useState } from "react";
import CgpaPlanner from "@/app/components/CgpaPlanner";
import CurriculumPicker from "@/app/components/CurriculumPicker";
import { IconClose, IconPlus } from "@/app/components/Icons";
import { searchCourses } from "@/app/lib/degree";
import { GRADE_LETTERS, GRADE_POINTS, fmt, gpaOf } from "@/app/lib/marks";
import { currentTerm, gradesFor, useCurricula, useCurriculum } from "@/app/lib/publicData";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";

interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  grade: string;
}

interface Setup {
  key: string | null;
  cgpa: string;
  credits: string;
  subjects: Subject[];
}

const KEY = "publicCgpa";

export default function PublicCgpa() {
  const list = useCurricula();
  const [setup, setSetup] = useState<Setup>({ key: null, cgpa: "", credits: "", subjects: [] });
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState({ name: "", credits: "" });

  useEffect(() => {
    // Read once after mounting, so the server render matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSetup((s) => loadFromStorage<Setup>(KEY, s));
  }, []);
  const update = (patch: Partial<Setup>) =>
    setSetup((s) => {
      const next = { ...s, ...patch };
      saveToStorage(KEY, next);
      return next;
    });

  const key = setup.key ?? list?.[0]?.key ?? null;
  const curriculum = useCurriculum(key);
  const catalogue = useMemo(
    () => curriculum?.categories.flatMap((c) => c.courses).filter((c) => c.credits > 0) ?? [],
    [curriculum],
  );
  const results = query.trim()
    ? searchCourses(catalogue, query)
        .filter((c) => !setup.subjects.some((s) => s.code === c.code))
        .slice(0, 8)
    : [];

  const cgpa = Number(setup.cgpa);
  const credits = Number(setup.credits);
  const ready = setup.cgpa !== "" && credits > 0 && cgpa >= 0 && cgpa <= 10;
  const grades = useMemo(() => gradesFor(cgpa, credits), [cgpa, credits]);
  const semesterCredits = setup.subjects.reduce((n, s) => n + s.credits, 0);
  const picked = setup.subjects.filter((s) => s.grade);
  const sem = gpaOf(picked);
  const after =
    ready && sem.credits ? (cgpa * credits + sem.points) / (credits + sem.credits) : null;

  const add = (s: Omit<Subject, "id" | "grade">) =>
    update({
      subjects: [...setup.subjects, { ...s, id: `${setup.subjects.length}-${s.code || s.name}`, grade: "" }],
    });
  const change = (id: string, patch: Partial<Subject>) =>
    update({ subjects: setup.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div className="stack">
      <section className="card pad">
        <div className="card-head">
          <h2>Where you stand</h2>
        </div>
        <div className="tools-grid">
          <label className="field">
            <span>Current CGPA</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              max="10"
              step="0.01"
              value={setup.cgpa}
              placeholder="8.35"
              onChange={(e) => update({ cgpa: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Credits counted in it</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={setup.credits}
              placeholder="86"
              onChange={(e) => update({ credits: e.target.value })}
            />
          </label>
        </div>
        <p className="muted small">
          Both are on VTOP&apos;s Grade History page. Credits in the CGPA leave out non-graded
          courses.
        </p>
      </section>

      <section className="summary summary-4">
        <div className="tile">
          <span className="tile-num">{ready ? cgpa.toFixed(2) : "-"}</span>
          <span className="tile-label">CGPA now</span>
        </div>
        <div className="tile">
          <span className="tile-num">{sem.gpa?.toFixed(2) ?? "-"}</span>
          <span className="tile-label">
            This semester · {picked.length}/{setup.subjects.length} graded
          </span>
        </div>
        <div className="tile">
          <span className="tile-num">{after?.toFixed(2) ?? "-"}</span>
          <span className="tile-label">CGPA after</span>
        </div>
        <div className="tile">
          <span
            className={`tile-num ${after === null ? "" : after >= cgpa ? "good" : "bad"}`}
          >
            {after === null ? "-" : `${after >= cgpa ? "+" : ""}${(after - cgpa).toFixed(2)}`}
          </span>
          <span className="tile-label">Change</span>
        </div>
      </section>

      <section className="card pad">
        <div className="card-head">
          <h2>This semester&apos;s subjects</h2>
          <span className="num">{fmt(semesterCredits)} credits</span>
        </div>
        {list && list.length > 0 && (
          <CurriculumPicker list={list} value={key} onChange={(k) => update({ key: k })} />
        )}
        {catalogue.length > 0 && (
          <div className="tools-search">
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your curriculum to add a subject"
              aria-label="Search subjects"
            />
            {results.length > 0 && (
              <ul className="dg-courses tools-results">
                {results.map((c) => (
                  <li key={c.code} className="dg-course">
                    <div className="dg-course-top">
                      <div className="dg-course-text">
                        <span className="course-name">{c.name}</span>
                        <span className="muted small">
                          {c.code} · {fmt(c.credits)} credits
                        </span>
                      </div>
                      <button
                        className="dg-add"
                        onClick={() => {
                          add({ code: c.code, name: c.name, credits: c.credits });
                          setQuery("");
                        }}
                      >
                        <IconPlus width={14} height={14} /> Add
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {setup.subjects.length > 0 && (
          <div className="cg-subjects">
            {setup.subjects.map((s) => (
              <div key={s.id} className="cg-subject">
                <div className="cg-row">
                  <div className="cg-course">
                    <span className="course-name">{s.name}</span>
                    <span className="muted small">
                      {s.code ? `${s.code} · ` : ""}
                      {fmt(s.credits)} credit{s.credits === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grade-picker" role="group" aria-label={`Grade for ${s.name}`}>
                    {GRADE_LETTERS.map((g) => (
                      <button
                        key={g}
                        className={`grade-btn gd-${g} ${s.grade === g ? "active" : ""}`}
                        aria-pressed={s.grade === g}
                        title={`${g} = ${GRADE_POINTS[g]} points`}
                        onClick={() => change(s.id, { grade: s.grade === g ? "" : g })}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <button
                    className="mk-remove"
                    aria-label={`Remove ${s.name}`}
                    onClick={() =>
                      update({ subjects: setup.subjects.filter((x) => x.id !== s.id) })
                    }
                  >
                    <IconClose width={14} height={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom.credits);
            if (!custom.name.trim() || !(n > 0)) return;
            add({ code: "", name: custom.name.trim(), credits: n });
            setCustom({ name: "", credits: "" });
          }}
        >
          <input
            className="input"
            value={custom.name}
            onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            placeholder="Or type a subject name"
            aria-label="Subject name"
          />
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            max="30"
            step="0.5"
            value={custom.credits}
            onChange={(e) => setCustom({ ...custom, credits: e.target.value })}
            placeholder="Credits"
            aria-label="Credits"
          />
          <div className="add-actions">
            <button className="btn">Add subject</button>
          </div>
        </form>
      </section>

      {ready ? (
        <CgpaPlanner
          grades={grades}
          semester={{ id: "public", name: currentTerm() }}
          credits={semesterCredits}
          extras={[]}
          pickedGpa={picked.length && picked.length === setup.subjects.length ? sem.gpa : null}
        />
      ) : (
        <p className="muted small center">
          Enter your current CGPA and credits to plan towards a target.
        </p>
      )}
    </div>
  );
}
