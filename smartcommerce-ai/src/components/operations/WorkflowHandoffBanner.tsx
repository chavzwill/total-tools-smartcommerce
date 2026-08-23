import { AlertCircle, ArrowLeft, CheckCircle2, CircleX, Link2 } from "lucide-react";
import { useState } from "react";
import type { OperationsSection } from "./OperationsWorkspace";

type Row = Record<string, any>;

async function recordOutcome(row: Row, outcome: "applied" | "failed", downstreamReference: string, error: string) {
  const response = await fetch("/api/omnichannel", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "outcome",
      id: row.id,
      itemType: row.item_type,
      outcome,
      downstreamReference: downstreamReference.trim() || undefined,
      error: error.trim() || undefined,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "The handoff outcome could not be recorded.");
  return payload?.data as Row;
}

const titleCase = (value: unknown) => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default function WorkflowHandoffBanner({ row, onReturn, onResolved }: { row: Row; onReturn: () => void; onResolved: (row: Row) => void }) {
  const [reference, setReference] = useState("");
  const [failure, setFailure] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function finish(outcome: "applied" | "failed") {
    if (working) return;
    setWorking(true); setError("");
    try {
      const updated = await recordOutcome(row, outcome, reference, failure);
      onResolved(updated);
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  return <section className="sc-ops-handoff" data-guide-id="omnichannel-active-handoff">
    <div className="sc-ops-handoff__head">
      <div><span><Link2 size={14}/>Routed omnichannel work</span><strong>{titleCase(row.item_type)}</strong><p>{row.processing_note || `Complete this record in ${row.destination_label || "the destination workflow"}, then acknowledge the result.`}</p></div>
      <button type="button" className="sc-button sc-button--secondary" onClick={onReturn}><ArrowLeft size={15}/>Back to reviews</button>
    </div>
    <dl>
      <div><dt>Source</dt><dd>{titleCase(row.source_channel)} · {titleCase(row.source_application)}</dd></div>
      <div><dt>External reference</dt><dd>{row.external_id || row.entity_id || "—"}</dd></div>
      <div><dt>Destination</dt><dd>{row.destination_label || titleCase(row.destination_section)}</dd></div>
      <div><dt>Routed by</dt><dd>{row.dispatched_by_employee_id || "—"}</dd></div>
    </dl>
    <details><summary>View approved source payload</summary><pre>{JSON.stringify(row.payload || {}, null, 2)}</pre></details>
    <div className="sc-ops-handoff__outcome">
      <label>Downstream reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={240} placeholder="e.g. quote, work order, rental or PO number" /></label>
      <label>Failure / exception note<input value={failure} onChange={(event) => setFailure(event.target.value)} maxLength={1000} placeholder="Only needed if processing fails" /></label>
      <button type="button" className="sc-button sc-button--secondary" disabled={working} onClick={() => void finish("failed")}><CircleX size={15}/>Mark failed</button>
      <button type="button" className="sc-button sc-button--primary" disabled={working} onClick={() => void finish("applied")}><CheckCircle2 size={15}/>Mark applied</button>
    </div>
    {error ? <p className="sc-ops-handoff__error" role="alert"><AlertCircle size={15}/>{error}</p> : null}
  </section>;
}

export type { OperationsSection };
