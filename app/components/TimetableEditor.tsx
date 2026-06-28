"use client";

import { useState, useRef, useEffect } from "react";
import { Subject } from "@/app/types/attendance";
import { saveToStorage } from "@/app/lib/storage";
import { v4 as uuid } from "uuid";
import type { Timetable, Weekday } from "@/app/types/attendance";
import "./TimetableEditor.css";

const weekdays: { label: string; value: Weekday }[] = [
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
];

interface TimetableEditorProps {
  subjects: Subject[];
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  timetable: Timetable;
  setTimetable: React.Dispatch<React.SetStateAction<Timetable>>;
  onOpenSummary: () => void;
  onToast?: (msg?: string) => void;
}

interface DragState {
  type: "pool" | "pill";
  subjectId: string;
  fromDay?: Weekday;
  fromIndex?: number;
}

export default function TimetableEditor({
  subjects,
  setSubjects,
  timetable,
  setTimetable,
  onOpenSummary,
  onToast,
}: TimetableEditorProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"theory" | "lab">("theory");
  const [collapsedDays, setCollapsedDays] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const touchDragRef = useRef<DragState | null>(null);
  const touchGhostRef = useRef<HTMLDivElement | null>(null);
  const touchLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingTouch = useRef(false);

  const removeGhost = () => {
    if (touchGhostRef.current) {
      touchGhostRef.current.remove();
      touchGhostRef.current = null;
    }
  };

  const createGhost = (text: string, x: number, y: number) => {
    removeGhost();
    const ghost = document.createElement("div");
    ghost.className = "tt-touch-ghost";
    ghost.textContent = text;
    ghost.style.left = `${x - 60}px`;
    ghost.style.top = `${y - 20}px`;
    document.body.appendChild(ghost);
    touchGhostRef.current = ghost;
  };

  const updateGhost = (x: number, y: number) => {
    if (touchGhostRef.current) {
      touchGhostRef.current.style.left = `${x - 60}px`;
      touchGhostRef.current.style.top = `${y - 20}px`;
    }
  };

  const getDayAtPoint = (x: number, y: number): Weekday | null => {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const dayEl = (el as HTMLElement).closest("[data-day]");
      if (dayEl)
        return parseInt((dayEl as HTMLElement).dataset.day!, 10) as Weekday;
    }
    return null;
  };

  const getPillIndexAtPoint = (
    x: number,
    y: number,
    day: Weekday,
  ): number | null => {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const pillEl = (el as HTMLElement).closest("[data-pill-index]");
      if (pillEl) {
        const pillDay = parseInt((pillEl as HTMLElement).dataset.pillDay!, 10);
        if (pillDay === day) {
          return parseInt((pillEl as HTMLElement).dataset.pillIndex!, 10);
        }
      }
    }
    return null;
  };

  const addSubject = () => {
    if (!name.trim()) return;
    const newSub: Subject = { id: uuid(), name, type };
    const updated = [...subjects, newSub];
    setSubjects(updated);
    saveToStorage("subjects", updated);
    setName("");
    onToast?.(`Added "${newSub.name}"`);
  };

  const deleteSubject = (subjectId: string) => {
    const updated = subjects.filter((s) => s.id !== subjectId);
    setSubjects(updated);
    saveToStorage("subjects", updated);

    const updatedTimetable = { ...timetable };
    for (const day of Object.keys(updatedTimetable) as unknown as Weekday[]) {
      updatedTimetable[day] = (updatedTimetable[day] || []).filter(
        (id) => id !== subjectId,
      );
    }
    setTimetable(updatedTimetable);
    saveToStorage("timetable", updatedTimetable);
  };

  const startEditing = (sub: Subject) => {
    setEditingSubjectId(sub.id);
    setEditingName(sub.name);
  };

  const commitEdit = () => {
    if (!editingSubjectId || !editingName.trim()) {
      setEditingSubjectId(null);
      return;
    }
    const updated = subjects.map((s) =>
      s.id === editingSubjectId ? { ...s, name: editingName.trim() } : s,
    );
    setSubjects(updated);
    saveToStorage("subjects", updated);
    setEditingSubjectId(null);
  };

  const removeFromDay = (day: Weekday, index: number) => {
    const updated = {
      ...timetable,
      [day]: (timetable[day] || []).filter((_, i) => i !== index),
    };
    setTimetable(updated);
    saveToStorage("timetable", updated);
  };

  const moveWithinDay = (day: Weekday, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const arr = [...(timetable[day] || [])];
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    const updated = { ...timetable, [day]: arr };
    setTimetable(updated);
    saveToStorage("timetable", updated);
  };

  const onDropToDay = (day: Weekday, subjectId: string, atIndex?: number) => {
    const arr = [...(timetable[day] || [])];
    if (atIndex !== undefined) {
      arr.splice(atIndex, 0, subjectId);
    } else {
      arr.push(subjectId);
    }
    const updated = { ...timetable, [day]: arr };
    setTimetable(updated);
    saveToStorage("timetable", updated);
  };

  const commitDrop = (
    drag: DragState,
    targetDay: Weekday,
    targetIndex: number | null,
  ) => {
    if (drag.type === "pool") {
      onDropToDay(targetDay, drag.subjectId, targetIndex ?? undefined);
    } else if (
      drag.type === "pill" &&
      drag.fromDay !== undefined &&
      drag.fromIndex !== undefined
    ) {
      if (drag.fromDay === targetDay) {
        moveWithinDay(
          targetDay,
          drag.fromIndex,
          targetIndex ?? (timetable[targetDay] || []).length,
        );
      } else {
        const srcArr = (timetable[drag.fromDay] || []).filter(
          (_, i) => i !== drag.fromIndex,
        );
        const tgtArr = [...(timetable[targetDay] || [])];
        if (targetIndex !== null) tgtArr.splice(targetIndex, 0, drag.subjectId);
        else tgtArr.push(drag.subjectId);
        const updated = {
          ...timetable,
          [drag.fromDay]: srcArr,
          [targetDay]: tgtArr,
        };
        setTimetable(updated);
        saveToStorage("timetable", updated);
        return;
      }
    }
  };

  const toggleDay = (day: number) => {
    setCollapsedDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  const handleChipTouchStart = (
    e: React.TouchEvent,
    subjectId: string,
    subjectName: string,
  ) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDraggingTouch.current = false;

    touchLongPressTimer.current = setTimeout(() => {
      isDraggingTouch.current = true;
      touchDragRef.current = { type: "pool", subjectId };
      setActiveDrag({ type: "pool", subjectId });
      createGhost(subjectName, touch.clientX, touch.clientY);

      if (navigator.vibrate) navigator.vibrate(40);
    }, 300);
  };

  const handleChipTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    if (!isDraggingTouch.current && touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > 8 || dy > 8) {
        if (touchLongPressTimer.current) {
          clearTimeout(touchLongPressTimer.current);
          touchLongPressTimer.current = null;
        }
      }
    }

    if (!isDraggingTouch.current) return;
    e.preventDefault();
    updateGhost(touch.clientX, touch.clientY);
    const day = getDayAtPoint(touch.clientX, touch.clientY);
    setDragOverDay(day);
    if (day) {
      const idx = getPillIndexAtPoint(touch.clientX, touch.clientY, day);
      setDragOverIndex(idx);
    } else {
      setDragOverIndex(null);
    }
  };

  const handleChipTouchEnd = (e: React.TouchEvent) => {
    if (touchLongPressTimer.current) {
      clearTimeout(touchLongPressTimer.current);
      touchLongPressTimer.current = null;
    }

    if (!isDraggingTouch.current || !touchDragRef.current) {
      isDraggingTouch.current = false;
      return;
    }

    const touch = e.changedTouches[0];
    const day = getDayAtPoint(touch.clientX, touch.clientY);
    if (day && touchDragRef.current) {
      const idx = getPillIndexAtPoint(touch.clientX, touch.clientY, day);
      commitDrop(touchDragRef.current, day, idx);

      setCollapsedDays((prev) => ({ ...prev, [day]: false }));
    }

    removeGhost();
    touchDragRef.current = null;
    setActiveDrag(null);
    setDragOverDay(null);
    setDragOverIndex(null);
    isDraggingTouch.current = false;
  };

  const handlePillTouchStart = (
    e: React.TouchEvent,
    day: Weekday,
    index: number,
    subjectId: string,
    subjectName: string,
  ) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDraggingTouch.current = false;

    touchLongPressTimer.current = setTimeout(() => {
      isDraggingTouch.current = true;
      touchDragRef.current = {
        type: "pill",
        subjectId,
        fromDay: day,
        fromIndex: index,
      };
      setActiveDrag({
        type: "pill",
        subjectId,
        fromDay: day,
        fromIndex: index,
      });
      createGhost(subjectName, touch.clientX, touch.clientY);
      if (navigator.vibrate) navigator.vibrate(40);
    }, 300);
  };

  const handlePillTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    if (!isDraggingTouch.current && touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > 8 || dy > 8) {
        if (touchLongPressTimer.current) {
          clearTimeout(touchLongPressTimer.current);
          touchLongPressTimer.current = null;
        }
      }
    }

    if (!isDraggingTouch.current) return;
    e.preventDefault();
    updateGhost(touch.clientX, touch.clientY);
    const day = getDayAtPoint(touch.clientX, touch.clientY);
    setDragOverDay(day);
    if (day) {
      const idx = getPillIndexAtPoint(touch.clientX, touch.clientY, day);
      setDragOverIndex(idx);
    } else {
      setDragOverIndex(null);
    }
  };

  const handlePillTouchEnd = (e: React.TouchEvent) => {
    if (touchLongPressTimer.current) {
      clearTimeout(touchLongPressTimer.current);
      touchLongPressTimer.current = null;
    }

    if (!isDraggingTouch.current || !touchDragRef.current) {
      isDraggingTouch.current = false;
      return;
    }

    const touch = e.changedTouches[0];
    const day = getDayAtPoint(touch.clientX, touch.clientY);
    if (day && touchDragRef.current) {
      const idx = getPillIndexAtPoint(touch.clientX, touch.clientY, day);
      commitDrop(touchDragRef.current, day, idx);
      setCollapsedDays((prev) => ({ ...prev, [day]: false }));
    }

    removeGhost();
    touchDragRef.current = null;
    setActiveDrag(null);
    setDragOverDay(null);
    setDragOverIndex(null);
    isDraggingTouch.current = false;
  };

  useEffect(() => {
    return () => {
      removeGhost();
      if (touchLongPressTimer.current)
        clearTimeout(touchLongPressTimer.current);
    };
  }, []);

  return (
    <div className="tt-root">
      <div className="tt-creator">
        <span className="tt-section-label">Create Subject</span>
        <div className="tt-creator-row">
          <input
            className="tt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubject()}
            placeholder="Subject name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
          />
          <div className="tt-type-group">
            <button
              className={`tt-type-btn ${type === "theory" ? "active-theory" : ""}`}
              onClick={() => setType("theory")}
            >
              Theory
            </button>
            <button
              className={`tt-type-btn ${type === "lab" ? "active-lab" : ""}`}
              onClick={() => setType("lab")}
            >
              Lab
            </button>
          </div>
          <button onClick={addSubject} className="tt-add-btn">
            + Add Subject
          </button>
          <button onClick={() => onOpenSummary()} className="tt-add-btn">
            Attendance Summary
          </button>
        </div>
      </div>

      <div className="tt-pool">
        <span className="tt-section-label">Subject Pool</span>
        <p className="tt-pool-hint">Hold & drag to add to a day</p>
        <div className="tt-pool-chips">
          {subjects.length === 0 && (
            <span
              style={{
                color: "#374151",
                fontSize: "0.8rem",
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              No subjects yet — create one above
            </span>
          )}
          {subjects.map((sub: Subject) =>
            editingSubjectId === sub.id ? (
              <div
                key={sub.id}
                className={`tt-chip ${sub.type === "lab" ? "tt-chip-lab" : "tt-chip-theory"}`}
                style={{ gap: "0.4rem" }}
              >
                <input
                  className="tt-chip-edit-input"
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingSubjectId(null);
                  }}
                  onBlur={commitEdit}
                />
                <button
                  className="tt-chip-action tt-chip-save"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitEdit();
                  }}
                  title="Save"
                >
                  ✓
                </button>
              </div>
            ) : (
              <div
                key={sub.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("subjectId", sub.id);
                  e.dataTransfer.setData("fromPool", "true");
                  setActiveDrag({ type: "pool", subjectId: sub.id });
                }}
                onDragEnd={() => setActiveDrag(null)}
                onTouchStart={(e) => handleChipTouchStart(e, sub.id, sub.name)}
                onTouchMove={handleChipTouchMove}
                onTouchEnd={handleChipTouchEnd}
                className={`tt-chip ${sub.type === "lab" ? "tt-chip-lab" : "tt-chip-theory"}${activeDrag?.type === "pool" && activeDrag.subjectId === sub.id ? " tt-pill-dragging" : ""}`}
              >
                <span>{sub.name}</span>
                <span className="tt-chip-badge">{sub.type}</span>
                <button
                  className="tt-chip-action tt-chip-edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(sub);
                  }}
                  title="Edit name"
                >
                  ✎
                </button>
                <button
                  className="tt-chip-action tt-chip-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSubject(sub.id);
                  }}
                  title="Delete subject"
                >
                  ×
                </button>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="tt-grid">
        {weekdays.map((day) => {
          const daySubjects = (timetable[day.value] || []) as string[];
          const isCollapsed = collapsedDays[day.value];

          return (
            <div
              key={day.value}
              data-day={day.value}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDay(day.value);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverDay(null);
                  setDragOverIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromPool = e.dataTransfer.getData("fromPool");
                const subjectId = e.dataTransfer.getData("subjectId");
                const fromDay = e.dataTransfer.getData("fromDay");
                const fromIndex = parseInt(
                  e.dataTransfer.getData("fromIndex"),
                  10,
                );

                if (fromPool === "true" && subjectId) {
                  onDropToDay(day.value, subjectId, dragOverIndex ?? undefined);
                  setCollapsedDays((prev) => ({ ...prev, [day.value]: false }));
                } else if (fromDay && !isNaN(fromIndex)) {
                  const fromDayNum = parseInt(fromDay, 10) as Weekday;
                  if (fromDayNum === day.value) {
                    moveWithinDay(
                      day.value,
                      fromIndex,
                      dragOverIndex ?? daySubjects.length,
                    );
                  } else {
                    commitDrop(
                      {
                        type: "pill",
                        subjectId,
                        fromDay: fromDayNum,
                        fromIndex,
                      },
                      day.value,
                      dragOverIndex,
                    );
                    setCollapsedDays((prev) => ({
                      ...prev,
                      [day.value]: false,
                    }));
                  }
                }

                setDragOverDay(null);
                setDragOverIndex(null);
                setActiveDrag(null);
              }}
              className={`tt-day-col${dragOverDay === day.value ? " drag-over" : ""}`}
            >
              <div
                className="tt-day-header"
                onClick={() => toggleDay(day.value)}
                style={{ cursor: "pointer" }}
              >
                <span className="tt-day-name">{day.label}</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <span className="tt-day-count">{daySubjects.length}</span>
                  <span className="tt-collapse-icon">
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </div>
              </div>

              {!isCollapsed && (
                <div className="tt-day-subjects-scroll">
                  {daySubjects.map((id: string, index: number) => {
                    const sub = subjects.find((s: Subject) => s.id === id);
                    if (!sub) return null;
                    const isPillDragging =
                      activeDrag?.type === "pill" &&
                      activeDrag.fromDay === day.value &&
                      activeDrag.fromIndex === index;

                    return (
                      <div
                        key={`${id}-${index}`}
                        data-pill-index={index}
                        data-pill-day={day.value}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("subjectId", id);
                          e.dataTransfer.setData("fromDay", String(day.value));
                          e.dataTransfer.setData("fromIndex", String(index));
                          e.dataTransfer.setData("fromPool", "false");
                          setActiveDrag({
                            type: "pill",
                            subjectId: id,
                            fromDay: day.value,
                            fromIndex: index,
                          });
                        }}
                        onDragEnd={() => setActiveDrag(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverIndex(index);
                        }}
                        onTouchStart={(e) =>
                          handlePillTouchStart(
                            e,
                            day.value,
                            index,
                            id,
                            sub.name,
                          )
                        }
                        onTouchMove={handlePillTouchMove}
                        onTouchEnd={handlePillTouchEnd}
                        className={`tt-subject-pill ${sub.type === "lab" ? "tt-subject-pill-lab" : "tt-subject-pill-theory"} tt-subject-pill-draggable${isPillDragging ? " tt-pill-dragging" : ""}`}
                      >
                        <span className="tt-drag-handle">⠿</span>
                        <span className="tt-pill-name">{sub.name}</span>
                        <span className="tt-pill-badge">{sub.type}</span>
                        <button
                          className="tt-pill-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromDay(day.value, index);
                          }}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  {daySubjects.length === 0 && (
                    <span className="tt-drop-hint">drop here</span>
                  )}
                </div>
              )}

              {isCollapsed && daySubjects.length === 0 && (
                <span className="tt-drop-hint">drop here</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
