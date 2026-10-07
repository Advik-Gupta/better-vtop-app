"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCaptcha, login } from "@/app/lib/sync";
import { loadFromStorage, saveToStorage } from "@/app/lib/storage";
import { IconEye, IconSync } from "./Icons";

interface LoginScreenProps {
  onSuccess: () => void;
  /** Present when there is cached data to go back to. */
  onCancel?: () => void;
  notice?: string;
}

type Captcha =
  | { state: "loading" }
  | { state: "ready"; image: string }
  | { state: "recaptcha" }
  | { state: "error"; message: string };

export default function LoginScreen({
  onSuccess,
  onCancel,
  notice,
}: LoginScreenProps) {
  const [username, setUsername] = useState(() =>
    loadFromStorage("vtopUser", ""),
  );
  const [password, setPassword] = useState("");
  const [answer, setAnswer] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha>({ state: "loading" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptcha({ state: "loading" });
    setAnswer("");
    try {
      const reply = await fetchCaptcha();
      setCaptcha(
        reply.captcha
          ? { state: "ready", image: reply.captcha }
          : { state: "recaptcha" },
      );
    } catch (err) {
      setCaptcha({
        state: "error",
        message: err instanceof Error ? err.message : "Could not reach VTOP.",
      });
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || captcha.state !== "ready") return;
    setBusy(true);
    setError("");
    try {
      await login(username, password, answer);
      saveToStorage("vtopUser", username.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      // VTOP invalidates the captcha after every attempt.
      loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

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
              {captcha.state === "loading" && (
                <span className="muted small">Loading…</span>
              )}
              {captcha.state === "recaptcha" && (
                <span className="muted small">
                  VTOP is asking for a Google reCAPTCHA right now, which only
                  works on VTOP itself. Try again in a moment.
                </span>
              )}
              {captcha.state === "error" && (
                <span className="muted small">{captcha.message}</span>
              )}
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
        </div>

        <button
          className="btn btn-primary"
          disabled={busy || captcha.state !== "ready"}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Not now
          </button>
        )}

        <p className="muted small center">
          Your password goes straight to VTOP to sign you in. It is never saved
          - not on this device and not on our server.
        </p>
      </form>
    </main>
  );
}
