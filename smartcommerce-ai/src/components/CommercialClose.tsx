import mascot from "../assets/brand/mascot-3d.jpeg";

const benefits = ["Fleet rentals", "Bulk purchasing", "Commercial pricing", "Dedicated account managers", "Business credit"];

export default function CommercialClose() {
  return (
    <section className="commercial-close" id="commercial">
      <div className="commercial-copy"><span>Built for business</span><h2>One Partner For Every Job.</h2><p>Products, equipment, repairs, and purchasing support for Jamaica's working businesses.</p><a className="button button-gold" href="#footer">Talk To Commercial Team {"->"}</a></div>
      <ul>{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
      <img src={mascot} alt="Total Tools commercial account expert in construction safety gear" loading="lazy" />
    </section>
  );
}
