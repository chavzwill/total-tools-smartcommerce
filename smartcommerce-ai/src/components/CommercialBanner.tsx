const services = ["Business accounts", "Fleet rentals", "Bulk purchasing", "Commercial support"];

export default function CommercialBanner() {
  return (
    <section className="commercial-banner" id="commercial-accounts">
      <div><span>For business</span><h2>One partner for every job site.</h2><p>Bring products, rentals, repairs, and purchasing support into one commercial relationship.</p><a className="button button-gold" href="#footer">Talk to our commercial team {"->"}</a></div>
      <ul>{services.map((service) => <li key={service}>{service}</li>)}</ul>
    </section>
  );
}
