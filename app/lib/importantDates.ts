/* Important dates: a map of ISO date -> note/description. Backward-compatible
   with the old format (a plain array of date strings). */

export type ImportantDates = Record<string, string>;

const KEY = "importantDates";

export function loadImportantDates(): ImportantDates {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // legacy: ["2026-08-09", ...] -> { "2026-08-09": "" }
      const map: ImportantDates = {};
      for (const d of parsed as string[]) map[d] = "";
      return map;
    }
    if (parsed && typeof parsed === "object") return parsed as ImportantDates;
    return {};
  } catch {
    return {};
  }
}

export function saveImportantDates(map: ImportantDates) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(map));
}
