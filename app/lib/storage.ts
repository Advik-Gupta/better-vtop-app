/* ──────────────────────────────────────────────────────────────────────────
   LOCAL STORAGE
   The last VTOP sync is cached in localStorage so the app opens instantly and
   works offline. The user's own marks and important dates live only here - a
   JSON export/import backup guards them if browser storage is cleared.
   ────────────────────────────────────────────────────────────────────────── */

export const STORAGE_KEYS = [
  "vtopData",
  "localMarks",
  "importantDates",
  "markPlans",
  "gradePicks",
  "extraCredits",
  "cgpaPlan",
  "vtopUser",
] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

export const saveToLocal = (key: string, data: unknown) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, JSON.stringify(data));
  }
};

export const loadFromLocal = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
};

/* ── Public API (kept sync, no network) ── */

export const saveToStorage = (key: string, data: unknown) => {
  saveToLocal(key, data);
};

export const loadFromStorage = <T>(key: string, fallback: T): T => {
  return loadFromLocal(key, fallback);
};

/* ──────────────────────────────────────────────────────────────────────────
   BACKUP - export everything to a JSON file, and restore from one.
   ────────────────────────────────────────────────────────────────────────── */

interface BackupShape {
  __vitAttendanceBackup: true;
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export function buildBackup(): BackupShape {
  const data: Record<string, unknown> = {};
  for (const key of STORAGE_KEYS) {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (raw !== null) {
      try {
        data[key] = JSON.parse(raw);
      } catch {
        /* skip malformed */
      }
    }
  }
  return {
    __vitAttendanceBackup: true,
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function exportBackup() {
  if (typeof window === "undefined") return;
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `vit-attendance-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Restore from a backup file. Returns true on success. Caller should reload
 * state (or the page) afterwards.
 */
export async function importBackup(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<BackupShape>;
    if (!parsed || parsed.__vitAttendanceBackup !== true || !parsed.data) {
      return false;
    }
    for (const key of STORAGE_KEYS) {
      if (key in parsed.data) {
        saveToLocal(key, parsed.data[key]);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Forget everything about the signed-in student. */
export function clearAll() {
  if (typeof window === "undefined") return;
  for (const key of STORAGE_KEYS) {
    if (key !== "vtopUser") localStorage.removeItem(key);
  }
}
