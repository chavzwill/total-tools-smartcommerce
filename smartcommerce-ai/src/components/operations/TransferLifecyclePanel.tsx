import { ArrowRightLeft, Loader2, PackageCheck, RefreshCw, Send, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { operationsRequest, type OperationsApiError } from "../../lib/staffOperations";
import "../../styles/transfer-lifecycle.css";

type Row = Record<string, any>;
type Props = { employeeId?: string };

type DraftLine = { product_id: string; sku: string; product_name: string; quantity: number; available: number };

function n(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function label(value: unknown) { return String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

export default function TransferLifecyclePanel({ employeeId }: Props) {
  const [transfers, setTransfers] = useState<Row[]>([]);
  const [branches, setBranches] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [products, setProducts] = useState<Row[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [receive, setReceive] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [transferRows, branchRows] = await Promise.all([
        operationsRequest<Row[]>("transfers?limit=200"),
        operationsRequest<Row[]>("branches"),
      ]);
      setTransfers(Array.isArray(transferRows) ? transferRows : []);
      setBranches(Array.isArray(branchRows) ? branchRows : []);
    } catch (e) { setError((e as OperationsApiError).message || "Transfers could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!fromBranch) { setProducts([]); setProductId(""); return; }
    void operationsRequest<Row[]>(`inventory?branch_id=${encodeURIComponent(fromBranch)}&active=1&is_service=0&is_rental=0&is_non_inventory=0`)
      .then((rows) => { setProducts(Array.isArray(rows) ? rows.filter((r) => n(r.stock_qty) > 0) : []); setProductId(""); })
      .catch(() => { setProducts([]); setProductId(""); });
  }, [fromBranch]);

  async function openTransfer(id: string) {
    setSelectedId(id); setError(""); setMessage("");
    try {
      const detail = await operationsRequest<Row>(`transfers/${encodeURIComponent(id)}`);
      setSelected(detail);
      const next: Record<string, number> = {};
      for (const item of Array.isArray(detail.items) ? detail.items : []) {
        next[String(item.id)] = Math.max(0, n(item.quantity_requested) - n(item.quantity_received));
      }
      setReceive(next);
    } catch (e) { setError((e as OperationsApiError).message || "Transfer detail could not be loaded."); }
  }

  const chosen = products.find((row) => String(row.id) === productId);
  const maxAvailable = Math.max(0, n(chosen?.stock_qty));
  const draftLine: DraftLine | null = chosen ? {
    product_id: String(chosen.id), sku: String(chosen.sku || ""), product_name: String(chosen.name || "Inventory item"),
    quantity: Math.max(1, Math.min(Math.floor(quantity), Math.floor(maxAvailable))), available: maxAvailable,
  } : null;

  async function createTransfer() {
    if (!draftLine || !fromBranch || !toBranch || fromBranch === toBranch || draftLine.quantity <= 0) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const created = await operationsRequest<Row>("transfers", {
        method: "POST",
        body: JSON.stringify({
          from_branch_id: fromBranch, to_branch_id: toBranch, employee_id: employeeId || null,
          items: [{ product_id: draftLine.product_id, quantity: draftLine.quantity }],
          notes: notes.trim() || "Created from Total Tools Operations transfer execution workspace",
        }),
      });
      setMessage(`Transfer ${created.transfer_number || created.id} created. Source stock is now reserved by the POS.`);
      setNotes(""); setProductId(""); setQuantity(1); await load();
      if (created.id) await openTransfer(String(created.id));
    } catch (e) { setError((e as OperationsApiError).message || "Transfer could not be created."); }
    finally { setWorking(false); }
  }

  async function act(path: string, body?: unknown, success?: string) {
    if (!selected) return;
    setWorking(true); setError(""); setMessage("");
    try {
      await operationsRequest<Row>(`transfers/${encodeURIComponent(String(selected.id))}/${path}`, {
        method: "PATCH", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      setMessage(success || "Transfer updated.");
      await load(); await openTransfer(String(selected.id));
    } catch (e) { setError((e as OperationsApiError).message || "Transfer could not be updated."); }
    finally { setWorking(false); }
  }

  async function receiveItems() {
    if (!selected) return;
    const items = (Array.isArray(selected.items) ? selected.items : []).map((item: Row) => {
      const remaining = Math.max(0, n(item.quantity_requested) - n(item.quantity_received));
      return { item_id: item.id, quantity_received: Math.max(0, Math.min(Math.floor(n(receive[String(item.id)])), remaining)) };
    }).filter((item: Row) => n(item.quantity_received) > 0);
    if (!items.length) { setError("Enter at least one quantity received."); return; }
    await act("receive", { items }, "Receipt recorded against the transfer.");
  }

  const openCount = useMemo(() => transfers.filter((row) => ["pending", "in_transit"].includes(String(row.status))).length, [transfers]);
  const transitCount = useMemo(() => transfers.filter((row) => String(row.status) === "in_transit").length, [transfers]);

  return <section className="sc-transfer-life" data-guide-id="transfer-execution">
    <div className="sc-transfer-life__header">
      <div><span>Transfer execution</span><h3>Move stock through the controlled POS lifecycle</h3><p>Creating a transfer immediately reserves stock at the source. Review the source, destination and quantity before committing.</p></div>
      <button onClick={() => void load()} disabled={loading || working}><RefreshCw size={15}/>{loading ? "Loading…" : "Refresh"}</button>
    </div>

    <div className="sc-transfer-life__metrics">
      <article><ArrowRightLeft size={17}/><span>Open transfers</span><strong>{openCount}</strong></article>
      <article><Send size={17}/><span>In transit</span><strong>{transitCount}</strong></article>
      <article><PackageCheck size={17}/><span>Transfer history</span><strong>{transfers.length}</strong></article>
    </div>

    {error ? <div className="sc-transfer-life__notice is-error">{error}</div> : null}
    {message ? <div className="sc-transfer-life__notice is-success">{message}</div> : null}

    <div className="sc-transfer-life__grid">
      <article className="sc-transfer-life__card">
        <div className="sc-transfer-life__title"><strong>Create reviewed transfer</strong><small>This is the human approval boundary for ERP recommendations.</small></div>
        <div className="sc-transfer-life__form">
          <label>Source branch<select value={fromBranch} onChange={(e)=>setFromBranch(e.target.value)}><option value="">Select source</option>{branches.map((b)=><option key={String(b.id)} value={String(b.id)}>{b.name || `Branch ${b.id}`}</option>)}</select></label>
          <label>Destination branch<select value={toBranch} onChange={(e)=>setToBranch(e.target.value)}><option value="">Select destination</option>{branches.filter((b)=>String(b.id)!==fromBranch).map((b)=><option key={String(b.id)} value={String(b.id)}>{b.name || `Branch ${b.id}`}</option>)}</select></label>
          <label className="is-wide">Product<select value={productId} onChange={(e)=>setProductId(e.target.value)} disabled={!fromBranch}><option value="">Select source inventory</option>{products.map((p)=><option key={String(p.id)} value={String(p.id)}>{p.sku || "—"} · {p.name} · {n(p.stock_qty)} available</option>)}</select></label>
          <label>Quantity<input type="number" min={1} max={Math.max(1, Math.floor(maxAvailable))} value={quantity} onChange={(e)=>setQuantity(Math.max(1, Math.floor(n(e.target.value))))}/></label>
          <label className="is-wide">Notes<textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Reason / ERP recommendation context" /></label>
        </div>
        {draftLine ? <div className="sc-transfer-life__review"><strong>Review before creating</strong><span>{draftLine.sku} · {draftLine.product_name}</span><span>{draftLine.quantity} units will leave source availability immediately.</span><span>Source currently has {draftLine.available} units.</span></div> : null}
        <button className="sc-button sc-button--primary" data-guide-id="create-transfer" onClick={()=>void createTransfer()} disabled={working || !draftLine || !fromBranch || !toBranch || fromBranch===toBranch || draftLine.quantity>maxAvailable}>{working?<Loader2 className="sc-ops-spin" size={16}/>:<ArrowRightLeft size={16}/>}Create transfer</button>
      </article>

      <article className="sc-transfer-life__card">
        <div className="sc-transfer-life__title"><strong>Transfer lifecycle</strong><small>Dispatch, partial/full receipt and cancellation.</small></div>
        <label>Transfer<select value={selectedId} onChange={(e)=>{ const id=e.target.value; setSelectedId(id); if(id) void openTransfer(id); else setSelected(null); }}><option value="">Select transfer</option>{transfers.map((t)=><option key={String(t.id)} value={String(t.id)}>{t.transfer_number || `TRF ${t.id}`} · {t.from_branch_name || "Source"} → {t.to_branch_name || "Destination"} · {label(t.status)}</option>)}</select></label>
        {selected ? <div className="sc-transfer-life__detail">
          <div className="sc-transfer-life__status"><strong>{selected.transfer_number || `Transfer ${selected.id}`}</strong><em className={`is-${String(selected.status)}`}>{label(selected.status)}</em></div>
          <p>{selected.from_branch_name || "Source"} → {selected.to_branch_name || "Destination"}</p>
          <div className="sc-transfer-life__items">{(Array.isArray(selected.items)?selected.items:[]).map((item:Row)=>{const remaining=Math.max(0,n(item.quantity_requested)-n(item.quantity_received));return <div key={String(item.id)}><span><strong>{item.sku || "—"}</strong>{item.product_name || "Inventory item"}</span><small>{n(item.quantity_received)} / {n(item.quantity_requested)} received · {remaining} remaining</small>{!["received","cancelled"].includes(String(selected.status))&&remaining>0?<input aria-label={`Receive ${item.sku || item.product_name}`} type="number" min={0} max={remaining} value={receive[String(item.id)] ?? remaining} onChange={(e)=>setReceive((current)=>({...current,[String(item.id)]:Math.max(0,Math.min(Math.floor(n(e.target.value)),remaining))}))}/>:null}</div>})}</div>
          <div className="sc-transfer-life__actions">
            {String(selected.status)==="pending"?<button onClick={()=>void act("dispatch", undefined, "Transfer marked in transit.")} disabled={working}><Send size={15}/>Dispatch</button>:null}
            {!["received","cancelled"].includes(String(selected.status))?<button onClick={()=>void receiveItems()} disabled={working}><PackageCheck size={15}/>Record receipt</button>:null}
            {!["received","cancelled"].includes(String(selected.status))?<button className="is-danger" onClick={()=>void act("cancel", undefined, "Transfer cancelled; unreceived stock restored to source.")} disabled={working}><XCircle size={15}/>Cancel remainder</button>:null}
          </div>
        </div> : <div className="sc-transfer-life__empty">Select a transfer to manage its execution.</div>}
      </article>
    </div>
  </section>;
}
