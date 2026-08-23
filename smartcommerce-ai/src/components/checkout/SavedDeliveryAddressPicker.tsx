import { Check, Loader2, MapPin, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CheckoutDeliveryAddress } from "../../services/checkoutFulfilmentClient";
import {
  deleteDeliveryAddress,
  listSavedDeliveryAddresses,
  saveDeliveryAddress,
  setDefaultDeliveryAddress,
  type SavedDeliveryAddress,
} from "../../services/customerAddressClient";
import "../../styles/saved-delivery-addresses.css";

export default function SavedDeliveryAddressPicker({
  value,
  onSelect,
}: {
  value: CheckoutDeliveryAddress;
  onSelect: (address: CheckoutDeliveryAddress) => void;
}) {
  const [addresses, setAddresses] = useState<SavedDeliveryAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await listSavedDeliveryAddresses();
      setAddresses(result.addresses || []);
    } catch (err: any) {
      if (err?.status !== 401) setError(err?.message || "Saved addresses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const selectedId = useMemo(() => {
    const match = addresses.find((address) =>
      address.line1 === value.line1 && address.city === value.city && address.region === value.region && address.recipientName === value.recipientName
    );
    return match?.id || "";
  }, [addresses, value]);

  async function saveCurrent() {
    if (!value.recipientName.trim() || !value.phone.trim() || !value.line1.trim() || !value.city.trim() || !value.region.trim()) return;
    setBusyId("save");
    setError("");
    try {
      const result = await saveDeliveryAddress({ ...value, label: label.trim() || undefined, isDefault: addresses.length === 0 });
      setAddresses((current) => [result.address, ...current.filter((item) => item.id !== result.address.id)]);
      setLabel("");
    } catch (err: any) {
      setError(err?.message || "This address could not be saved.");
    } finally {
      setBusyId("");
    }
  }

  async function makeDefault(id: string) {
    setBusyId(id);
    setError("");
    try {
      const result = await setDefaultDeliveryAddress(id);
      setAddresses((current) => current.map((item) => ({ ...item, isDefault: item.id === result.address.id })));
    } catch (err: any) {
      setError(err?.message || "The default address could not be changed.");
    } finally {
      setBusyId("");
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError("");
    try {
      await deleteDeliveryAddress(id);
      setAddresses((current) => current.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err?.message || "The address could not be removed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="sc-saved-addresses">
      <div className="sc-saved-addresses__head">
        <div><strong>Saved destinations</strong><span>Home, business and job-site addresses stay attached to your account.</span></div>
        {loading ? <Loader2 size={17} className="sc-spin" /> : null}
      </div>

      {addresses.length ? <div className="sc-saved-addresses__list">
        {addresses.map((address) => (
          <div key={address.id} className={`sc-saved-address ${selectedId === address.id ? "is-selected" : ""}`}>
            <button type="button" className="sc-saved-address__select" onClick={() => onSelect({
              label: address.label,
              type: address.type,
              siteName: address.siteName,
              recipientName: address.recipientName,
              phone: address.phone,
              line1: address.line1,
              line2: address.line2,
              city: address.city,
              region: address.region,
              postalCode: address.postalCode,
              countryCode: "JM",
              notes: address.notes,
            })}>
              <MapPin size={17} />
              <span><strong>{address.label || address.siteName || `${address.city}, ${address.region}`}</strong><small>{address.line1} · {address.city}, {address.region}</small><em>{address.zoneStatus === "resolved" ? `Courier zone verified · ${address.zoneClass}` : "Courier zone requires review"}</em></span>
              {selectedId === address.id ? <Check size={17} /> : null}
            </button>
            <div className="sc-saved-address__actions">
              <button type="button" disabled={busyId === address.id || address.isDefault} onClick={() => void makeDefault(address.id)} title="Make default"><Star size={14} /> {address.isDefault ? "Default" : "Make default"}</button>
              <button type="button" disabled={busyId === address.id} onClick={() => void remove(address.id)} title="Remove saved address"><Trash2 size={14} /> Remove</button>
            </div>
          </div>
        ))}
      </div> : !loading ? <p className="sc-saved-addresses__empty">No saved delivery destinations yet.</p> : null}

      <div className="sc-saved-addresses__save">
        <input value={label} onChange={(event) => setLabel(event.target.value.slice(0, 80))} placeholder="Label this address (Home, Office, Site A…)" />
        <button type="button" onClick={() => void saveCurrent()} disabled={busyId === "save" || !value.recipientName.trim() || !value.phone.trim() || !value.line1.trim() || !value.city.trim() || !value.region.trim()}>
          {busyId === "save" ? <Loader2 size={15} className="sc-spin" /> : <Plus size={15} />} Save current address
        </button>
      </div>
      {error ? <p className="sc-saved-addresses__error" role="alert">{error}</p> : null}
    </div>
  );
}
