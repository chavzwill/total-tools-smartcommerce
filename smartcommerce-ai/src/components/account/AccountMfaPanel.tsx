import { Check, Copy, KeyRound, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
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
  const [copied, setCopied] = useState<"secret" | "recovery" | "">("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try { setStatus(await getMfaStatus()); } catch { setStatus({ totpEnabled: false, recoveryCodesRemaining: 0 }); }
  }

  useEffect(() => { void refresh(); }, []);

  async function copyText(value: string, type: "secret" | "recovery") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy failed. Press and hold the value to copy it manually.");
    }
  }

  async function beginSetup() {
    if (!password) return setError("Confirm your current password before enabling an authenticator app.");
    setBusy(true); setError(""); setNotice(""); setRecoveryCodes([]);
    try {
      await confirmSensitiveAction(password, "totp_enrollment");
      const setup = await beginTotpEnrollment();
      setSecret(setup.secret); setUri(setup.otpauthUri); setPassword("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Authenticator setup could not start."); }
    finally { setBusy(false); }
  }

  async function confirmSetup() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await confirmTotpEnrollment(code.trim());
      setRecoveryCodes(result.recoveryCodes); setCode(""); setSecret(""); setUri("");
      await refresh();
      setNotice("Authenticator app enabled. Save your recovery codes now; they will not be shown again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The authenticator code could not be verified."); }
    finally { setBusy(false); }
  }

  async function verifyCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await stepUpWithTotp(code.trim()); setCode("");
      const until = new Date(result.stepUpExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotice(`Identity confirmed. Sensitive actions are authorised until ${until}.`);
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
    <section className="sc-security-card sc-security-card--mfa" aria-labelledby="sc-mfa-title">
      <div className="sc-security-card__head">
        <div className="sc-security-card__icon"><ShieldCheck size={20} /></div>
        <div>
          <span className="sc-eyebrow">Two-step verification</span>
          <h3 id="sc-mfa-title">Authenticator app</h3>
          <p>Use a rotating 6-digit code for high-risk account and commercial actions.</p>
        </div>
        <span className={`sc-status-pill ${status.totpEnabled ? "is-on" : ""}`}>{status.totpEnabled ? "Enabled" : "Not set up"}</span>
      </div>

      {!status.totpEnabled && !secret && (
        <div className="sc-security-card__body sc-security-start">
          <div className="sc-security-callout">
            <Smartphone size={20} />
            <div><strong>Recommended</strong><span>Works with Apple Passwords, Google Authenticator, Microsoft Authenticator, 1Password and compatible apps.</span></div>
          </div>
          <label className="sc-field">Current password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} disabled={busy} placeholder="Confirm it’s you" /></label>
          <button className="sc-primary-action" type="button" disabled={busy || !password} onClick={beginSetup}><KeyRound size={17} /> {busy ? "Preparing…" : "Set up authenticator"}</button>
        </div>
      )}

      {!status.totpEnabled && secret && (
        <div className="sc-security-card__body sc-mfa-setup">
          <div className="sc-setup-progress" aria-label="Authenticator setup steps">
            <span className="is-active"><b>1</b> Add account</span><span><b>2</b> Verify code</span><span><b>3</b> Save recovery codes</span>
          </div>
          <div className="sc-setup-panel">
            <span className="sc-eyebrow">Step 1</span>
            <h4>Add SmartCommerce to your authenticator</h4>
            <p>On this phone, tap the button below. If your authenticator does not open, copy the setup key and add it manually.</p>
            {uri && <a className="sc-primary-action sc-primary-action--link" href={uri}><Smartphone size={17} /> Open authenticator app</a>}
            <div className="sc-secret-box">
              <div><span>Manual setup key</span><code>{secret}</code></div>
              <button type="button" className="sc-icon-action" onClick={() => void copyText(secret, "secret")} aria-label="Copy setup key">{copied === "secret" ? <Check size={18} /> : <Copy size={18} />}</button>
            </div>
          </div>
          <div className="sc-setup-panel">
            <span className="sc-eyebrow">Step 2</span>
            <h4>Enter the 6-digit code</h4>
            <p>Your authenticator app will now show a code that changes every 30 seconds.</p>
            <label className="sc-field sc-code-field">Verification code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} placeholder="000000" /></label>
            <button className="sc-primary-action" type="button" disabled={busy || code.length !== 6} onClick={confirmSetup}>{busy ? "Verifying…" : "Verify and enable"}</button>
          </div>
        </div>
      )}

      {status.totpEnabled && (
        <div className="sc-security-card__body">
          <div className="sc-security-callout sc-security-callout--success"><ShieldCheck size={20} /><div><strong>Authenticator protection is active</strong><span>{status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"} remaining.</span></div></div>
          <div className="sc-security-grid">
            <div className="sc-setup-panel">
              <h4>Confirm a sensitive action</h4>
              <label className="sc-field sc-code-field">Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} placeholder="000000" /></label>
              <button className="sc-secondary-action" type="button" disabled={busy || code.length !== 6} onClick={verifyCode}>{busy ? "Checking…" : "Confirm identity"}</button>
            </div>
            <div className="sc-setup-panel">
              <h4>Use a recovery code</h4>
              <label className="sc-field">One-time recovery code<input autoComplete="off" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 32))} placeholder="XXXXXX-XXXXXX" /></label>
              <button className="sc-secondary-action" type="button" disabled={busy || !recoveryCode} onClick={useRecoveryCode}><ShieldAlert size={17} /> Use recovery code</button>
            </div>
          </div>
          <button className="sc-danger-link" type="button" disabled={busy} onClick={turnOff}>Disable authenticator MFA</button>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="sc-recovery-panel" role="group" aria-label="One-time recovery codes">
          <div><span className="sc-eyebrow">Step 3 · Save now</span><h4>Recovery codes</h4><p>Each code works once. Keep them somewhere separate from this device.</p></div>
          <button className="sc-secondary-action" type="button" onClick={() => void copyText(recoveryCodes.join("\n"), "recovery")}>{copied === "recovery" ? <Check size={17} /> : <Copy size={17} />} {copied === "recovery" ? "Copied" : "Copy all"}</button>
          <div className="sc-recovery-grid">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div>
        </div>
      )}

      {notice && <p role="status" className="sc-account-real__notice">{notice}</p>}
      {error && <p role="alert" className="sc-account-real__error">{error}</p>}
    </section>
  );
}
