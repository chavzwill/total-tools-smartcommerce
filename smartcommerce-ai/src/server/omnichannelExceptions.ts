import { neon } from "@neondatabase/serverless";
import { listOutcomeLinks } from "./omnichannelOutcomeSync.js";

let sqlClient: ReturnType<typeof neon> | undefined;
type Row = Record<string, any>;
export type ExceptionSeverity = "critical" | "high" | "medium" | "low";
export type OmnichannelException = {
  id: string;
  intakeId: string;
  category: string;
  severity: ExceptionSeverity;
  title: string;
  reason: string;
  sourceChannel: string;
  itemType: string;
  resource?: string | null;
  reference?: string | null;
  status?: string | null;
  ageHours: number;
  destinationSection?: string | null;
  occurredAt: string;
};

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("OMNICHANNEL_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

const terminal = new Set(["completed", "returned", "cancelled", "canceled", "declined", "rejected", "voided", "refunded", "received", "closed"]);
const hoursSince = (value: unknown) => {
  const ms = new Date(String(value || "")).getTime();
  return Number.isFinite(ms) ? Math.max(0, (Date.now() - ms) / 3600000) : 0;
};
const iso = (value: unknown) => {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
};
function push(list: OmnichannelException[], row: Row, category: string, severity: ExceptionSeverity, title: string, reason: string, ageHours: number, outcome?: Row) {
  list.push({
    id: `${category}:${row.id || outcome?.intake_id || "unknown"}`,
    intakeId: String(row.id || outcome?.intake_id || ""), category, severity, title, reason,
    sourceChannel: String(row.source_channel || outcome?.source_channel || "smartcommerce"),
    itemType: String(row.item_type || outcome?.item_type || "unknown"),
    resource: outcome?.resource || row.destination_resource || null,
    reference: outcome?.reference || row.downstream_reference || null,
    status: outcome?.authoritative_status || row.status || null,
    ageHours: Number(ageHours.toFixed(1)), destinationSection: row.destination_section || null,
    occurredAt: iso(row.updated_at || row.received_at || outcome?.updated_at || outcome?.registered_at),
  });
}

export async function buildOmnichannelExceptions(input: { refresh?: boolean; limit?: number } = {}) {
  const intake = await sql()`SELECT * FROM omnichannel_intake_items ORDER BY updated_at DESC LIMIT 1000` as Row[];
  const outcomes = await listOutcomeLinks({ limit: Math.max(1, Math.min(200, Number(input.limit || 200))), refresh: input.refresh !== false });
  const outcomeByIntake = new Map(outcomes.map((row: Row) => [String(row.intake_id), row]));
  const exceptions: OmnichannelException[] = [];

  for (const row of intake) {
    const age = hoursSince(row.updated_at || row.received_at);
    const status = String(row.status || "").toLowerCase();
    if (["received", "review_required"].includes(status) && age >= 4) push(exceptions, row, "review_sla", age >= 24 ? "critical" : "high", "Manual review overdue", `This ${row.item_type} has waited ${age.toFixed(1)} hours for a decision.`, age);
    if (["approved", "auto_accepted"].includes(status) && age >= 4 && row.destination_section !== "reviews") push(exceptions, row, "routing_sla", age >= 24 ? "high" : "medium", "Approved record not routed", `Approved intake has not entered ${row.destination_label || row.destination_section || "its destination"}.`, age);
    if (status === "processing" && age >= 2) push(exceptions, row, "processing_sla", age >= 24 ? "critical" : age >= 8 ? "high" : "medium", "Downstream processing is taking too long", `This handoff has remained in processing for ${age.toFixed(1)} hours.`, age);
    if (status === "failed") push(exceptions, row, "processing_failure", "critical", "Downstream processing failed", String(row.processing_error || "The destination workflow reported a failure."), age);
  }

  for (const outcome of outcomes as Row[]) {
    const row = intake.find((candidate) => String(candidate.id) === String(outcome.intake_id)) || { id: outcome.intake_id, item_type: outcome.item_type, source_channel: outcome.source_channel, updated_at: outcome.updated_at };
    const snapshot = outcome.safe_snapshot || {};
    const age = hoursSince(snapshot.updatedAt || outcome.updated_at || outcome.registered_at);
    const status = String(outcome.authoritative_status || snapshot.status || "").toLowerCase();
    const resource = String(outcome.resource || "");
    if (outcome.last_sync_error) push(exceptions, row, "sync_failure", "high", "Authoritative status refresh failed", "SmartCommerce could not refresh this record from the POS; the displayed status may be stale.", age, outcome);
    if (status === "not_found") push(exceptions, row, "downstream_missing", "critical", "Linked POS record cannot be found", "The downstream entity previously linked to this intake is no longer resolvable by its authoritative POS ID.", age, outcome);
    if (resource === "transactions" && ["held", "hold", "on_hold", "pending"].includes(status) && age >= 24) push(exceptions, row, "stale_hold", age >= 72 ? "high" : "medium", "Held order has not completed", `The POS hold has remained open for ${age.toFixed(0)} hours.`, age, outcome);
    if (resource === "quotations" && !terminal.has(status)) {
      const valid = new Date(String(snapshot.validUntil || "")).getTime();
      if (Number.isFinite(valid)) {
        const days = (valid - Date.now()) / 86400000;
        if (days < 0) push(exceptions, row, "quote_expired", "high", "Quotation has expired", `This quotation expired ${Math.abs(days).toFixed(1)} days ago and has not reached a terminal state.`, age, outcome);
        else if (days <= 3) push(exceptions, row, "quote_expiring", "medium", "Quotation is nearing expiry", `This quotation expires in ${days.toFixed(1)} days.`, age, outcome);
      }
    }
    if (resource === "rentals" && !terminal.has(status)) {
      const end = new Date(String(snapshot.endAt || "")).getTime();
      if (Number.isFinite(end) && end < Date.now()) push(exceptions, row, "rental_overdue", "critical", "Rental is overdue", `The recorded return/due time passed ${((Date.now() - end) / 86400000).toFixed(1)} days ago.`, age, outcome);
    }
    if (resource === "work-orders" && !terminal.has(status) && age >= 72) push(exceptions, row, "repair_stalled", age >= 168 ? "high" : "medium", "Repair has not progressed recently", `The work order's authoritative status has been unchanged for about ${(age / 24).toFixed(1)} days.`, age, outcome);
    if (resource === "purchase-orders" && !terminal.has(status)) {
      const expected = new Date(String(snapshot.expectedDate || "")).getTime();
      if (Number.isFinite(expected) && expected < Date.now()) push(exceptions, row, "po_delayed", "high", "Purchase order is past expected date", `Expected receipt is overdue by ${((Date.now() - expected) / 86400000).toFixed(1)} days.`, age, outcome);
    }
    if (resource === "transfers" && !terminal.has(status) && age >= 48) push(exceptions, row, "transfer_delayed", age >= 120 ? "high" : "medium", "Branch transfer is taking too long", `The transfer has remained unresolved for about ${(age / 24).toFixed(1)} days.`, age, outcome);
  }

  const order: Record<ExceptionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  exceptions.sort((a, b) => order[b.severity] - order[a.severity] || b.ageHours - a.ageHours);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: exceptions.length,
      critical: exceptions.filter((item) => item.severity === "critical").length,
      high: exceptions.filter((item) => item.severity === "high").length,
      medium: exceptions.filter((item) => item.severity === "medium").length,
      low: exceptions.filter((item) => item.severity === "low").length,
    },
    exceptions,
  };
}
