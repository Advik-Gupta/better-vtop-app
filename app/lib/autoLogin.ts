/* Signs in to VTOP without the student touching anything: fetch a captcha,
   read it, submit. A misread captcha is simply retried with a fresh one. Any
   other refusal stops at once - retrying a wrong password could lock the
   account. */

import { learnCaptcha, readCaptcha } from "./captcha";
import { fetchCaptcha, login } from "./sync";

const ATTEMPTS = 6;

export class CredentialsRejected extends Error {}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const captchaProblem = (message: string) => /captcha/i.test(message);
const ambiguous = (message: string) => /check your username, password and captcha/i.test(message);

export async function autoLogin(
  username: string,
  password: string,
  onStatus: (text: string) => void = () => {},
  signal?: { cancelled: boolean },
): Promise<{ regNo: string }> {
  let unclear = 0;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (signal?.cancelled) throw new Error("Cancelled.");
    onStatus(attempt === 1 ? "Getting a captcha from VTOP…" : `Trying again (${attempt} of ${ATTEMPTS})…`);
    const reply = await fetchCaptcha();
    if (!reply.captcha) {
      onStatus("VTOP is showing a reCAPTCHA. Waiting a moment…");
      await wait(1500);
      continue;
    }
    const reading = await readCaptcha(reply.captcha);
    if (!reading || reading.text.length !== 6) continue;
    if (signal?.cancelled) throw new Error("Cancelled.");
    onStatus("Signing in…");
    try {
      const result = await login(username, password, reading.text);
      learnCaptcha(reading, reading.text);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      if (captchaProblem(message)) continue;
      // VTOP's generic refusal may hide a misread captcha; allow it once.
      if (ambiguous(message) && unclear++ === 0) continue;
      throw new CredentialsRejected(message);
    }
  }
  throw new Error("Could not get past VTOP's captcha after several tries. Sign in by hand this time.");
}
