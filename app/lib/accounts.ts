/* VTOP accounts the student chose to save on this device. Passwords are
   encrypted with a key that never leaves the browser: it is created as
   non-extractable and kept in IndexedDB, so the stored ciphertext is useless
   anywhere else. Nothing here is ever sent to our server. */

const ACCOUNTS_KEY = "vtopAccounts";
const AUTO_KEY = "autoAccount";
const PAUSED_KEY = "autoLoginPaused";
const DB = "vit-attendance";
const STORE = "keys";

export interface SavedAccount {
  username: string;
  regNo?: string;
  iv: string;
  cipher: string;
  savedAt: string;
  /** VTOP refused the saved password last time. */
  rejected?: boolean;
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: saving accounts just does not stick.
  }
};

const toBase64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deviceKey(): Promise<CryptoKey> {
  const db = await openDb();
  const get = <T>(key: string) =>
    new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  const existing = await get<CryptoKey>("accounts");
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await new Promise<void>((resolve, reject) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(key, "accounts");
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  return key;
}

export const canSaveAccounts = () =>
  typeof window !== "undefined" && "indexedDB" in window && Boolean(crypto?.subtle);

export const listAccounts = () => read<SavedAccount[]>(ACCOUNTS_KEY, []);

export async function saveAccount(username: string, password: string, regNo?: string) {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(password),
  );
  const name = username.trim();
  const others = listAccounts().filter((a) => a.username.toLowerCase() !== name.toLowerCase());
  write(ACCOUNTS_KEY, [
    { username: name, regNo, iv: toBase64(iv), cipher: toBase64(cipher), savedAt: new Date().toISOString() },
    ...others,
  ]);
}

export async function passwordOf(username: string): Promise<string | null> {
  const account = listAccounts().find((a) => a.username === username);
  if (!account) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(account.iv) },
      await deviceKey(),
      fromBase64(account.cipher),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function forgetAccount(username: string) {
  write(
    ACCOUNTS_KEY,
    listAccounts().filter((a) => a.username !== username),
  );
  if (autoAccount() === username) setAutoAccount(null);
}

export function markRejected(username: string, rejected: boolean) {
  write(
    ACCOUNTS_KEY,
    listAccounts().map((a) => (a.username === username ? { ...a, rejected } : a)),
  );
}

export const autoAccount = () => read<string | null>(AUTO_KEY, null);
export const setAutoAccount = (username: string | null) => write(AUTO_KEY, username);

/** Set when the student signs out, so the app does not sign straight back in. */
export const autoLoginPaused = () => read<boolean>(PAUSED_KEY, false);
export const setAutoLoginPaused = (paused: boolean) => write(PAUSED_KEY, paused || null);
