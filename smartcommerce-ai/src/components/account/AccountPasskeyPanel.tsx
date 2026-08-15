import { Fingerprint, KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import AccountMfaPanel from "./AccountMfaPanel";
import {
  confirmSensitiveAction,
  listCustomerPasskeys,
  passkeysSupported,
  registerCustomerPasskey,
  stepUpWithCustomerPasskey,
  type CustomerPasskey,
} from "../../lib/passkeys";
import {
  listCustomerSessions,
  revokeCustomerSession,
  revokeOtherCustomerSessions,
  type CustomerSession,
} from "../../lib/accountSessions";

export default function AccountPasskeyPanel() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<CustomerPasskey[]>([]);
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refreshPasskeys() { try { setPasskeys(await listCustomerPasskeys()); } catch { setPasskeys([]); } }
  async function refreshSessions() { try { setSessions(await listCustomerSessions()); } catch { setSessions([]); } }

  useEffect(() => {
    setSupported(passkeysSupported());
    void refreshPasskeys();
    void refreshSessions();
  }, []);

  async function addPasskey() {
    if (!password) { setError("Confirm your current password before adding a passkey."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await confirmSensitiveAction(password, "passkey_registration");
      await registerCustomerPasskey("My passkey");
      setPassword(""); await refreshPasskeys();
      setNotice("Passkey added. You can now use your device security for sensitive SmartCommerce actions.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The passkey could not be added."); }
    finally { setBusy(false); }
  }

  async function verifyPasskey() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await stepUpWithCustomerPasskey();
      const until = new Date(result.stepUpExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotice(`Identity confirmed with your passkey. Sensitive actions are authorised until ${until}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Passkey verification failed."); }
    finally { setBusy(false); }
  }

  async function revokeSession(session: CustomerSession) {
    setBusy(true); setError(""); setNotice("");
    try { await revokeCustomerSession(session.id); await refreshSessions(); setNotice(`${session.label} has been signed out.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That session could not be revoked."); }
    finally { setBusy(false); }
  }

  async function revokeOthers() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await revokeOtherCustomerSessions(); await refreshSessions();
      setNotice(result.revoked ? `${result.revoked} other session${result.revoked === 1 ? "" : "s"} signed out.` : "There were no other active sessions.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Other sessions could not be revoked."); }
    finally { setBusy(false); }
  }

  return (
    <div className="sc-security-stack">
      <section className="sc-security-card" aria-labelledby="sc-passkey-title">
        <div className="sc-security-card__head">
          <div className="sc-security-card__icon"><Fingerprint size={20} /></div>
          <div><span className="sc-eyebrow">Device security</span><h3 id="sc-passkey-title">Passkeys</h3><p>Use Face ID, Touch ID, your device PIN, or a compatible security key.</p></div>
          <span className={`sc-status-pill ${passkeys.length ? "is-on" : ""}`}>{passkeys.length ? `${passkeys.length} added` : "Optional"}</span>
        </div>
        <div className="sc-security-card__body">
          {!supported ? <div className="sc-security-callout"><Fingerprint size={20} /><div><strong>Passkeys unavailable here</strong><span>This browser or device does not currently report WebAuthn support.</span></div></div> : (
            <>
              {passkeys.length > 0 && <div className="sc-device-list">{passkeys.map((passkey) => <div className="sc-device-row" key={passkey.id}><div className="sc-device-row__icon"><ShieldCheck size={17} /></div><div><strong>{passkey.label || "Passkey"}</strong><span>{passkey.backedUp ? "Synced / backed up" : "Available on this device"}</span></div></div>)}</div>}
              <div className="sc-inline-form">
                <label className="sc-field">Current password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} disabled={busy} placeholder="Confirm it’s you" /></label>
                <button className="sc-primary-action" type="button" disabled={busy || !password} onClick={addPasskey}><KeyRound size={17} /> {busy ? "Setting up…" : passkeys.length ? "Add another passkey" : "Add a passkey"}</button>
                {passkeys.length > 0 && <button className="sc-secondary-action" type="button" disabled={busy} onClick={verifyPasskey}><Fingerprint size={17} /> Confirm with passkey</button>}
              </div>
            </>
          )}
        </div>
      </section>

      <AccountMfaPanel />

      <section className="sc-security-card" aria-labelledby="sc-sessions-title">
        <div className="sc-security-card__head">
          <div className="sc-security-card__icon"><Laptop size={20} /></div>
          <div><span className="sc-eyebrow">Account access</span><h3 id="sc-sessions-title">Active sessions</h3><p>See where your account is signed in and remove devices you no longer use.</p></div>
          <span className="sc-status-pill is-on">{sessions.length || 1} active</span>
        </div>
        <div className="sc-security-card__body">
          <div className="sc-device-list">
            {sessions.length === 0 ? <div className="sc-empty-state">No active-session details are available yet.</div> : sessions.map((session) => {
              const mobile = /iphone|ipad|android/i.test(session.deviceFamily || "");
              return <div className="sc-device-row" key={session.id}>
                <div className="sc-device-row__icon">{mobile ? <Smartphone size={17} /> : <Laptop size={17} />}</div>
                <div className="sc-device-row__copy"><strong>{session.label}</strong><span>{session.current ? "This device" : "Signed-in device"}{session.lastActivityAt ? ` · Active ${new Date(session.lastActivityAt).toLocaleString()}` : ""}</span></div>
                {!session.current && <button className="sc-row-action" type="button" disabled={busy} onClick={() => revokeSession(session)}><LogOut size={15} /> Sign out</button>}
              </div>;
            })}
          </div>
          {sessions.some((session) => !session.current) && <button className="sc-danger-link" type="button" disabled={busy} onClick={revokeOthers}><LogOut size={17} /> Sign out everywhere else</button>}
          {notice && <p role="status" className="sc-account-real__notice">{notice}</p>}
          {error && <p role="alert" className="sc-account-real__error">{error}</p>}
        </div>
      </section>
    </div>
  );
}
