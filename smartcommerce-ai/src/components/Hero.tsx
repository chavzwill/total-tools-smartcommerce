import AIAdvisor from "./AIAdvisor";

const promises = ["Islandwide delivery", "Trusted warranty", "Commercial accounts", "Trusted brands"];

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="hero-kicker">Intelligent commerce, built for the work</span>
        <h1>Find it.<br />Rent it.<br />Repair it.<br /><em>Ask AI.</em></h1>
        <p>One intelligent storefront for products, visual matching, equipment rental, and repairs. Guided by expertise, not endless searching.</p>
        <div className="hero-actions">
          <a className="button button-primary" href="#advisor">Ask AI Advisor <span>{"->"}</span></a>
          <a className="button button-secondary" href="#image-search">Snap a Picture</a>
        </div>
        <div className="promise-row" aria-label="Service promises">
          {promises.map((promise) => <span key={promise}>{promise}</span>)}
        </div>
      </div>
      <AIAdvisor variant="hero" />
    </section>
  );
}
