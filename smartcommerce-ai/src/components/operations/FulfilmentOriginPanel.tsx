import { CheckCircle2, Loader2, MapPinned, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { getFulfilmentOrigin, updateFulfilmentOrigin, type FulfilmentOrigin } from "../../services/fulfilmentOriginClient";
import "../../styles/fulfilment-origin.css";

const emptyDraft = { branchId: "", branchName: "", town: "", parish: "", addressLine1: "" };

export default function FulfilmentOriginPanel() {
  const [origin, setOrigin] = useState<FulfilmentOrigin | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await getFulfilmentOrigin();
      setOrigin(result.origin);
      setCanUpdate(result.canUpdate);
      setDraft({
        branchId: result.origin.branchId || "",
        branchName: result.origin.branchName || "",
        town: result.origin.town || "",
        parish: result.origin.parish || "",
        addressLine1: result.origin.addressLine1 || "",
      });
    } catch (err: any) {
      setError(err?.message || "Dispatch origin could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!canUpdate || saving || !draft.town.trim() || !draft.parish.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await updateFulfilmentOrigin({
        branchId: draft.branchId.trim() || undefined,
        branchName: draft.branchName.trim() || undefined,
        town: draft.town.trim(),
        parish: draft.parish.trim(),
        addressLine1: draft.addressLine1.trim() || undefined,
      });
      setOrigin(result.origin);
      setCanUpdate(result.canUpdate);
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "Dispatch origin could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="sc-fulfilment-origin-panel">
    <div className="sc-fulfilment-origin-panel__head">
      <div><span><MapPinned size={17} /> Ecommerce dispatch origin</span><strong>{origin?.active ? (origin.branchName || `${origin.town}, ${origin.parish}`) : "Not configured"}</strong><small>This origin controls Round Town and same-day eligibility. Checkout uses the same setting when it binds the final delivery charge.</small></div>
      {loading ? <Loader2 size={19} className="sc-spin" /> : origin?.active ? <CheckCircle2 size={19} /> : <ShieldAlert size={19} />}
    </div>

    {!loading ? <div className="sc-fulfilment-origin-panel__form">
      <label>Branch / location name<input value={draft.branchName} onChange={(event) => setDraft((current) => ({ ...current, branchName: event.target.value }))} placeholder="Eg. Spanish Town Road branch" disabled={!canUpdate} /></label>
      <label>Branch ID <span>(optional)</span><input value={draft.branchId} onChange={(event) => setDraft((current) => ({ ...current, branchId: event.target.value }))} placeholder="Provider or POS branch ID" disabled={!canUpdate} /></label>
      <label>Town / city<input value={draft.town} onChange={(event) => setDraft((current) => ({ ...current, town: event.target.value }))} placeholder="Kingston" disabled={!canUpdate} /></label>
      <label>Parish<input value={draft.parish} onChange={(event) => setDraft((current) => ({ ...current, parish: event.target.value }))} placeholder="Kingston" disabled={!canUpdate} /></label>
      <label className="is-wide">Dispatch address <span>(optional)</span><input value={draft.addressLine1} onChange={(event) => setDraft((current) => ({ ...current, addressLine1: event.target.value }))} placeholder="Operational pickup/dispatch address" disabled={!canUpdate} /></label>
    </div> : null}

    {origin?.source === "environment" ? <p className="sc-fulfilment-origin-panel__note">The current origin comes from environment configuration. Saving here promotes it to the durable operational setting.</p> : null}
    {!origin?.active && !loading ? <p className="sc-fulfilment-origin-panel__warning">Until an origin is configured, SmartCommerce deliberately withholds Round Town and same-day pricing.</p> : null}
    {!canUpdate && !loading ? <p className="sc-fulfilment-origin-panel__note">Your staff role can view the dispatch origin but cannot change it.</p> : null}
    {error ? <p className="sc-delivery-review-error" role="alert">{error}</p> : null}
    {saved ? <p className="sc-fulfilment-origin-panel__success">Dispatch origin saved. New delivery quotes will use this origin immediately.</p> : null}
    {canUpdate && !loading ? <button type="button" onClick={() => void save()} disabled={saving || !draft.town.trim() || !draft.parish.trim()}>{saving ? <><Loader2 size={16} className="sc-spin" /> Saving origin…</> : "Save dispatch origin"}</button> : null}
  </section>;
}
