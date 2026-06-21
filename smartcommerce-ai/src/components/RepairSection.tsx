import { repairs } from "../data/repairs";

export default function RepairSection() {
  return (
    <section className="section repair-section" id="repairs">
      <div className="section-heading">
        <span className="eyebrow">Tool repairs</span>
        <h2>Schedule a repair before the job slips</h2>
      </div>
      <div className="repair-layout">
        <form className="repair-form">
          <label>
            Tool type
            <select defaultValue="Cordless drill">
              <option>Cordless drill</option>
              <option>Circular saw</option>
              <option>Generator</option>
              <option>Other trade tool</option>
            </select>
          </label>
          <label>
            Issue description
            <textarea defaultValue="My drill is not working and needs repair." rows={4} />
          </label>
          <label>
            Preferred date
            <input type="date" defaultValue="2026-06-25" />
          </label>
          <div className="upload-box">Upload photo placeholder</div>
          <button className="primary-button" type="button">Schedule repair</button>
        </form>
        <div className="repair-list">
          {repairs.map((repair) => (
            <article key={repair.id}>
              <h3>{repair.toolType}</h3>
              <p>From ${repair.startingPrice} | {repair.turnaround}</p>
              <ul>
                {repair.commonIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
