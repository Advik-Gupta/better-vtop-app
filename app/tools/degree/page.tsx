"use client";

import { useEffect, useMemo, useState } from "react";
import CurriculumPicker from "@/app/components/CurriculumPicker";
import { DegreeBoard } from "@/app/components/DegreeView";
import { fmt } from "@/app/lib/marks";
import { plannerData, useCurricula, useCurriculum } from "@/app/lib/publicData";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";

interface Setup {
  key: string | null;
  semester: number;
  done: Record<string, number>;
}

const KEY = "publicDegree";

export default function PublicDegree() {
  const list = useCurricula();
  const [setup, setSetup] = useState<Setup>({ key: null, semester: 1, done: {} });
  const [editing, setEditing] = useState(true);

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
  const data = useMemo(
    () => (curriculum ? plannerData(curriculum, setup.semester) : null),
    [curriculum, setup.semester],
  );
  const total = Object.values(setup.done).reduce((n, v) => n + (v || 0), 0);

  if (list === null) return <p className="empty">Loading…</p>;
  if (!list.length) {
    return (
      <section className="card">
        <p className="empty">
          No curriculum has been shared yet. Once a student of your branch and batch signs in and
          syncs, it appears here.
        </p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card pad">
        <div className="card-head">
          <h2>Your degree so far</h2>
          <button className="link" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        {editing ? (
          <div className="stack">
            <div className="tools-grid">
              <CurriculumPicker list={list} value={key} onChange={(k) => update({ key: k, done: {} })} />
              <label className="field">
                <span>Current semester</span>
                <select
                  className="input"
                  value={setup.semester}
                  onChange={(e) => update({ semester: Number(e.target.value) })}
                >
                  {Array.from({ length: 8 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Semester {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="muted small">
              Credits earned so far in each bucket, from VTOP&apos;s grade history or curriculum
              page. Leave this semester&apos;s courses out; add them in the plan below.
            </span>
            <div className="tools-credits">
              {curriculum?.categories
                .filter((c) => c.required > 0 || c.max > 0)
                .map((c) => (
                  <label key={c.id} className="field">
                    <span>
                      {c.id} <span className="muted">· {c.name}</span>
                    </span>
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={Math.max(c.required, c.max)}
                      step="0.5"
                      value={setup.done[c.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        update({ done: { ...setup.done, [c.id]: Number(e.target.value) || 0 } })
                      }
                    />
                  </label>
                ))}
            </div>
          </div>
        ) : (
          <p className="muted small">
            {list.find((c) => c.key === key)?.label} · Semester {setup.semester} · {fmt(total)}{" "}
            credits entered
          </p>
        )}
      </section>
      {data ? (
        <DegreeBoard data={data} storageKey={`publicDegreePlan:${key}`} manualDone={setup.done} />
      ) : (
        <p className="empty">Loading the curriculum…</p>
      )}
    </div>
  );
}
