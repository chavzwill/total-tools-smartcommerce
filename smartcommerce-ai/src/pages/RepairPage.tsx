import { CheckCircle2, ImageUp, Loader2, Wrench } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import repairsImage from "../assets/services/repairs-service.jpg";
import { getRepairTypes, submitRepairRequestToPlatform } from "../data/repairs";
import { routeHref } from "../lib/router";
import { company } from "../styles/theme";

const getInitialEquipment = () => {
  const raw = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(raw).get("equipment") || "";
};

export default function RepairPage() {
  const [repairs, setRepairs] = useState(() => getRepairTypes());
  const [equipment, setEquipment] = useState(getInitialEquipment);
  const [model, setModel] = useState("");
  const [issue, setIssue] = useState("");
  const [branch, setBranch] = useState("");
  const [date, setDate] = useState("");
  const [contact, setContact] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = (event: Event) => setRepairs((event as CustomEvent).detail || getRepairTypes());
    window.addEventListener("smartcommerce:repairs-changed", sync);
    return () => window.removeEventListener("smartcommerce:repairs-changed", sync);
  }, []);

  const issueHints = useMemo(() => repairs.find((item) => item.toolType === equipment)?.commonIssues || [], [equipment, repairs]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");

    const preferredDate = date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
    const notes = [
      branch ? `Preferred branch: ${branch}` : "",
      contact ? `Customer contact: ${contact}` : "",
      photos.length ? `${photos.length} photo(s) selected; provider file-upload transfer is not configured in this frontend flow.` : "",
    ].filter(Boolean).join("\n");

    const result = await submitRepairRequestToPlatform({
      equipmentName: equipment,
      serialNumber: model || undefined,
      issueDescription: issue,
      preferredDate,
      customerNotes: notes || undefined,
    });

    if (!result.success) {
      setStatus("error");
      setMessage(result.error.message);
      return;
    }

    setStatus("success");
    setMessage(`Repair request ${result.data.id} was accepted by the connected provider with status “${result.data.status}”.`);
  }

  return (
    <div className="demo-page sc-repair-page">
      <section className="demo-page-hero sc-repair-page__hero">
        <Container>
          <span>Repairs & service</span>
          <h1>Tell us what the equipment is doing. Start from there.</h1>
          <p>Identify the equipment, describe the problem, add useful context, and submit to the connected service provider when repair writes are available.</p>
          <div className="demo-repair-tools">
            <a href="#repair-form">Start repair request</a>
            <a href={routeHref("/account")}>Repair history</a>
            <a href={routeHref("/assistant?prompt=Help%20me%20describe%20an%20equipment%20fault")}>Ask SmartCommerce</a>
            <a href={routeHref("/commercial?mode=maintenance")}>Commercial maintenance enquiry</a>
          </div>
        </Container>
      </section>
      <Container className="demo-service-layout sc-repair-page__layout">
        <div className="demo-service-photo">
          <img src={repairsImage} alt="Technician servicing professional equipment" />
          <div><Wrench size={24} /><strong>One repair starting point</strong><span>Equipment · issue · photos · preferred branch · provider status</span></div>
        </div>
        <form id="repair-form" className="demo-flow-form sc-repair-form" onSubmit={submit}>
          <span className="sc-flow-kicker">Repair intake</span>
          <h2>Start a repair request</h2>
          <label>Equipment type
            <input list="repair-equipment-options" required value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Eg. Pressure washer" />
            <datalist id="repair-equipment-options">{repairs.map((repair) => <option key={repair.id} value={repair.toolType} />)}</datalist>
          </label>
          <label>Model or serial number <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Optional if unknown" /></label>
          <label>Describe the issue<textarea required value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="What happens when you try to use it? Include sounds, leaks, warning lights, or loss of performance." /></label>
          {issueHints.length ? <div className="sc-repair-hints"><span>Common issue prompts</span>{issueHints.map((hint) => <button type="button" key={hint} onClick={() => setIssue(hint)}>{hint}</button>)}</div> : null}
          <label>Photos
            <span className="demo-file-input"><ImageUp size={20} /> Add equipment or model-plate photos<input type="file" accept="image/*" multiple onChange={(event) => setPhotos(Array.from(event.target.files || []))} /></span>
            <small>{photos.length ? `${photos.length} selected. ` : ""}Photo transport still requires a provider upload capability; the form does not pretend they were uploaded.</small>
          </label>
          <label>Preferred branch<select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">No preference</option>{company.branches.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.address}</option>)}</select></label>
          <label>Preferred date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Phone or email<input required value={contact} onChange={(event) => setContact(event.target.value)} placeholder="How should the service team contact you?" /></label>
          <button type="submit" disabled={status === "submitting"}>{status === "submitting" ? <><Loader2 size={17} /> Submitting…</> : "Submit repair request"}</button>
          {status === "error" ? <p className="sc-flow-status is-error" role="status">Request not submitted: {message}</p> : null}
          {status === "success" ? <p className="sc-flow-status is-success" role="status"><CheckCircle2 size={16} /> {message}</p> : null}
        </form>
      </Container>
    </div>
  );
}
