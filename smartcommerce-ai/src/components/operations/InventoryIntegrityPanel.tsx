import { AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, Loader2, MapPin, RefreshCw, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getStaffSession, operationsRequest, type OperationsApiError, type StaffIdentity } from "../../lib/staffOperations";
import "../../styles/inventory-integrity.css";

type Row = Record<string, any>;
type CountSession = Row & { id: string | number; session_number?: string; status?: string; item_count?: number; counted_count?: number; variance_count?: number; items?: Row[] };

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pretty = (value: unknown) => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const reasons = [
  "Cycle count correction",
  "Damaged stock",
  "Write-off / disposal",
  "Stock found",
  "Receiving correction",
  "Return correction",
  "Data migration correction",
  "Other verified adjustment",
];

function has(staff: StaffIdentity | null, key: string) {
  if (!staff) return false;
  return staff.permissions?.[key] === true || (key === "inventory_edit" && staff.permissions?.inventory === true);
}

export default function InventoryIntegrityPanel({ products, onInventoryRefresh }: { products: Row[]; onInventoryRefresh?: () => void }) {
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [movements, setMovements] = useState<Row[]>([]);
  const [bins, setBins] = useState<Row[]>([]);
  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CountSession | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [productId, setProductId] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState(reasons[0]);
  const [reasonDetail, setReasonDetail] = useState("");
  const [countScope, setCountScope] = useState<"all" | "bin">("all");
  const [countBinId, setCountBinId] = useState("");
  const [countNotes, setCountNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const branchId = String(staff?.defaultBranchId || "");
  const canAdjust = has(staff, "inventory_edit");
  const canCount = has(staff, "cycle-counts");
  const selectedProduct = products.find((row) => String(row.id) === productId);
  const currentStock = n(selectedProduct?.stock_qty ?? selectedProduct?.stock);
  const projectedStock = currentStock + Math.trunc(n(adjustment));
  const varianceItems = useMemo(() => (selectedSession?.items || []).filter((item) => item.counted_qty !== null && item.counted_qty !== undefined && n(item.variance) !== 0), [selectedSession]);

  async function load() {
    setLoading(true); setError("");
    try {
      const session = await getStaffSession();
      setStaff(session.staff);
      const staffState = session.staff;
      const branch = String(staffState?.defaultBranchId || "");
      const calls: Promise<any>[] = [operationsRequest<Row[]>(`inventory/movements?limit=50${branch ? `&branch_id=${encodeURIComponent(branch)}` : ""}`)];
      if (staffState?.permissions?.["cycle-counts"] || staffState?.permissions?.warehouse || staffState?.permissions?.inventory) {
        calls.push(operationsRequest<Row[]>(`warehouse/bins${branch ? `?branch_id=${encodeURIComponent(branch)}` : ""}`).catch(() => []));
      } else calls.push(Promise.resolve([]));
      if (staffState?.permissions?.["cycle-counts"]) calls.push(operationsRequest<CountSession[]>(`warehouse/cycle-counts${branch ? `?branch_id=${encodeURIComponent(branch)}` : ""}`).catch(() => []));
      else calls.push(Promise.resolve([]));
      const [movementPayload, binRows, countRows] = await Promise.all(calls);
      const adjustmentRows = Array.isArray(movementPayload?.adjustments) ? movementPayload.adjustments : [];
      const transferRows = Array.isArray(movementPayload?.transfers) ? movementPayload.transfers.map((row: Row) => ({ ...row, type: "transfer", quantity_change: n(row.quantity_received || row.quantity_requested), reference: row.transfer_number, reason: `${row.from_branch_name || "Source"} → ${row.to_branch_name || "Destination"}` })) : [];
      setMovements([...adjustmentRows, ...transferRows].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 50));
      setBins(Array.isArray(binRows) ? binRows : []);
      setSessions(Array.isArray(countRows) ? countRows : []);
      if (!productId && products.length) setProductId(String(products[0].id));
    } catch (cause) { setError((cause as OperationsApiError).message || "Inventory controls could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!productId && products.length) setProductId(String(products[0].id)); }, [products, productId]);

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!selectedProduct || !canAdjust || busy) return;
    const delta = Math.trunc(n(adjustment));
    if (!delta) return setError("Enter a non-zero whole-number adjustment.");
    if (projectedStock < 0) return setError("This adjustment would reduce branch stock below zero.");
    const auditReason = `${reason}${reasonDetail.trim() ? ` — ${reasonDetail.trim()}` : ""}`;
    setBusy("adjust"); setError(""); setNotice("");
    try {
      await operationsRequest(`inventory/${encodeURIComponent(String(selectedProduct.id))}/stock`, { method: "PATCH", body: JSON.stringify({ adjustment: delta, branch_id: branchId || null, reason: auditReason }) });
      setNotice(`${selectedProduct.name || selectedProduct.sku} adjusted by ${delta > 0 ? "+" : ""}${delta}. Audit reason recorded.`);
      setAdjustment(""); setReasonDetail(""); onInventoryRefresh?.(); await load();
    } catch (cause) { setError((cause as OperationsApiError).message || "Stock adjustment failed."); }
    finally { setBusy(""); }
  }

  async function createCount(event: FormEvent) {
    event.preventDefault(); if (!canCount || busy) return;
    if (countScope === "bin" && !countBinId) return setError("Choose a bin for a bin-scoped cycle count.");
    setBusy("create-count"); setError(""); setNotice("");
    try {
      const created = await operationsRequest<CountSession>("warehouse/cycle-counts", { method: "POST", body: JSON.stringify({ branch_id: branchId || null, employee_id: staff?.employeeId || null, scope_type: countScope, scope_id: countScope === "bin" ? countBinId : null, notes: countNotes || null }) });
      setCountNotes(""); setNotice(`Cycle count ${created.session_number || created.id} created from live expected stock.`); await load(); await openCount(created.id);
    } catch (cause) { setError((cause as OperationsApiError).message || "Cycle count could not be created."); }
    finally { setBusy(""); }
  }

  async function openCount(id: string | number) {
    setBusy("open-count"); setError("");
    try {
      const detail = await operationsRequest<CountSession>(`warehouse/cycle-counts/${encodeURIComponent(String(id))}`);
      setSelectedSession(detail);
      const next: Record<string, string> = {};
      for (const item of detail.items || []) if (item.counted_qty !== null && item.counted_qty !== undefined) next[String(item.id)] = String(item.counted_qty);
      setCounts(next);
    } catch (cause) { setError((cause as OperationsApiError).message || "Cycle count detail could not be loaded."); }
    finally { setBusy(""); }
  }

  async function saveCounts() {
    if (!selectedSession || busy) return;
    const items = (selectedSession.items || []).flatMap((item) => {
      const value = counts[String(item.id)];
      if (value === undefined || value === "") return [];
      return [{ item_id: item.id, counted_qty: Math.max(0, Math.floor(n(value))) }];
    });
    if (!items.length) return setError("Enter at least one counted quantity.");
    setBusy("save-count"); setError(""); setNotice("");
    try {
      const updated = await operationsRequest<CountSession>(`warehouse/cycle-counts/${encodeURIComponent(String(selectedSession.id))}/import`, { method: "POST", body: JSON.stringify({ items }) });
      setSelectedSession(updated); setNotice(`Counted quantities saved. ${n(updated.variance_count || (updated.items || []).filter((i: Row) => n(i.variance) !== 0).length)} variance(s) require review.`); await load();
    } catch (cause) { setError((cause as OperationsApiError).message || "Counted quantities could not be saved."); }
    finally { setBusy(""); }
  }

  async function commitCount() {
    if (!selectedSession || String(selectedSession.status) === "committed" || busy) return;
    if (!window.confirm(`Commit ${selectedSession.session_number || "this cycle count"}? Variances will post to inventory and the stock-movement audit ledger.`)) return;
    setBusy("commit-count"); setError(""); setNotice("");
    try {
      await operationsRequest(`warehouse/cycle-counts/${encodeURIComponent(String(selectedSession.id))}/commit`, { method: "PATCH", body: JSON.stringify({}) });
      setNotice(`${selectedSession.session_number || "Cycle count"} committed. Inventory variances are now part of the stock ledger.`); setSelectedSession(null); onInventoryRefresh?.(); await load();
    } catch (cause) { setError((cause as OperationsApiError).message || "Cycle count could not be committed."); }
    finally { setBusy(""); }
  }

  return <section className="sc-inventory-integrity" data-guide-id="inventory-integrity-workspace">
    <div className="sc-inventory-integrity__head"><div><ShieldCheck size={20}/><div><strong>Inventory integrity</strong><span>Controlled adjustments, physical counts, bin evidence and movement audit.</span></div></div><button onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {error ? <div className="sc-inventory-integrity__alert is-error"><AlertTriangle size={16}/>{error}</div> : null}
    {notice ? <div className="sc-inventory-integrity__alert is-success"><CheckCircle2 size={16}/>{notice}</div> : null}
    {loading ? <div className="sc-ops-empty"><Loader2 className="sc-ops-spin" size={20}/><strong>Loading inventory controls…</strong></div> : <>
      <div className="sc-inventory-integrity__grid">
        <form className="sc-inventory-adjust" onSubmit={submitAdjustment}>
          <header><SlidersHorizontal size={18}/><div><strong>Controlled stock adjustment</strong><span>Every manual change requires an audit reason.</span></div></header>
          <label><span>Product</span><select value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.sku ? `${p.sku} — ` : ""}{p.name}</option>)}</select></label>
          <div className="sc-inventory-adjust__stock"><div><span>Current branch stock</span><strong>{currentStock}</strong></div><div><span>Projected stock</span><strong className={projectedStock < 0 ? "is-danger" : ""}>{projectedStock}</strong></div></div>
          <label><span>Adjustment (+ / −)</span><input type="number" step="1" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="Example: -2"/></label>
          <label><span>Reason</span><select value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Reason detail</span><textarea rows={3} value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} placeholder="Reference damage report, count sheet, receiving discrepancy, etc."/></label>
          <button className="sc-button sc-button--primary" disabled={!canAdjust || !adjustment || projectedStock < 0 || busy === "adjust"}>{busy === "adjust" ? <Loader2 className="sc-ops-spin" size={15}/> : <Save size={15}/>}Post adjustment</button>
          {!canAdjust ? <small>Your security group can view inventory but cannot post manual stock adjustments.</small> : null}
        </form>

        <div className="sc-inventory-bins"><header><MapPin size={18}/><div><strong>Storage bins</strong><span>{branchId ? staff?.defaultBranchName || `Branch ${branchId}` : "All accessible locations"}</span></div></header>{bins.length ? <div>{bins.slice(0, 40).map((bin) => <article key={String(bin.id)}><div><strong>{bin.bin_code || `Bin ${bin.id}`}</strong><span>{bin.zone_name || bin.description || "Unzoned"}</span></div><div><small>Assignments</small><strong>{n(bin.assignment_count)}</strong></div></article>)}</div> : <div className="sc-ops-empty"><Boxes size={18}/><strong>No bins returned</strong><p>This location may not use configured storage bins.</p></div>}</div>
      </div>

      {canCount ? <section className="sc-cycle-counts"><header><ClipboardCheck size={19}/><div><strong>Cycle counts</strong><span>Freeze an expected-stock snapshot, count physically, review variances, then commit.</span></div></header>
        <form className="sc-cycle-counts__new" onSubmit={createCount}><label><span>Scope</span><select value={countScope} onChange={(e) => setCountScope(e.target.value as "all"|"bin")}><option value="all">Entire branch</option><option value="bin">Single bin</option></select></label>{countScope === "bin" ? <label><span>Bin</span><select value={countBinId} onChange={(e) => setCountBinId(e.target.value)}><option value="">Select bin</option>{bins.map((bin) => <option key={String(bin.id)} value={String(bin.id)}>{bin.bin_code} {bin.zone_name ? `— ${bin.zone_name}` : ""}</option>)}</select></label> : null}<label className="is-wide"><span>Count notes</span><input value={countNotes} onChange={(e) => setCountNotes(e.target.value)} placeholder="Reason, counter, aisle or scheduled count reference"/></label><button className="sc-button sc-button--secondary" disabled={busy === "create-count"}>{busy === "create-count" ? "Creating…" : "Start count"}</button></form>
        <div className="sc-cycle-counts__sessions">{sessions.length ? sessions.slice(0, 25).map((session) => <button key={String(session.id)} onClick={() => void openCount(session.id)} className={String(selectedSession?.id) === String(session.id) ? "is-active" : ""}><div><strong>{session.session_number || `Count ${session.id}`}</strong><span>{pretty(session.status)} · {pretty(session.scope_type)}</span></div><div><small>{n(session.counted_count)}/{n(session.item_count)} counted</small><em>{n(session.variance_count)} variance</em></div></button>) : <div className="sc-ops-empty"><strong>No cycle counts yet</strong><p>Start a branch or bin count when physical verification is needed.</p></div>}</div>
        {selectedSession ? <div className="sc-cycle-counts__detail"><div className="sc-cycle-counts__detail-head"><div><strong>{selectedSession.session_number || `Count ${selectedSession.id}`}</strong><span>{pretty(selectedSession.status)} · {selectedSession.branch_name || staff?.defaultBranchName || "Branch"}</span></div><button onClick={() => setSelectedSession(null)}>Close</button></div><div className="sc-cycle-counts__items"><div className="sc-cycle-counts__row is-head"><span>Product</span><span>Bin</span><span>Expected</span><span>Counted</span><span>Variance</span></div>{(selectedSession.items || []).map((item) => { const entered = counts[String(item.id)]; const counted = entered === undefined || entered === "" ? item.counted_qty : Math.max(0, Math.floor(n(entered))); const variance = counted === null || counted === undefined ? null : n(counted) - n(item.expected_qty); return <div className="sc-cycle-counts__row" key={String(item.id)}><div><strong>{item.product_name}</strong><small>{item.sku}</small></div><span>{item.bin_code || "—"}</span><strong>{n(item.expected_qty)}</strong><input type="number" min="0" step="1" disabled={String(selectedSession.status) === "committed"} value={entered ?? (item.counted_qty ?? "")} onChange={(e) => setCounts((current) => ({ ...current, [String(item.id)]: e.target.value }))}/><em className={variance === null || variance === 0 ? "is-ok" : "is-var"}>{variance === null ? "—" : variance > 0 ? `+${variance}` : variance}</em></div>})}</div><div className="sc-cycle-counts__footer"><div><span>Current variance lines</span><strong>{varianceItems.length}</strong></div>{String(selectedSession.status) !== "committed" ? <><button className="sc-button sc-button--secondary" onClick={() => void saveCounts()} disabled={busy === "save-count"}>{busy === "save-count" ? "Saving…" : "Save counts"}</button><button className="sc-button sc-button--primary" onClick={() => void commitCount()} disabled={busy === "commit-count"}>{busy === "commit-count" ? "Committing…" : "Commit variances"}</button></> : <span className="sc-cycle-counts__committed"><CheckCircle2 size={15}/>Committed</span>}</div></div> : null}
      </section> : <div className="sc-inventory-integrity__locked"><ClipboardCheck size={18}/><div><strong>Cycle counts restricted</strong><span>Your security group does not include the POS `cycle-counts` permission.</span></div></div>}

      <section className="sc-stock-audit"><header><RefreshCw size={18}/><div><strong>Recent stock movement audit</strong><span>Manual adjustments and inter-branch movement returned by the source POS.</span></div></header>{movements.length ? <div>{movements.map((row, index) => <article key={String(row.id ?? index)}><div><strong>{row.product_name || row.sku || "Inventory item"}</strong><span>{row.sku || ""} {row.branch_name ? `· ${row.branch_name}` : ""}</span></div><div><em className={n(row.quantity_change) < 0 ? "is-out" : "is-in"}>{n(row.quantity_change) > 0 ? "+" : ""}{n(row.quantity_change)}</em><span>{pretty(row.type)}</span></div><div><strong>{row.reference || "—"}</strong><span>{row.reason || "No detail"}</span></div><time>{row.created_at ? new Date(row.created_at).toLocaleString() : ""}</time></article>)}</div> : <div className="sc-ops-empty"><strong>No stock movements returned</strong><p>Adjustments and transfers will appear here when recorded.</p></div>}</section>
    </>}
  </section>;
}
