import { CheckCircle2, Loader2, MapPin, Sparkles, Wrench } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { getRepairTypes, submitRepairRequestToPlatform } from "../data/repairs";
import { routeHref } from "../lib/router";
import { company } from "../styles/theme";

const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";

const getInitialEquipment = () => {
  const raw = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(raw).get("equipment") || "";
};

const getInitialBranch = () => {
  try {
    const value = window.localStorage.getItem(SHOPPING_BRANCH_KEY) || "";
    return company.branches.some((item) => item.name === value) ? value : "";
  } catch {
    return "";
  }
};

export default function RepairPage() {
  const [repairs, setRepairs] = useState(() => getRepairTypes());
  const [equipment, setEquipment] = useState(getInitialEquipment);
  const [model, setModel] = useState("");
  const [issue, setIssue] = useState("");
  const [branch, setBranch] = useState(getInitialBranch);
  const [date, setDate] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = (event: Event) => setRepairs((event as CustomEvent).detail || getRepairTypes());
    window.addEventListener("smartcommerce:repairs-changed", sync);
    return () => window.removeEventListener("smartcommerce:repairs-changed", sync);
  }, []);

  const issueHints = useMemo(() => repairs.find((item) => item.toolType === equipment)?.commonIssues || [], [equipment, repairs]);
  const selectedBranch = company.branches.find((item) => item.name === branch);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");

    const preferredDate = date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
    const notes = [
      branch ? `Preferred branch: ${branch}` : "",
      contact ? `Customer contact: ${contact}` : "",
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
    setMessage(`Repair request ${result.data.id} was accepted with status “${result.data.status}”.`);
  }

  return (
    <div className="demo-page sc-repair-page sc-repair-next">
      <Container className="sc-repair-next__container">
        <section className="sc-repair-next__intro">
          <span><Wrench size={15} /> Repairs & service</span>
          <h1>Tell us what’s wrong. We’ll start from there.</h1>
          <p>Identify the equipment, describe the symptom, choose where you want it handled, and send the request to the service team.</p>
          <div className="sc-repair-next__quick-actions">
            <a href={routeHref("/assistant?prompt=Help%20me%20describe%20an%20equipment%20fault")}><Sparkles size={16} /> Help me diagnose it</a>
            <a href={routeHref("/commercial?mode=maintenance")}>Commercial maintenance</a>
          </div>
        </section>

        <div className="sc-repair-next__workspace">
          <form id="repair-form" className="demo-flow-form sc-repair-form sc-repair-next__form" onSubmit={submit}>
            <div className="sc-repair-next__step">
              <span>1</span>
              <div><strong>What are we repairing?</strong><small>Equipment and model information</small></div>
            </div>
            <label>Equipment type
              <input list="repair-equipment-options" required value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Eg. Pressure washer" />
              <datalist id="repair-equipment-options">{repairs.map((repair) => <option key={repair.id} value={repair.toolType} />)}</datalist>
            </label>
            <label>Model or serial number <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Optional if unknown" /></label>

            <div className="sc-repair-next__step">
              <span>2</span>
              <div><strong>What is it doing?</strong><small>Describe the fault in your own words</small></div>
            </div>
            <label>Describe the issue<textarea required value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="For example: starts, loses pressure after a minute, then makes a rattling sound." /></label>
            {issueHints.length ? <div className="sc-repair-hints"><span>Common symptoms for this equipment</span>{issueHints.map((hint) => <button type="button" key={hint} onClick={() => setIssue(hint)}>{hint}</button>)}</div> : null}
            <p className="sc-flow-note">Photo attachments will appear here only after the connected service provider supports file transfer. SmartCommerce will not ask you to select files that it cannot submit.</p>

            <div className="sc-repair-next__step">
              <span>3</span>
              <div><strong>Where and how should we contact you?</strong><small>Service location and follow-up</small></div>
            </div>
            <label>Preferred branch<select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">No preference</option>{company.branches.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.address}</option>)}</select></label>
            <label>Preferred date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>Phone or email<input required value={contact} onChange={(event) => setContact(event.target.value)} placeholder="How should the service team contact you?" /></label>

            <button type="submit" disabled={status === "submitting"}>{status === "submitting" ? <><Loader2 size={17} /> Sending request…</> : "Send repair request"}</button>
            {status === "error" ? <p className="sc-flow-status is-error" role="status">Request not submitted: {message}</p> : null}
            {status === "success" ? <p className="sc-flow-status is-success" role="status"><CheckCircle2 size={16} /> {message}</p> : null}
          </form>

          <aside className="sc-repair-next__support" aria-label="Repair support">
            <div className="sc-repair-next__support-card">
              <MapPin size={20} />
              <span>Service location</span>
              <strong>{selectedBranch?.name || "Choose any Total Tools branch"}</strong>
              <p>{selectedBranch?.address || "Select a preferred branch in the form. Final intake instructions are confirmed by the service team."}</p>
            </div>
            <div className="sc-repair-next__support-card">
              <Sparkles size={20} />
              <span>Not sure how to explain the fault?</span>
              <strong>Describe what happens, not what you think failed.</strong>
              <p>SmartCommerce can help turn sounds, leaks, warning lights, and performance changes into a useful service description.</p>
              <a href={routeHref(`/assistant?prompt=${encodeURIComponent(equipment ? `Help me diagnose a problem with my ${equipment}` : "Help me describe an equipment fault")}`)}>Ask SmartCommerce</a>
            </div>
            <div className="sc-repair-next__support-card">
              <CheckCircle2 size={20} />
              <span>What happens next</span>
              <strong>The request goes to the connected service workflow.</strong>
              <p>No fake booking or repair completion is shown. The service team confirms the next step after the request is accepted.</p>
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
