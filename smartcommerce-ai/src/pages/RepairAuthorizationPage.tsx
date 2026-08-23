import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../styles/repair-authorization-page.css";

type Authorization = {
  id: string;
  work_order_id: string;
  authorization_type: "initial_estimate" | "change_order" | string;
  version: number;
  status: "pending" | "approved" | "declined" | "superseded" | "cancelled" | string;
  currency?: string;
  labor_amount?: number | string;
  consumables_amount?: number | string;
  parts_amount?: number | string;
  total_amount?: number | string;
  deposit_amount?: number | string;
  scope_text?: string | null;
  reason?: string | null;
  requested_at?: string | null;
  customer_token_expires_at?: string | null;
  decision_note?: string | null;
  decided_at?: string | null;
};

type ApiPayload = { authorization: Authorization };

const money = (value: unknown, currency = "JMD") =>
  new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));

const dateTime = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

async function requestAuthorization(token: string, init?: RequestInit): Promise<ApiPayload> {
  const response = await fetch(`/api/repair-authorization-public?token=${encodeURIComponent(token)}`, {
    credentials: "omit",
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "This repair authorization could not be loaded.");
  return payload as ApiPayload;
}

export default function RepairAuthorizationPage({ token }: { token: string }) {
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approved" | "declined" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!token || token.length < 32) {
      setLoading(false);
      setError("This repair authorization link is invalid.");
      return () => { active = false; };
    }
    void requestAuthorization(token)
      .then((payload) => { if (active) setAuthorization(payload.authorization); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "This repair authorization could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const currency = authorization?.currency || "JMD";
  const typeLabel = authorization?.authorization_type === "change_order" ? "Repair change order" : "Repair authorization";
  const pending = authorization?.status === "pending";
  const approved = authorization?.status === "approved";
  const declined = authorization?.status === "declined";

  const lineItems = useMemo(() => {
    if (!authorization) return [];
    return [
      ["Labour", authorization.labor_amount],
      ["Parts", authorization.parts_amount],
      ["Consumables", authorization.consumables_amount],
    ] as Array<[string, unknown]>;
  }, [authorization]);

  async function decide(decision: "approved" | "declined") {
    if (!pending || submitting) return;
    setSubmitting(decision);
    setError("");
    try {
      const payload = await requestAuthorization(token, {
        method: "POST",
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      setAuthorization(payload.authorization);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your decision could not be recorded.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <main className="sc-repair-auth-page">
      <div className="sc-repair-auth-brand" aria-label="Total Tools Jamaica">
        <span>Total Tools Jamaica</span>
        <strong>SmartCommerce</strong>
      </div>

      {loading ? (
        <section className="sc-repair-auth-state" role="status" aria-live="polite">
          <Loader2 className="sc-repair-auth-spin" size={28} />
          <strong>Loading your repair authorization…</strong>
          <p>We’re retrieving the exact scope sent to you by the Total Tools service team.</p>
        </section>
      ) : error && !authorization ? (
        <section className="sc-repair-auth-state is-error" role="alert">
          <AlertCircle size={28} />
          <strong>Authorization unavailable</strong>
          <p>{error}</p>
          <small>Please contact Total Tools if you need a new authorization link.</small>
        </section>
      ) : authorization ? (
        <section className="sc-repair-auth-card" aria-labelledby="repair-authorization-title">
          <header>
            <div className="sc-repair-auth-icon"><Wrench size={24} /></div>
            <div>
              <span>{typeLabel} · Version {authorization.version}</span>
              <h1 id="repair-authorization-title">Review the work before we proceed</h1>
              <p>Work order {authorization.work_order_id}</p>
            </div>
            <em className={`is-${authorization.status}`}>{authorization.status.replace(/_/g, " ")}</em>
          </header>

          {(approved || declined) ? (
            <div className={`sc-repair-auth-decision is-${authorization.status}`}>
              {approved ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
              <div>
                <strong>{approved ? "You approved this repair scope." : "You declined this repair scope."}</strong>
                <span>{authorization.decided_at ? `Recorded ${dateTime(authorization.decided_at)}` : "Your decision has been recorded."}</span>
              </div>
            </div>
          ) : null}

          <div className="sc-repair-auth-scope">
            <span>Proposed work</span>
            <p>{authorization.scope_text || "The service team did not provide a written scope."}</p>
            {authorization.reason ? <small><strong>Why this changed:</strong> {authorization.reason}</small> : null}
          </div>

          <div className="sc-repair-auth-pricing" aria-label="Repair pricing">
            {lineItems.map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{money(value, currency)}</strong></div>
            ))}
            <div className="is-total"><span>Total authorized scope</span><strong>{money(authorization.total_amount, currency)}</strong></div>
            <div className="is-deposit"><span>Deposit required by POS</span><strong>{money(authorization.deposit_amount, currency)}</strong></div>
          </div>

          <div className="sc-repair-auth-meta">
            <span><small>Requested</small><strong>{dateTime(authorization.requested_at)}</strong></span>
            <span><small>Secure link expires</small><strong>{dateTime(authorization.customer_token_expires_at)}</strong></span>
          </div>

          {pending ? (
            <>
              <label className="sc-repair-auth-note">
                Optional note to the service team
                <textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a question, condition or reason for declining…" data-guide-id="repair-authorization-note" />
              </label>
              {error ? <div className="sc-repair-auth-inline-error" role="alert"><AlertCircle size={16} />{error}</div> : null}
              <div className="sc-repair-auth-actions">
                <button type="button" className="is-decline" disabled={Boolean(submitting)} onClick={() => void decide("declined")} data-guide-id="repair-authorization-decline">
                  <XCircle size={18} />{submitting === "declined" ? "Recording…" : "Decline scope"}
                </button>
                <button type="button" className="is-approve" disabled={Boolean(submitting)} onClick={() => void decide("approved")} data-guide-id="repair-authorization-approve">
                  <CheckCircle2 size={18} />{submitting === "approved" ? "Recording approval…" : "Approve repair"}
                </button>
              </div>
            </>
          ) : null}

          <footer>
            <ShieldCheck size={17} />
            <p><strong>Your approval is separate from payment.</strong> Approving authorizes the repair scope shown above. Any deposit or final payment is handled separately through Total Tools.</p>
          </footer>
        </section>
      ) : null}
    </main>
  );
}
