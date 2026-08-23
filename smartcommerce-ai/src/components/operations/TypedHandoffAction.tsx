import { AlertCircle, FilePlus2, PackagePlus, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizeOmnichannelHandoff } from "../../lib/omnichannelContracts";
import { getStaffSession, operationsRequest, type StaffIdentity } from "../../lib/staffOperations";

type Row = Record<string, any>;

async function acknowledge(id: string, itemType: string, downstreamReference: string) {
  const response = await fetch("/api/omnichannel", {
    method: "PATCH", credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "outcome", id, itemType, outcome: "applied", downstreamReference }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "The omnichannel outcome could not be recorded.");
  return payload?.data as Row;
}

async function currentStaff(): Promise<StaffIdentity> {
  const state = await getStaffSession();
  if (!state.authenticated || !state.staff) throw new Error("Your staff session has expired. Sign in again before creating this record.");
  return state.staff;
}

export default function TypedHandoffAction({ row, onApplied }: { row: Row; onApplied: (updated: Row) => void }) {
  const handoff = useMemo(() => normalizeOmnichannelHandoff(row), [row]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function createQuote() {
    if (working) return;
    setWorking(true); setError("");
    try {
      const staff = await currentStaff();
      if (!handoff.items.length) throw new Error("The approved export does not contain quotation lines.");
      const branchId = handoff.branchId || staff.defaultBranchId;
      const items = handoff.items.map((item) => item.productId !== undefined
        ? { product_id: item.productId, quantity: item.quantity, ...(item.unitPrice !== undefined && item.unitPrice >= 0 ? { unit_price: item.unitPrice } : {}) }
        : { description: item.description || item.name || item.sku || "Approved SmartCommerce item", quantity: item.quantity, unit_price: Math.max(0, item.unitPrice || 0) });
      const quote = await operationsRequest<Row>("quotations", { method: "POST", body: JSON.stringify({
        customer_id: handoff.customerId || null,
        employee_id: staff.employeeId,
        branch_id: branchId || null,
        quote_type: "sale",
        items,
        discount_amount: 0,
        valid_until: handoff.fields.validUntil || null,
        notes: [handoff.externalReference ? `SmartCommerce source: ${handoff.externalReference}` : "SmartCommerce approved handoff", handoff.notes].filter(Boolean).join("\n"),
      }) });
      const reference = String(quote.quote_number || quote.id || "quotation");
      onApplied(await acknowledge(String(row.id), String(row.item_type), reference));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function createRepair() {
    if (working) return;
    setWorking(true); setError("");
    try {
      const staff = await currentStaff();
      if (!handoff.customerId) throw new Error("Link this request to an authoritative POS customer before creating the repair intake.");
      const description = String(handoff.fields.issue || handoff.notes || "").trim();
      if (!description) throw new Error("The approved repair request does not contain a fault/issue description.");
      const branchId = handoff.branchId || staff.defaultBranchId;
      const workOrder = await operationsRequest<Row>("work-orders", { method: "POST", body: JSON.stringify({
        customer_id: handoff.customerId,
        employee_id: staff.employeeId,
        branch_id: branchId || null,
        description,
        item_label: handoff.fields.equipment || handoff.items[0]?.name || handoff.items[0]?.description || null,
      }) });
      const reference = String(workOrder.wo_number || workOrder.id || "work order");
      onApplied(await acknowledge(String(row.id), String(row.item_type), reference));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function createPurchaseRequest() {
    if (working) return;
    setWorking(true); setError("");
    try {
      const staff = await currentStaff();
      if (!handoff.items.length) throw new Error("The approved export does not contain purchase-request lines.");
      const branchId = handoff.branchId || staff.defaultBranchId;
      const items = handoff.items.map((item) => ({
        product_id: item.productId ?? null,
        product_name: item.name || item.description || item.sku || "Approved SmartCommerce item",
        sku: item.sku || null,
        quantity: item.quantity,
        unit_cost: Math.max(0, item.unitPrice || 0),
        item_type: "sale",
        notes: handoff.externalReference ? `SmartCommerce source ${handoff.externalReference}` : null,
      }));
      const pr = await operationsRequest<Row>("purchase-requests", { method: "POST", body: JSON.stringify({
        branch_id: branchId || null,
        employee_id: staff.employeeId,
        notes: [handoff.externalReference ? `SmartCommerce source: ${handoff.externalReference}` : "SmartCommerce approved handoff", handoff.notes].filter(Boolean).join("\n"),
        required_date: handoff.fields.dueDate || null,
        request_type: "sale_items",
        supplier_id: handoff.fields.supplierId || null,
        currency: "JMD",
        items,
      }) });
      const reference = String(pr.pr_number || pr.id || "purchase request");
      onApplied(await acknowledge(String(row.id), String(row.item_type), reference));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  if (!["quote", "repair", "purchase_request"].includes(handoff.kind)) return null;
  const blocked = handoff.missing.length > 0 || (handoff.kind === "repair" && !handoff.customerId);

  return <div className="sc-ops-handoff__typed">
    <div><strong>Approved-data draft</strong><span>{handoff.warnings.length ? handoff.warnings.join(" ") : "Typed SmartCommerce fields are ready for destination validation."}</span>{handoff.missing.length ? <small>Missing: {handoff.missing.join(", ")}</small> : null}</div>
    {handoff.kind === "quote" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createQuote()}><FilePlus2 size={15}/>{working ? "Creating…" : "Create draft quotation"}</button> : null}
    {handoff.kind === "repair" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createRepair()}><Wrench size={15}/>{working ? "Creating…" : "Create repair intake"}</button> : null}
    {handoff.kind === "purchase_request" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createPurchaseRequest()}><PackagePlus size={15}/>{working ? "Creating…" : "Create draft purchase request"}</button> : null}
    {error ? <p className="sc-ops-handoff__error" role="alert"><AlertCircle size={15}/>{error}</p> : null}
  </div>;
}
