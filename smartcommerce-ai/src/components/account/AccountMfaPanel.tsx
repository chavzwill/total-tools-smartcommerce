import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmSensitiveAction } from "../../lib/passkeys";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  getMfaStatus,
  stepUpWithRecoveryCode,
  stepUpWithTotp,
  type MfaStatus,
} from "../../lib/accountMfa";

export default function AccountMfaPanel() {
  const [status, setStatus] = useState<MfaStatus>({ totpEnabled: false, recoveryCodesRemaining: 0 });
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try { setStatus(await getMfaStatus()); } catch { setStatus({ totpEnabled: false, recoveryCodesRemaining: 0 }); }
  }
  useEffect(() => { void refresh(); }, []);

  async function beginSetup() {
    if (!password) return setError("Confirm your current password before enabling an authenticator app.");
    setBusy(true); setError(""); setNotice(""); setRecoveryCodes([]);
    try {
      await confirmSensitiveAction(password, "totp_enrollment");
      const setup = await beginTotpEnrollment();
      setSecret(setup.secret); setUri(setup.otpauthUri); setPassword("");
      setNotice("Add this account to your authenticator app, then enter the 6-digit code it generates.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Authenticator setup could not start."); }
    finally { setBusy(false); }
  }

  async function confirmSetup() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await confirmTotpEnrollment(code.trim());
      setRecoveryCodes(result.recoveryCodes); setCode(""); setSecret(""); setUri("");
      await refresh();
      setNotice("Authenticator app enabled. Save the recovery codes below now; SmartCommerce will not show them again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The authenticator code could not be verified."); }
    finally { setBusy(false); }
  }

  async function verifyCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await stepUpWithTotp(code.trim()); setCode("");
      const until = new Date(result.stepUpExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotice(`Authenticator confirmed. Sensitive actions are authorised until ${until}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The authenticator code could not be verified."); }
    finally { setBusy(false); }
  }

  async function useRecoveryCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await stepUpWithRecoveryCode(recoveryCode.trim()); setRecoveryCode(""); await refresh();
      const until = new Date(result.stepUpExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotice(`Recovery code accepted and permanently consumed. Sensitive actions are authorised until ${until}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That recovery code could not be used."); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true); setError(""); setNotice("");
    try { await disableTotp(); await refresh(); setNotice("Authenticator-app MFA and its recovery codes have been disabled."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "MFA could not be disabled. Confirm with a passkey or authenticator code first."); }
    finally { setBusy(false); }
  }

  return (
    <section className="sc-account-real__security" aria-labelledby="sc-mfa-title">
      <ShieldCheck size={22} />
      <div>
        <strong id="sc-mfa-title">Authenticator app & recovery</strong>
        <span>Add a time-based authenticator as another strong way to confirm high-risk account and commercial actions.</span>

        {!status.totpEnabled && !secret && (
          <>
            <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} disabled={busy} /></label>
            <button type="button" disabled={busy || !password} onClick={beginSetup}><KeyRound size={17} /> {busy ? "Preparing…" : "Set up authenticator app"}</button>
          </>
        )}

        {!status.totpEnabled && secret && (
          <div>
            <p><strong>Manual setup key:</strong> <code>{secret}</code></p>
            <p>Authenticator link: <code>{uri}</code></p>
            <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} /></label>
            <button type="button" disabled={busy || code.length !== 6} onClick={confirmSetup}>{busy ? "Verifying…" : "Verify and enable"}</button>
          </div>
        )}

        {status.totpEnabled && (
          <div>
            <p><ShieldCheck size={15} aria-hidden="true" /> Authenticator app enabled · {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"} remaining</p>
            <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} /></label>
            <button type="button" disabled={busy || code.length !== 6} onClick={verifyCode}>{busy ? "Checking…" : "Confirm with authenticator"}</button>
            <label>Recovery code<input autoComplete="off" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 32))} /></label>
            <button type="button" disabled={busy || !recoveryCode} onClick={useRecoveryCode}><ShieldAlert size={17} /> Use one-time recovery code</button>
            <button type="button" disabled={busy} onClick={turnOff}>Disable authenticator MFA</button>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div role="group" aria-label="One-time recovery codes">
            <strong>Save these recovery codes now</strong>
            <span>Each code works once. Store them somewhere separate from this device.</span>
            {recoveryCodes.map((item) => <code key={item}>{item}</code>)}
          </div>
        )}
        {notice && <p role="status" className="sc-account-real__notice">{notice}</p>}
        {error && <p role="alert" className="sc-account-real__error">{error}</p>}
      </div>
    </section>
  );
}
