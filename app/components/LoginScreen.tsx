"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  autoAccount,
  autoLoginPaused,
  canSaveAccounts,
  forgetAccount,
  listAccounts,
  markRejected,
  passwordOf,
  saveAccount,
  setAutoAccount,
  setAutoLoginPaused,
  type SavedAccount,
} from "@/app/lib/accounts";
import { CredentialsRejected, autoLogin } from "@/app/lib/autoLogin";
import { learnCaptcha, readCaptcha, type CaptchaReading } from "@/app/lib/captcha";
import { fetchCaptcha, login } from "@/app/lib/sync";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";
import { IconClose, IconEye, IconSync } from "./Icons";

interface LoginScreenProps {
  onSuccess: () => void;
  /** Present when there is cached data to go back to. */
  onCancel?: () => void;
  notice?: string;
  /** Sign in with the chosen account straight away, if one is set. */
  autoStart?: boolean;
}

type Captcha =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; image: string }
  | { state: "recaptcha" }
  | { state: "error"; message: string };

export default function LoginScreen({ onSuccess, onCancel, notice, autoStart }: LoginScreenProps) {
  const [username, setUsername] = useState(() => loadFromStorage("vtopUser", ""));
  const [password, setPassword] = useState("");
  const [answer, setAnswer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha>({ state: "idle" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [always, setAlways] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [makeDefault, setMakeDefault] = useState(false);
  const [auto, setAuto] = useState<{ username: string; status: string } | null>(null);
  const cancel = useRef({ cancelled: false });
  const reading = useRef<CaptchaReading | null>(null);
  const saving = canSaveAccounts();

  const refreshAccounts = () => {
    setAccounts(listAccounts());
    setAlways(autoAccount());
  };

  const loadCaptcha = useCallback(async () => {
    setCaptcha({ state: "loading" });
    setAnswer("");
    reading.current = null;
    try {
      const reply = await fetchCaptcha();
      if (!reply.captcha) return setCaptcha({ state: "recaptcha" });
      setCaptcha({ state: "ready", image: reply.captcha });
      const read = await readCaptcha(reply.captcha);
      if (read) {
        reading.current = read;
        setAnswer((typed) => typed || read.text);
      }
    } catch (err) {
      setCaptcha({
        state: "error",
        message: err instanceof Error ? err.message : "Could not reach VTOP.",
      });
    }
  }, []);

  const runAuto = useCallback(
    async (name: string) => {
      setError("");
      const secret = await passwordOf(name);
      if (!secret) {
        setError(`The saved password for ${name} could not be read. Sign in once more to save it again.`);
        setUsername(name);
        loadCaptcha();
        return;
      }
      cancel.current = { cancelled: false };
      setAuto({ username: name, status: "Starting…" });
      try {
        await autoLogin(
          name,
          secret,
          (status) => setAuto({ username: name, status }),
          cancel.current,
        );
        markRejected(name, false);
        setAutoLoginPaused(false);
        saveToStorage("vtopUser", name);
        onSuccess();
      } catch (err) {
        setAuto(null);
        setUsername(name);
        if (cancel.current.cancelled) {
          loadCaptcha();
          return;
        }
        if (err instanceof CredentialsRejected) {
          markRejected(name, true);
          refreshAccounts();
          setError(
            `VTOP refused the saved password for ${name} (${err.message}). If you changed it, sign in with the new password to update it.`,
          );
        } else {
          setError(err instanceof Error ? err.message : "Automatic sign-in failed.");
        }
        loadCaptcha();
      }
    },
    [loadCaptcha, onSuccess],
  );

  useEffect(() => {
    refreshAccounts();
    const chosen = autoAccount();
    const account = listAccounts().find((a) => a.username === chosen);
    if (autoStart && account && !account.rejected && !autoLoginPaused()) runAuto(account.username);
    else loadCaptcha();
    // Runs once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || captcha.state !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const { regNo } = await login(username, password, answer);
      const name = username.trim();
      saveToStorage("vtopUser", name);
      if (reading.current) learnCaptcha(reading.current, answer);
      setAutoLoginPaused(false);
      if (saving && remember) {
        await saveAccount(name, password, regNo);
        markRejected(name, false);
        if (makeDefault) setAutoAccount(name);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      // VTOP invalidates the captcha after every attempt.
      loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  if (auto) {
    return (
      <main className="auth">
        <div className="auth-card">
          <div className="brand">
            <span className="brand-mark">V</span>
            <div>
              <h1>Signing you in</h1>
              <p className="muted">
                {accounts.find((a) => a.username === auto.username)?.regNo ?? auto.username}
              </p>
            </div>
          </div>
          <div className="auto-status" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>{auto.status}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              cancel.current.cancelled = true;
              setAuto(null);
              loadCaptcha();
            }}
          >
            Cancel and sign in by hand
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">V</span>
          <div>
            <h1>VIT Attendance</h1>
            <p className="muted">Sign in with your VTOP account</p>
          </div>
        </div>

        {notice && <div className="notice">{notice}</div>}
        {error && (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}

        <label className="field">
          <span>Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <div className="input-wrap">
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="input-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <IconEye />
            </button>
          </div>
        </label>

        <div className="field">
          <span>Captcha</span>
          <div className="captcha">
            <div className="captcha-box">
              {captcha.state === "ready" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={captcha.image} alt="Captcha from VTOP" />
              )}
              {(captcha.state === "loading" || captcha.state === "idle") && (
                <span className="muted small">Loading…</span>
              )}
              {captcha.state === "recaptcha" && (
                <span className="muted small">
                  VTOP is asking for a Google reCAPTCHA right now, which only works on VTOP
                  itself. Try again in a moment.
                </span>
              )}
              {captcha.state === "error" && <span className="muted small">{captcha.message}</span>}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={loadCaptcha}
              aria-label="Load a new captcha"
            >
              <IconSync />
            </button>
          </div>
          <input
            className="input mono"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.toUpperCase())}
            placeholder="Type the characters above"
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Captcha"
            required
          />
          {reading.current && answer === reading.current.text && (
            <span className="muted small">Filled in for you. Check it before signing in.</span>
          )}
        </div>

        {saving && (
          <div className="check-col">
            <label className="check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Save this account on this device
            </label>
            {remember && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={makeDefault}
                  onChange={(e) => setMakeDefault(e.target.checked)}
                />
                Always sign in with it automatically
              </label>
            )}
          </div>
        )}

        <button className="btn btn-primary" disabled={busy || captcha.state !== "ready"}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Not now
          </button>
        )}

        {accounts.length > 0 && (
          <section className="saved">
            <span className="group-title">Saved accounts</span>
            {accounts.map((a) => (
              <div key={a.username} className="saved-row">
                <button
                  type="button"
                  className="saved-main"
                  onClick={() => runAuto(a.username)}
                  disabled={busy}
                >
                  <strong>{a.regNo ?? a.username}</strong>
                  <span className={`small ${a.rejected ? "bad" : "muted"}`}>
                    {a.rejected
                      ? "Password refused, sign in again to update"
                      : `${a.username} · tap to sign in`}
                  </span>
                </button>
                <button
                  type="button"
                  className={`saved-auto ${always === a.username ? "active" : ""}`}
                  aria-pressed={always === a.username}
                  title="Sign in with this account whenever the app opens"
                  onClick={() => {
                    setAutoAccount(always === a.username ? null : a.username);
                    refreshAccounts();
                  }}
                >
                  {always === a.username ? "Auto ✓" : "Auto"}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Forget ${a.username}`}
                  onClick={() => {
                    if (window.confirm(`Forget the saved password for ${a.username}?`)) {
                      forgetAccount(a.username);
                      refreshAccounts();
                    }
                  }}
                >
                  <IconClose width={16} height={16} />
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="tools-links">
          <span className="group-title">No VTOP handy?</span>
          <div className="tools-row">
            <Link className="btn" href="/tools/cgpa">
              CGPA calculator
            </Link>
            <Link className="btn" href="/tools/degree">
              Degree planner
            </Link>
          </div>
        </section>

        <p className="muted small center">
          Your password goes straight to VTOP and is never stored on our server. If you save an
          account, its password is encrypted and kept only in this browser.
        </p>
      </form>
    </main>
  );
}
