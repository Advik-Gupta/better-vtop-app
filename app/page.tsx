"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppContext, type AppState } from "@/app/lib/appContext";
import { allStats, buildLookup, pruneMarks, todayISO } from "@/app/lib/engine";
import {
  loadImportantDates,
  saveImportantDates,
  type ImportantDates,
} from "@/app/lib/importantDates";
import { clearAll, loadFromStorage, saveToStorage } from "@/app/lib/storage";
import {
  SessionExpired,
  fetchPart,
  logout,
  partsToFetch,
  syncQuick,
  PART_LABELS,
  type Part,
  type SyncStep,
} from "@/app/lib/sync";
import { autoAccount, autoLoginPaused, listAccounts, setAutoLoginPaused } from "@/app/lib/accounts";
import { emptyPlan, type GradePicks, type MarkPlans } from "@/app/lib/marks";
import type { LocalMarks, VtopData } from "@/app/types/vtop";

import AccountSheet from "./components/AccountSheet";
import AssignmentsView from "./components/AssignmentsView";
import AttendanceView, { CourseSheet } from "./components/AttendanceView";
import DaySheet from "./components/DaySheet";
import DegreeView from "./components/DegreeView";
import HomeView from "./components/HomeView";
import LoginScreen from "./components/LoginScreen";
import MarksView from "./components/MarksView";
import SyncScreen from "./components/SyncScreen";
import TimetableView from "./components/TimetableView";
import ThemeToggle from "./components/ThemeToggle";
import Toast from "./components/Toast";
import {
  IconAward,
  IconCap,
  IconChart,
  IconGrid,
  IconSync,
  IconTasks,
  IconToday,
  IconUser,
} from "./components/Icons";

const TABS = [
  { key: "home", label: "Home", Icon: IconToday },
  { key: "attendance", label: "Attendance", Icon: IconChart },
  { key: "marks", label: "Marks", Icon: IconAward },
  { key: "degree", label: "Degree", Icon: IconCap },
  { key: "timetable", label: "Timetable", Icon: IconGrid },
  { key: "tasks", label: "Tasks", Icon: IconTasks },
] as const;

type Tab = (typeof TABS)[number]["key"];

/** Data older than this is refreshed automatically when the app is opened. */
const STALE_MS = 3 * 60 * 60 * 1000;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function Page() {
  // Nothing renders until localStorage has been read, so server and client
  // output match.
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<VtopData | null>(null);
  const [marks, setMarks] = useState<LocalMarks>({});
  const [important, setImportantState] = useState<ImportantDates>({});
  const [plans, setPlans] = useState<MarkPlans>({});
  const [picks, setPicks] = useState<GradePicks>({});

  const [tab, setTab] = useState<Tab>("home");
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [courseOpen, setCourseOpen] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  /** Asking for credentials: at first launch, or when the session ran out. */
  const [signingIn, setSigningIn] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [syncStep, setSyncStep] = useState<SyncStep | null>(null);
  const [syncError, setSyncError] = useState("");
  const [expiredPrompt, setExpiredPrompt] = useState(false);

  const [toast, setToast] = useState({ message: "", visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      2600,
    );
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setData(loadFromStorage<VtopData | null>("vtopData", null));
    // "Present" used to be markable; it is simply the default now.
    const stored = loadFromStorage<LocalMarks>("localMarks", {});
    for (const byCode of Object.values(stored)) {
      for (const code of Object.keys(byCode)) {
        if (byCode[code] === "present") delete byCode[code];
      }
    }
    setMarks(stored);
    setImportantState(loadImportantDates());
    setPlans(loadFromStorage<MarkPlans>("markPlans", {}));
    setPicks(loadFromStorage<GradePicks>("gradePicks", {}));
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const today = todayISO();
  const look = useMemo(() => (data ? buildLookup(data) : null), [data]);
  const stats = useMemo(
    () => (look ? allStats(look, marks, today) : []),
    [look, marks, today],
  );

  const [updating, setUpdating] = useState<Part | null>(null);
  /** Parts asked for by hand while signed out; fetched after the next sign-in. */
  const [wanted, setWanted] = useState<Part[]>([]);
  const [refreshing, setRefreshing] = useState<Part[] | null>(null);

  const canSignInAlone = () => {
    const name = autoAccount();
    const account = listAccounts().find((a) => a.username === name);
    return Boolean(account && !account.rejected && !autoLoginPaused());
  };

  /** Fetches parts one after another once the app is already usable. Each
   *  result is merged into whatever the data is by then. */
  const background = useCallback(
    async (parts: Part[], current: VtopData, userAsked = false) => {
      for (const part of parts) {
        setUpdating(part);
        try {
          const result = await fetchPart(part, current);
          setData((prev) => {
            if (!prev) return prev;
            const next: VtopData = {
              ...prev,
              ...result,
              updated: { ...prev.updated, [part]: new Date().toISOString() },
            };
            saveToStorage("vtopData", next);
            return next;
          });
          if (part === "curriculum" && result.curriculum && process.env.NODE_ENV === "development") {
            fetch("/api/curricula", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ regNo: current.regNo, curriculum: result.curriculum }),
            }).catch(() => undefined);
          }
        } catch (err) {
          setUpdating(null);
          if (err instanceof SessionExpired) {
            if (userAsked) {
              setWanted(parts);
              setLoginNotice(err.message);
              setSigningIn(true);
            }
            return;
          }
          if (userAsked) showToast(`Could not update the ${part}.`);
        }
      }
      setUpdating(null);
      if (userAsked) showToast("Updated from VTOP");
    },
    [showToast],
  );

  /** `auto` is a background refresh the user did not ask for: if it needs a
   *  fresh sign-in we offer one instead of dropping them on the login form. */
  const sync = useCallback(async (auto = false) => {
    setSyncError("");
    setSyncStep("semesters");
    try {
      const fresh = await syncQuick(setSyncStep, data);
      const kept = pruneMarks(
        buildLookup(fresh),
        loadFromStorage<LocalMarks>("localMarks", {}),
      );
      saveToStorage("vtopData", fresh);
      saveToStorage("localMarks", kept);
      setData(fresh);
      setMarks(kept);
      setSyncStep(null);
      showToast("Synced with VTOP");
      const parts = [...new Set([...partsToFetch(fresh), ...wanted])];
      setWanted([]);
      background(parts, fresh);
    } catch (err) {
      if (err instanceof SessionExpired) {
        setSyncStep(null);
        if (auto && data && !canSignInAlone()) {
          setExpiredPrompt(true);
        } else {
          setLoginNotice(data && !canSignInAlone() ? err.message : "");
          setSigningIn(true);
        }
      } else {
        const message = err instanceof Error ? err.message : "Sync failed.";
        if (data) {
          setSyncStep(null);
          showToast(message);
        } else {
          setSyncError(message);
        }
      }
    }
  }, [data, showToast, background, wanted]);

  // Refresh by ourselves when the app is opened, or brought back to the
  // front, with data more than a few hours old. Tried at most once per
  // stale period so that declining to sign in is respected.
  const lastAuto = useRef(0);
  useEffect(() => {
    if (!mounted || !data) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (syncStep !== null || signingIn || expiredPrompt) return;
      const now = Date.now();
      if (now - new Date(data.syncedAt).getTime() < STALE_MS) return;
      if (now - lastAuto.current < STALE_MS) return;
      lastAuto.current = now;
      sync(true);
    };
    const timer = setTimeout(check, 0);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [mounted, data, syncStep, signingIn, expiredPrompt, sync]);

  const signOut = useCallback(async () => {
    // Signing out means "not now": the app must not sign straight back in.
    // Only the VTOP session ends; everything saved on this device stays.
    setAutoLoginPaused(true);
    await logout();
    setAccountOpen(false);
    setLoginNotice("");
    setSigningIn(true);
  }, []);

  const removeData = useCallback(() => {
    clearAll();
    setData(null);
    setMarks({});
    setImportantState({});
    setPlans({});
    setPicks({});
    setAccountOpen(false);
    setTab("home");
  }, []);

  const app = useMemo<AppState | null>(() => {
    if (!data || !look) return null;
    return {
      data,
      look,
      marks,
      important,
      today,
      stats,
      statsByCode: new Map(stats.map((s) => [s.course.code, s])),
      mark: (date, code, status) =>
        setMarks((prev) => {
          const next = { ...prev, [date]: { ...prev[date] } };
          if (status) next[date][code] = status;
          else delete next[date][code];
          if (Object.keys(next[date]).length === 0) delete next[date];
          saveToStorage("localMarks", next);
          return next;
        }),
      setImportant: (date, note) =>
        setImportantState((prev) => {
          const next = { ...prev };
          if (note === null) delete next[date];
          else next[date] = note;
          saveImportantDates(next);
          return next;
        }),
      plans,
      updatePlan: (code, change) =>
        setPlans((prev) => {
          const next = { ...prev, [code]: change(prev[code] ?? emptyPlan()) };
          saveToStorage("markPlans", next);
          return next;
        }),
      picks,
      setPick: (code, grade) =>
        setPicks((prev) => {
          const next = { ...prev };
          if (grade) next[code] = grade;
          else delete next[code];
          saveToStorage("gradePicks", next);
          return next;
        }),
      openDay: setDayOpen,
      openCourse: setCourseOpen,
      updating,
      refresh: setRefreshing,
    };
  }, [data, look, marks, important, today, stats, plans, picks, updating]);

  // Pages ask for a refresh through state, which keeps the context free of
  // functions that touch timers.
  useEffect(() => {
    if (!refreshing || !data) return;
    const parts = refreshing;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefreshing(null);
    background(parts, data, true);
  }, [refreshing, data, background]);

  if (!mounted) return null;

  if (signingIn || (!data && !syncStep)) {
    return (
      <LoginScreen
        autoStart
        notice={loginNotice}
        onCancel={data ? () => setSigningIn(false) : undefined}
        onSuccess={() => {
          setSigningIn(false);
          setLoginNotice("");
          sync();
        }}
      />
    );
  }

  if (!app) {
    return (
      <SyncScreen
        step={syncStep ?? "semesters"}
        error={syncError}
        onRetry={() => sync()}
        onSignIn={() => {
          setSyncStep(null);
          setSyncError("");
        }}
      />
    );
  }

  const syncing = syncStep !== null;

  return (
    <AppContext.Provider value={app}>
      <div className="shell">
        <header className="topbar">
          <div className="topbar-id">
            <span className="brand-mark small">V</span>
            <div>
              <strong>{app.data.semester.name}</strong>
              <span className="muted small">
                {syncing
                  ? "Syncing with VTOP…"
                  : updating
                    ? `Updating ${PART_LABELS[updating]}…`
                    : `Synced ${ago(app.data.syncedAt)}`}
              </span>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`tab ${tab === key ? "active" : ""}`}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => setTab(key)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <ThemeToggle />
            <button
              className={`icon-btn ${syncing ? "spin" : ""}`}
              onClick={() => sync()}
              disabled={syncing}
              aria-label="Sync with VTOP"
            >
              <IconSync />
            </button>
            <button
              className="icon-btn"
              onClick={() => setAccountOpen(true)}
              aria-label="Account"
            >
              <IconUser />
            </button>
          </div>
        </header>

        <main className="content">
          {tab === "home" && <HomeView onSeeAll={setTab} />}
          {tab === "attendance" && <AttendanceView />}
          {tab === "marks" && <MarksView onSync={() => sync()} />}
          {tab === "degree" && <DegreeView onSync={() => sync()} />}
          {tab === "timetable" && <TimetableView />}
          {tab === "tasks" && <AssignmentsView />}
        </main>
      </div>

      {dayOpen && <DaySheet date={dayOpen} onClose={() => setDayOpen(null)} />}
      {courseOpen && (
        <CourseSheet code={courseOpen} onClose={() => setCourseOpen(null)} />
      )}
      {accountOpen && (
        <AccountSheet
          syncing={syncing}
          onSync={() => {
            setAccountOpen(false);
            sync();
          }}
          onSignOut={signOut}
          onRemoveData={removeData}
          onToast={showToast}
          onClose={() => setAccountOpen(false)}
        />
      )}

      {syncing && (
        <SyncScreen
          overlay
          step={syncStep}
          onRetry={() => sync()}
          onSignIn={() => setSyncStep(null)}
        />
      )}

      {expiredPrompt && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="auth-card">
            <div className="brand">
              <span className="brand-mark">V</span>
              <div>
                <h1>Time for a refresh</h1>
                <p className="muted">Last synced {ago(app.data.syncedAt)}.</p>
              </div>
            </div>
            <p>
              Your VTOP session has ended, so signing in again is needed to
              pull today&apos;s attendance. Your saved data and marks are untouched.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setExpiredPrompt(false);
                setLoginNotice("");
                setSigningIn(true);
              }}
            >
              Sign in and sync
            </button>
            <button className="btn btn-ghost" onClick={() => setExpiredPrompt(false)}>
              Later
            </button>
          </div>
        </div>
      )}

      <Toast message={toast.message} visible={toast.visible} />
    </AppContext.Provider>
  );
}
