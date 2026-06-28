"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { loadFromStorage } from "@/app/lib/storage";

import TimetableEditor from "@/app/components/TimetableEditor";
import CalendarView from "@/app/components/CalendarView";
import AttendanceModal from "@/app/components/AttendanceModal";
import AttendanceSummaryModal from "@/app/components/AttendanceSummaryModal";
import Footer from "./components/Footer";
import Toast from "./components/Toast";
import AlertsManager from "./components/AlertsManager";

import {
  FALL_2026_27_DEFAULT,
  generateCalendar,
  getExamCutoffs,
  type CalendarConfig,
} from "@/app/lib/calendarConfig";
import Link from "next/link";

import type {
  Timetable,
  Subject,
  AttendanceRecord,
} from "@/app/types/attendance";

const defaultTimetable: Timetable = { 1: [], 2: [], 3: [], 4: [], 5: [] };

export default function Page() {
  // Lazy initializers read localStorage on the client's first render (and the
  // SSR-safe fallback on the server). A `mounted` gate renders nothing until
  // after hydration so server/client output matches.
  const [subjects, setSubjects] = useState<Subject[]>(() =>
    loadFromStorage("subjects", []),
  );
  const [attendance, setAttendance] = useState<AttendanceRecord>(() =>
    loadFromStorage("attendance", {}),
  );
  const [timetable, setTimetable] = useState<Timetable>(() =>
    loadFromStorage("timetable", defaultTimetable),
  );
  const [calendarConfig] = useState<CalendarConfig>(() =>
    loadFromStorage("calendarConfig", FALL_2026_27_DEFAULT),
  );
  const [mounted, setMounted] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("Saved");

  const showToast = useCallback((msg = "Saved") => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const calendar = useMemo(
    () => generateCalendar(calendarConfig),
    [calendarConfig],
  );
  const cutoffs = useMemo(() => getExamCutoffs(calendarConfig), [calendarConfig]);

  const handleMark = () => showToast("We will remind you to not miss!");
  const handleMarkAbsent = () => showToast("Oops, missed that one");
  const handleMarkOD = () => showToast("Lucky you, ODing that one!");

  if (!mounted) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="page-topbar">
        <span className="page-sem-name">{calendarConfig.name}</span>
        <Link href="/calendar" className="page-cal-link">
          🗓️ Edit Academic Calendar
        </Link>
      </div>

      <TimetableEditor
        subjects={subjects}
        setSubjects={setSubjects}
        timetable={timetable}
        setTimetable={setTimetable}
        onOpenSummary={() => setShowSummary(true)}
        onToast={showToast}
      />

      <CalendarView
        calendar={calendar}
        subjects={subjects}
        timetable={timetable}
        attendance={attendance}
        setAttendance={setAttendance}
        openModal={setSelectedSubject}
        onMark={handleMark}
        onMarkAbsent={handleMarkAbsent}
        onMarkOD={handleMarkOD}
      />

      <AttendanceModal
        subject={selectedSubject}
        calendar={calendar}
        attendance={attendance}
        timetable={timetable}
        cutoffs={cutoffs}
        onClose={() => setSelectedSubject(null)}
      />

      {showSummary && (
        <AttendanceSummaryModal
          subjects={subjects}
          calendar={calendar}
          attendance={attendance}
          timetable={timetable as Record<number, string[]>}
          cutoffs={cutoffs}
          onClose={() => setShowSummary(false)}
        />
      )}

      <Footer onToast={showToast} />

      <AlertsManager
        subjects={subjects}
        calendar={calendar}
        attendance={attendance}
        timetable={timetable}
        cutoffs={cutoffs}
      />

      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}
