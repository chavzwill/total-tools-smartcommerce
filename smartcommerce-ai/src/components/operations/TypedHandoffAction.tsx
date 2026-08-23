import { AlertCircle, ArrowRightLeft, FilePlus2, PackagePlus, SlidersHorizontal, Wrench } from "lucide-react";
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

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const stockOf = (row: Row) => number(row.stock_qty ?? row.stock);

async function liveBranchInventory(branchId: string) {
  const rows = await operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(branchId)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`);
  return Array.isArray(rows) ? rows : [];
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
        customer_id: handoff.customerId || null, employee_id: staff.employeeId, branch_id: branchId || null, quote_type: "sale", items,
        discount_amount: 0, valid_until: handoff.fields.validUntil || null,
        notes: [handoff.externalReference ? `SmartCommerce source: ${handoff.externalReference}` : "SmartCommerce approved handoff", handoff.notes].filter(Boolean).join("\n"),
      }) });
      onApplied(await acknowledge(String(row.id), String(row.item_type), String(quote.quote_number || quote.id || "quotation")));
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
      const workOrder = await operationsRequest<Row>("work-orders", { method: "POST", body: JSON.stringify({
        customer_id: handoff.customerId, employee_id: staff.employeeId, branch_id: handoff.branchId || staff.defaultBranchId || null,
        description, item_label: handoff.fields.equipment || handoff.items[0]?.name || handoff.items[0]?.description || null,
      }) });
      onApplied(await acknowledge(String(row.id), String(row.item_type), String(workOrder.wo_number || workOrder.id || "work order")));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function createPurchaseRequest() {
    if (working) return;
    setWorking(true); setError("");
    try {
      const staff = await currentStaff();
      if (!handoff.items.length) throw new Error("The approved export does not contain purchase-request lines.");
      const items = handoff.items.map((item) => ({
        product_id: item.productId ?? null, product_name: item.name || item.description || item.sku || "Approved SmartCommerce item", sku: item.sku || null,
        quantity: item.quantity, unit_cost: Math.max(0, item.unitPrice || 0), item_type: "sale",
        notes: handoff.externalReference ? `SmartCommerce source ${handoff.externalReference}` : null,
      }));
      const pr = await operationsRequest<Row>("purchase-requests", { method: "POST", body: JSON.stringify({
        branch_id: handoff.branchId || staff.defaultBranchId || null, employee_id: staff.employeeId,
        notes: [handoff.externalReference ? `SmartCommerce source: ${handoff.externalReference}` : "SmartCommerce approved handoff", handoff.notes].filter(Boolean).join("\n"),
        required_date: handoff.fields.dueDate || null, request_type: "sale_items", supplier_id: handoff.fields.supplierId || null, currency: "JMD", items,
      }) });
      onApplied(await acknowledge(String(row.id), String(row.item_type), String(pr.pr_number || pr.id || "purchase request")));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function createTransfer() {
    if (working) return;
    setWorking(true); setError("");
    try {
      const staff = await currentStaff();
      const source = String(handoff.fields.sourceBranchId || "");
      const destination = String(handoff.fields.destinationBranchId || "");
      if (!source || !destination) throw new Error("Both source and destination branches are required.");
      if (source === destination) throw new Error("Source and destination branches must be different.");
      if (!handoff.items.length || handoff.items.some((item) => item.productId === undefined)) throw new Error("Every transfer line must be linked to an authoritative POS product ID.");

      const live = await liveBranchInventory(source);
      const byProduct = new Map(live.map((item) => [String(item.id), item]));
      const lines = handoff.items.map((item) => {
        const current = byProduct.get(String(item.productId));
        if (!current) throw new Error(`${item.name || item.sku || `Product ${item.productId}`} is not available at the source branch.`);
        const quantity = Math.max(1, Math.trunc(item.quantity));
        const available = stockOf(current);
        if (quantity > available) throw new Error(`${item.name || current.name || item.sku || `Product ${item.productId}`} requires ${quantity}; only ${available} is currently available at the source branch.`);
        return { product_id: item.productId, quantity, label: item.name || current.name || item.sku || `Product ${item.productId}`, available };
      });

      const impact = lines.map((line) => `${line.label}: transfer ${line.quantity} of ${line.available} currently available`).join("\n");
      if (!window.confirm(`Create this real branch transfer?\n\nSource: ${source}\nDestination: ${destination}\n\n${impact}\n\nCreating the transfer immediately reserves/deducts these quantities at the source branch.`)) return;

      const transfer = await operationsRequest<Row>("transfers", { method: "POST", body: JSON.stringify({
        from_branch_id: source, to_branch_id: destination, employee_id: staff.employeeId,
        items: lines.map(({ product_id, quantity }) => ({ product_id, quantity })),
        notes: [handoff.externalReference ? `SmartCommerce approved transfer: ${handoff.externalReference}` : "SmartCommerce approved transfer", handoff.notes].filter(Boolean).join("\n"),
      }) });
      onApplied(await acknowledge(String(row.id), String(row.item_type), String(transfer.transfer_number || transfer.id || "branch transfer")));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  async function applyInventoryAdjustment() {
    if (working) return;
    setWorking(true); setError("");
    try {
      const staff = await currentStaff();
      const branch = String(handoff.branchId || staff.defaultBranchId || "");
      if (!branch) throw new Error("An authoritative branch is required before stock can be adjusted.");
      if (handoff.items.length !== 1 || handoff.items[0].productId === undefined) throw new Error("Inventory adjustment handoffs must identify exactly one authoritative POS product.");
      const rawAdjustment = Number(handoff.fields.adjustment);
      if (!Number.isFinite(rawAdjustment) || !Number.isInteger(rawAdjustment) || rawAdjustment === 0) throw new Error("A non-zero whole-number stock adjustment is required.");
      const reason = String(handoff.fields.reason || "").trim();
      if (!reason) throw new Error("An audit reason is required before stock can be adjusted.");

      const item = handoff.items[0];
      const live = await liveBranchInventory(branch);
      const current = live.find((candidate) => String(candidate.id) === String(item.productId));
      if (!current) throw new Error("The product is not present in live inventory at the selected branch.");
      const currentStock = stockOf(current);
      const projected = currentStock + rawAdjustment;
      if (projected < 0) throw new Error(`This adjustment would reduce stock below zero (${currentStock} → ${projected}).`);
      const label = item.name || current.name || item.sku || `Product ${item.productId}`;
      if (!window.confirm(`Post this authoritative inventory adjustment?\n\n${label}\nBranch: ${branch}\nCurrent stock: ${currentStock}\nAdjustment: ${rawAdjustment > 0 ? "+" : ""}${rawAdjustment}\nProjected stock: ${projected}\nReason: ${reason}\n\nThis posts directly to the POS stock ledger.`)) return;

      await operationsRequest(`inventory/${encodeURIComponent(String(item.productId))}/stock`, { method: "PATCH", body: JSON.stringify({
        adjustment: rawAdjustment, branch_id: branch,
        reason: [reason, handoff.externalReference ? `SmartCommerce source ${handoff.externalReference}` : "SmartCommerce approved adjustment"].join(" · "),
      }) });
      onApplied(await acknowledge(String(row.id), String(row.item_type), `Stock adjustment ${item.sku || item.productId} ${rawAdjustment > 0 ? "+" : ""}${rawAdjustment}`));
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  }

  if (!["quote", "repair", "purchase_request", "transfer", "inventory"].includes(handoff.kind)) return null;
  const hasAuthoritativeProducts = handoff.items.length > 0 && handoff.items.every((item) => item.productId !== undefined);
  const blocked = handoff.missing.length > 0 || (handoff.kind === "repair" && !handoff.customerId)
    || (handoff.kind === "transfer" && !hasAuthoritativeProducts)
    || (handoff.kind === "inventory" && (handoff.items.length !== 1 || !hasAuthoritativeProducts));
  const mutation = ["transfer", "inventory"].includes(handoff.kind);

  return <div className="sc-ops-handoff__typed">
    <div><strong>{mutation ? "Approved-data controlled action" : "Approved-data draft"}</strong><span>{handoff.warnings.length ? handoff.warnings.join(" ") : mutation ? "Live inventory will be revalidated immediately before the mutation." : "Typed SmartCommerce fields are ready for destination validation."}</span>{handoff.missing.length ? <small>Missing: {handoff.missing.join(", ")}</small> : null}</div>
    {handoff.kind === "quote" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createQuote()}><FilePlus2 size={15}/>{working ? "Creating…" : "Create draft quotation"}</button> : null}
    {handoff.kind === "repair" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createRepair()}><Wrench size={15}/>{working ? "Creating…" : "Create repair intake"}</button> : null}
    {handoff.kind === "purchase_request" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createPurchaseRequest()}><PackagePlus size={15}/>{working ? "Creating…" : "Create draft purchase request"}</button> : null}
    {handoff.kind === "transfer" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void createTransfer()}><ArrowRightLeft size={15}/>{working ? "Checking live stock…" : "Review & create transfer"}</button> : null}
    {handoff.kind === "inventory" ? <button type="button" className="sc-button sc-button--primary" disabled={working || blocked} onClick={() => void applyInventoryAdjustment()}><SlidersHorizontal size={15}/>{working ? "Checking live stock…" : "Review & post adjustment"}</button> : null}
    {error ? <p className="sc-ops-handoff__error" role="alert"><AlertCircle size={15}/>{error}</p> : null}
  </div>;
}
