import { rentals } from "../data/rentals";

export default function RentalSection() {
  return (
    <section className="section rental-section" id="rentals">
      <div className="section-heading">
        <span className="eyebrow">Equipment rental</span>
        <h2>Reserve the right machine for the next job</h2>
      </div>
      <div className="rental-grid">
        {rentals.map((rental) => (
          <article className="rental-card" key={rental.id}>
            <div className="product-image">{rental.image}</div>
            <div>
              <span className="badge">{rental.category}</span>
              <h3>{rental.name}</h3>
              <p>{rental.availability}</p>
              <div className="rates">
                <strong>${rental.dailyRate}/day</strong>
                <strong>${rental.weeklyRate}/week</strong>
              </div>
              <button className="primary-button">Reserve rental</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
