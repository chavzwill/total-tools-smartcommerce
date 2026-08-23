import { Loader2, MapPin, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { getCourierCollectionPoints, type CourierCollectionPoint } from "../../services/courierCollectionPointClient";

export default function CourierCollectionPointPicker({
  serviceId,
  selectedId,
  onSelect,
}: {
  serviceId: string;
  selectedId: string;
  onSelect: (id: string, point?: CourierCollectionPoint) => void;
}) {
  const [points, setPoints] = useState<CourierCollectionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setPoints([]);
    setError("");
    onSelect("");
    if (!serviceId) return () => { active = false; };
    setLoading(true);
    getCourierCollectionPoints(serviceId)
      .then((next) => { if (active) setPoints(next); })
      .catch((err: any) => { if (active) setError(err?.message || "Collection points could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [serviceId]);

  const selected = points.find((point) => point.id === selectedId);

  return <div className="sc-collection-point-picker">
    <div className="sc-collection-point-picker__head">
      <Store size={18} />
      <div><strong>Choose where you’ll collect</strong><span>This is a provider branch service, not door-to-door delivery.</span></div>
    </div>
    {loading ? <div className="sc-fulfilment__status"><Loader2 size={17} className="sc-spin" /><span>Loading verified courier locations…</span></div> : null}
    {error ? <div className="sc-fulfilment__manual"><strong>Collection points unavailable.</strong><span>{error}</span></div> : null}
    {!loading && !error ? <label>Courier branch
      <select value={selectedId} onChange={(event) => {
        const id = event.target.value;
        onSelect(id, points.find((point) => point.id === id));
      }}>
        <option value="">Choose a collection point</option>
        {points.map((point) => <option key={point.id} value={point.id}>{point.name} · {point.town}, {point.parish}</option>)}
      </select>
    </label> : null}
    {selected ? <div className="sc-collection-point-picker__selected"><MapPin size={16} /><div><strong>{selected.name}</strong><span>{selected.address}</span></div></div> : null}
  </div>;
}
