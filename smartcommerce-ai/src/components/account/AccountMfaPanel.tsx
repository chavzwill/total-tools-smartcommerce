import { Check, ChevronDown, Copy, KeyRound, ShieldAlert, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
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
import "../../styles/account-security-polish.css";

type OpenPanel = "verify" | "recovery" | "danger" | null;

export default function AccountMfaPanel() {
  const [status, setStatus] = useState<MfaStatus>({ totpEnabled: false, recoveryCodesRemaining: 0 });
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState<"secret" | "recovery" | "">("");
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try { setStatus(await getMfaStatus()); } catch { setStatus({ totpEnabled: false, recoveryCodesRemaining: 0 }); }
  }

  useEffect(() => { void refresh(); }, []);

  function togglePanel(panel: Exclude<OpenPanel, null>) {
    setOpenPanel((current) => current === panel ? null : panel);
    setError("");
    setNotice("");
  }

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
      setOpenPanel(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The authenticator code could not be verified."); }
    finally { setBusy(false); }
  }

  async function useRecoveryCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await stepUpWithRecoveryCode(recoveryCode.trim()); setRecoveryCode(""); await refresh();
      const until = new Date(result.stepUpExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotice(`Recovery code accepted and permanently consumed. Sensitive actions are authorised until ${until}.`);
      setOpenPanel(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That recovery code could not be used."); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true); setError(""); setNotice("");
    try {
      await disableTotp();
      await refresh();
      setOpenPanel(null);
      setNotice("Authenticator-app MFA and its recovery codes have been disabled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "MFA could not be disabled. Confirm with a passkey or authenticator code first."); }
    finally { setBusy(false); }
  }

  return (
    <section className="sc-security-card sc-security-card--mfa sc-mfa-polished" aria-labelledby="sc-mfa-title">
      <div className="sc-security-card__head sc-mfa-polished__head">
        <div className="sc-security-card__icon"><ShieldCheck size={20} /></div>
        <div>
          <span className="sc-eyebrow">Two-step verification</span>
          <h3 id="sc-mfa-title">Authenticator app</h3>
          <p>Use rotating 6-digit codes to protect high-risk account and commercial actions.</p>
        </div>
        <span className={`sc-status-pill ${status.totpEnabled ? "is-on" : ""}`}>{status.totpEnabled ? "Enabled" : "Not set up"}</span>
      </div>

      {!status.totpEnabled && !secret && (
        <div className="sc-security-card__body sc-security-start sc-mfa-polished__setup-start">
          <div className="sc-security-callout">
            <Smartphone size={20} />
            <div><strong>Recommended security</strong><span>Works with Apple Passwords, Google Authenticator, Microsoft Authenticator, 1Password and compatible apps.</span></div>
          </div>
          <label className="sc-field">Current password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} disabled={busy} placeholder="Confirm it’s you" /></label>
          <button className="sc-primary-action" type="button" disabled={busy || !password} onClick={beginSetup}><KeyRound size={17} /> {busy ? "Preparing…" : "Set up authenticator"}</button>
        </div>
      )}

      {!status.totpEnabled && secret && (
        <div className="sc-security-card__body sc-mfa-setup">
          <div className="sc-setup-progress" aria-label="Authenticator setup steps">
            <span className="is-active"><b>1</b> Add account</span><span><b>2</b> Verify code</span><span><b>3</b> Save codes</span>
          </div>
          <div className="sc-setup-panel">
            <span className="sc-eyebrow">Step 1</span>
            <h4>Add SmartCommerce to your authenticator</h4>
            <p>Tap the button below. If your authenticator does not open, copy the setup key and add it manually.</p>
            {uri && <a className="sc-primary-action sc-primary-action--link" href={uri}><Smartphone size={17} /> Open authenticator app</a>}
            <div className="sc-secret-box">
              <div><span>Manual setup key</span><code>{secret}</code></div>
              <button type="button" className="sc-icon-action" onClick={() => void copyText(secret, "secret")} aria-label="Copy setup key">{copied === "secret" ? <Check size={18} /> : <Copy size={18} />}</button>
            </div>
          </div>
          <div className="sc-setup-panel">
            <span className="sc-eyebrow">Step 2</span>
            <h4>Enter the 6-digit code</h4>
            <p>Your authenticator app will show a code that changes every 30 seconds.</p>
            <label className="sc-field sc-code-field">Verification code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} placeholder="000000" /></label>
            <button className="sc-primary-action" type="button" disabled={busy || code.length !== 6} onClick={confirmSetup}>{busy ? "Verifying…" : "Verify and enable"}</button>
          </div>
        </div>
      )}

      {status.totpEnabled && (
        <div className="sc-security-card__body sc-mfa-polished__enabled">
          <div className="sc-mfa-status-row">
            <div className="sc-mfa-status-row__icon"><ShieldCheck size={18} /></div>
            <div>
              <strong>Authenticator protection is active</strong>
              <span>{status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? "" : "s"} remaining</span>
            </div>
          </div>

          <div className="sc-mfa-action-list">
            <div className={`sc-mfa-action ${openPanel === "verify" ? "is-open" : ""}`}>
              <button className="sc-mfa-action__trigger" type="button" onClick={() => togglePanel("verify")} aria-expanded={openPanel === "verify"}>
                <span><strong>Confirm a sensitive action</strong><small>Use a fresh 6-digit authenticator code.</small></span>
                <ChevronDown size={19} />
              </button>
              {openPanel === "verify" && (
                <div className="sc-mfa-action__content">
                  <label className="sc-field sc-code-field">Authenticator code<input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} placeholder="000000" /></label>
                  <button className="sc-primary-action" type="button" disabled={busy || code.length !== 6} onClick={verifyCode}>{busy ? "Checking…" : "Confirm identity"}</button>
                </div>
              )}
            </div>

            <div className={`sc-mfa-action ${openPanel === "recovery" ? "is-open" : ""}`}>
              <button className="sc-mfa-action__trigger" type="button" onClick={() => togglePanel("recovery")} aria-expanded={openPanel === "recovery"}>
                <span><strong>Use a recovery code</strong><small>Use only if your authenticator is unavailable.</small></span>
                <ChevronDown size={19} />
              </button>
              {openPanel === "recovery" && (
                <div className="sc-mfa-action__content">
                  <label className="sc-field">One-time recovery code<input autoFocus autoComplete="off" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 32))} placeholder="XXXXXX-XXXXXX" /></label>
                  <button className="sc-secondary-action" type="button" disabled={busy || !recoveryCode} onClick={useRecoveryCode}><ShieldAlert size={17} /> Use recovery code</button>
                </div>
              )}
            </div>
          </div>

          <div className={`sc-mfa-danger-zone ${openPanel === "danger" ? "is-open" : ""}`}>
            <button className="sc-mfa-action__trigger sc-mfa-action__trigger--danger" type="button" onClick={() => togglePanel("danger")} aria-expanded={openPanel === "danger"}>
              <span><strong>Danger zone</strong><small>Turn off authenticator protection for this account.</small></span>
              <ChevronDown size={19} />
            </button>
            {openPanel === "danger" && (
              <div className="sc-mfa-danger-zone__content">
                <div className="sc-mfa-danger-warning"><TriangleAlert size={18} /><span>Disabling MFA removes authenticator protection and invalidates your recovery codes.</span></div>
                <button className="sc-danger-button" type="button" disabled={busy} onClick={turnOff}>{busy ? "Disabling…" : "Disable authenticator MFA"}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="sc-recovery-panel" role="group" aria-label="One-time recovery codes">
          <div><span className="sc-eyebrow">Step 3 · Save now</span><h4>Recovery codes</h4><p>Each code works once. Keep them somewhere separate from this device.</p></div>
          <button className="sc-secondary-action" type="button" onClick={() => void copyText(recoveryCodes.join("\n"), "recovery")}>{copied === "recovery" ? <Check size={17} /> : <Copy size={17} />} {copied === "recovery" ? "Copied" : "Copy all"}</button>
          <div className="sc-recovery-grid">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div>
        </div>
      )}

      {notice && <p role="status" className="sc-account-real__notice sc-mfa-polished__message">{notice}</p>}
      {error && <p role="alert" className="sc-account-real__error sc-mfa-polished__message">{error}</p>}
    </section>
  );
}
