import { Fingerprint, KeyRound, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
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

  async function refreshPasskeys() {
    try { setPasskeys(await listCustomerPasskeys()); } catch { setPasskeys([]); }
  }
  async function refreshSessions() {
    try { setSessions(await listCustomerSessions()); } catch { setSessions([]); }
  }

  useEffect(() => {
    setSupported(passkeysSupported());
    void refreshPasskeys();
    void refreshSessions();
  }, []);

  async function addPasskey() {
    if (!password) {
      setError("Confirm your current password before adding a passkey.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await confirmSensitiveAction(password, "passkey_registration");
      await registerCustomerPasskey("My passkey");
      setPassword("");
      await refreshPasskeys();
      setNotice("Passkey added. You can now use your device security for sensitive SmartCommerce actions.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The passkey could not be added.");
    } finally { setBusy(false); }
  }

  async function verifyPasskey() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await stepUpWithCustomerPasskey();
      const until = new Date(result.stepUpExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setNotice(`Identity confirmed with your passkey. Sensitive actions are authorised until ${until}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey verification failed.");
    } finally { setBusy(false); }
  }

  async function revokeSession(session: CustomerSession) {
    setBusy(true); setError(""); setNotice("");
    try {
      await revokeCustomerSession(session.id);
      await refreshSessions();
      setNotice(`${session.label} has been signed out.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That session could not be revoked.");
    } finally { setBusy(false); }
  }

  async function revokeOthers() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await revokeOtherCustomerSessions();
      await refreshSessions();
      setNotice(result.revoked ? `${result.revoked} other session${result.revoked === 1 ? "" : "s"} signed out.` : "There were no other active sessions.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Other sessions could not be revoked.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <section className="sc-account-real__security" aria-labelledby="sc-passkey-title">
        <Fingerprint size={22} />
        <div>
          <strong id="sc-passkey-title">Passkeys & stronger security</strong>
          {!supported ? (
            <span>This browser or device does not currently report WebAuthn passkey support.</span>
          ) : (
            <>
              <span>Use Face ID, Touch ID, your device PIN, or a compatible security key to confirm sensitive actions.</span>
              {passkeys.length > 0 && (
                <div>
                  {passkeys.map((passkey) => (
                    <p key={passkey.id}><ShieldCheck size={15} aria-hidden="true" /> {passkey.label || "Passkey"}{passkey.backedUp ? " · synced/backed up" : ""}</p>
                  ))}
                  <button type="button" disabled={busy} onClick={verifyPasskey}><Fingerprint size={17} /> {busy ? "Checking…" : "Confirm with passkey"}</button>
                </div>
              )}
              <label>
                Current password
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} disabled={busy} />
              </label>
              <button type="button" disabled={busy || !password} onClick={addPasskey}><KeyRound size={17} /> {busy ? "Setting up…" : passkeys.length ? "Add another passkey" : "Add a passkey"}</button>
            </>
          )}
        </div>
      </section>

      <section className="sc-account-real__security" aria-labelledby="sc-sessions-title">
        <Laptop size={22} />
        <div>
          <strong id="sc-sessions-title">Active sessions</strong>
          <span>Review where your SmartCommerce account is currently signed in. Device labels are intentionally approximate and do not expose your raw IP address.</span>
          <div>
            {sessions.length === 0 ? <p>No active-session details are available yet.</p> : sessions.map((session) => {
              const mobile = /iphone|ipad|android/i.test(session.deviceFamily || "");
              return (
                <p key={session.id}>
                  {mobile ? <Smartphone size={15} aria-hidden="true" /> : <Laptop size={15} aria-hidden="true" />}
                  {" "}{session.label}{session.current ? " · This device" : ""}
                  {session.lastActivityAt ? ` · Active ${new Date(session.lastActivityAt).toLocaleString()}` : ""}
                  {!session.current && <button type="button" disabled={busy} onClick={() => revokeSession(session)}><LogOut size={15} /> Sign out</button>}
                </p>
              );
            })}
          </div>
          {sessions.some((session) => !session.current) && <button type="button" disabled={busy} onClick={revokeOthers}><LogOut size={17} /> Sign out everywhere else</button>}
          {notice && <p role="status" className="sc-account-real__notice">{notice}</p>}
          {error && <p role="alert" className="sc-account-real__error">{error}</p>}
        </div>
      </section>
    </>
  );
}
