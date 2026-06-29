import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  HelpCircle,
  MapPin,
  PackagePlus,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import Container from "../components/shared/Container";

type RentalProductDetailPageProps = {
  productId?: string;
};

const branchAvailability = [
  { branch: "Kingston", status: "Available now", quantity: "3 units" },
  { branch: "Ocho Rios", status: "Available tomorrow", quantity: "1 unit" },
  { branch: "Drax Hall", status: "Maintenance check", quantity: "Pending" },
];

const rateRows = [
  { label: "Daily", value: "From POS" },
  { label: "Weekly", value: "From POS" },
  { label: "Monthly", value: "From POS" },
  { label: "Deposit", value: "From POS" },
];

const specRows = [
  ["Equipment class", "From POS"],
  ["Model", "From POS"],
  ["Power / Fuel", "From POS"],
  ["Operating weight", "From POS"],
  ["Dimensions", "From POS"],
  ["Capacity", "From POS"],
  ["Required PPE", "From POS"],
];

const transportOptions = [
  {
    title: "Branch pickup",
    text: "Customer must have a suitable vehicle and must secure equipment safely before leaving the branch.",
    icon: Truck,
  },
  {
    title: "Trailer required",
    text: "Some equipment may require a trailer, hitch compatibility, and confirmed towing capacity.",
    icon: PackagePlus,
  },
  {
    title: "Islandwide delivery",
    text: "Provide site access, delivery window, contact details, and special instructions before dispatch.",
    icon: MapPin,
  },
];

const recommendedItems = [
  "Safety helmet",
  "Work gloves",
  "Extension cord",
  "Fuel container",
  "Operator support",
];

export default function RentalProductDetailPage({
  productId,
}: RentalProductDetailPageProps) {
  return (
    <main className="rental-workspace-page">
      <Container className="rental-workspace">
        <nav className="rental-workspace__breadcrumbs">
          <a href="/rentals">Rentals</a>
          <span>/</span>
          <a href="/rentals">Equipment</a>
          <span>/</span>
          <span>{productId || "Rental item"}</span>
        </nav>

        <section className="rental-workspace__hero">
          <div className="rental-workspace__media-card">
            <div className="rental-workspace__image-placeholder">
              Product image from POS
            </div>

            <div className="rental-workspace__media-actions">
              <button type="button">
                <Sparkles size={18} />
                Ask if this fits my job
              </button>
              <button type="button">
                <FileText size={18} />
                View rental agreement
              </button>
            </div>
          </div>

          <div className="rental-workspace__summary">
            <span className="rental-workspace__eyebrow">
              Total Tools Rentals
            </span>

            <h1>Rental equipment workspace</h1>

            <p>
              Check live availability, compare rates, choose pickup or delivery,
              add accessories, and reserve equipment with AI guidance.
            </p>

            <div className="rental-workspace__quick-status">
              <div>
                <CheckCircle2 />
                <strong>Live availability</strong>
                <span>Ready for POS connection</span>
              </div>

              <div>
                <CalendarDays />
                <strong>Date based pricing</strong>
                <span>Daily, weekly, monthly</span>
              </div>

              <div>
                <Truck />
                <strong>Delivery or pickup</strong>
                <span>Islandwide support</span>
              </div>
            </div>

            <form
              className="rental-workspace__booking-panel"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="rental-workspace__booking-grid">
                <label>
                  Start date
                  <input type="date" />
                </label>

                <label>
                  End date
                  <input type="date" />
                </label>

                <label>
                  Pickup or delivery
                  <select defaultValue="">
                    <option value="" disabled>
                      Choose option
                    </option>
                    <option>Ocho Rios pickup</option>
                    <option>Kingston pickup</option>
                    <option>Drax Hall pickup</option>
                    <option>Islandwide delivery</option>
                  </select>
                </label>

                <label>
                  Damage waiver
                  <select defaultValue="review">
                    <option value="review">Review options</option>
                    <option value="add">Add damage waiver</option>
                    <option value="decline">Decline waiver</option>
                  </select>
                </label>
              </div>

              <button type="submit">
                <CalendarDays size={18} />
                Check availability and reserve
              </button>
            </form>
          </div>
        </section>

        <section className="rental-workspace__section rental-workspace__ai">
          <div>
            <span>AI Rental Advisor</span>
            <h2>Tell us the job. We’ll help choose the right equipment.</h2>
            <p>
              Customers should be able to describe the work they are doing and
              get equipment, accessories, delivery, and safety recommendations.
            </p>
          </div>

          <div className="rental-workspace__ai-box">
            <Sparkles />
            <strong>Example</strong>
            <p>
              “I need to pour a driveway.” The AI recommends mixer, vibrator,
              wheelbarrow, PPE, delivery, and cleanup tools.
            </p>
            <button type="button">Ask AI</button>
          </div>
        </section>

        <section className="rental-workspace__grid-section">
          <div className="rental-workspace__section">
            <h2>Live branch availability</h2>
            <div className="rental-workspace__availability-list">
              {branchAvailability.map((item) => (
                <div key={item.branch}>
                  <strong>{item.branch}</strong>
                  <span>{item.status}</span>
                  <em>{item.quantity}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="rental-workspace__section">
            <h2>Rental rates</h2>
            <div className="rental-workspace__rate-list">
              {rateRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rental-workspace__section">
          <h2>Rental estimate</h2>
          <div className="rental-workspace__estimate">
            <div>
              <span>Equipment rental</span>
              <strong>Calculated from POS</strong>
            </div>
            <div>
              <span>Delivery / pickup</span>
              <strong>Calculated by location</strong>
            </div>
            <div>
              <span>Damage waiver</span>
              <strong>Optional</strong>
            </div>
            <div>
              <span>Accessories</span>
              <strong>AI recommended</strong>
            </div>
            <div className="rental-workspace__estimate-total">
              <span>Estimated total</span>
              <strong>Available after dates</strong>
            </div>
          </div>
        </section>

        <section className="rental-workspace__section">
          <h2>Product description</h2>
          <p>
            This section should be populated by the POS. It should explain the
            equipment use case, best applications, limitations, safety notes,
            and common customer questions.
          </p>
        </section>

        <section className="rental-workspace__section">
          <h2>Product specifications</h2>
          <div className="rental-workspace__spec-table">
            {specRows.map(([label, value]) => (
              <div key={label}>
                <strong>{label}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rental-workspace__section">
          <h2>Transportation guide</h2>
          <div className="rental-workspace__transport-grid">
            {transportOptions.map((option) => {
              const Icon = option.icon;
              return (
                <div key={option.title}>
                  <Icon />
                  <h3>{option.title}</h3>
                  <p>{option.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rental-workspace__section">
          <h2>Recommended accessories</h2>
          <div className="rental-workspace__accessories">
            {recommendedItems.map((item) => (
              <button type="button" key={item}>
                <PackagePlus size={16} />
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="rental-workspace__section rental-workspace__support">
          <div>
            <HelpCircle />
            <h2>Still unsure if this equipment is right?</h2>
            <p>
              Ask AI or contact the rentals team before reserving. The platform
              should guide customers toward the safest and most suitable option.
            </p>
          </div>

          <div className="rental-workspace__support-actions">
            <button type="button">Ask AI</button>
            <button type="button">Contact rentals</button>
          </div>
        </section>

        <section className="rental-workspace__section rental-workspace__staff-note">
          <h2>Internal future capability</h2>
          <div>
            <Clock3 />
            <p>
              Maintenance history, return inspection, damage reports, and fleet
              service notes should be visible to staff through the POS/admin
              view, not exposed publicly unless approved.
            </p>
          </div>
        </section>
      </Container>
    </main>
  );
}