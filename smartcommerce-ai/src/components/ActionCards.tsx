const features = [
  { className: "feature-shop", eyebrow: "Explore the range", title: "Shop Products", text: "The right tools and supplies, surfaced around the job you need to do.", cta: "Shop intelligently", href: "#products" },
  { className: "feature-image", eyebrow: "Visual product matching", title: "Image Search", text: "Upload the part in your hand and move from uncertainty to a confident match.", cta: "Try image search", href: "#image-search" },
  { className: "feature-rental", eyebrow: "Only when you need it", title: "Equipment Rentals", text: "Find available equipment, compare rates, and reserve around your schedule.", cta: "Browse rentals", href: "#rentals" },
  { className: "feature-repair", eyebrow: "Keep work moving", title: "Repair Booking", text: "Describe the issue, choose a date, and start a clear service journey.", cta: "Book a repair", href: "#repairs" }
];

export default function ActionCards() {
  return (
    <section className="feature-section" aria-labelledby="feature-heading">
      <div className="section-intro"><span>One connected experience</span><h2 id="feature-heading">Everything the customer needs.<br />Nothing they do not.</h2></div>
      <div className="feature-grid">
        {features.map((feature) => (
          <a className={`feature-card ${feature.className}`} href={feature.href} key={feature.title}>
            <div className="feature-image" aria-hidden="true" />
            <div className="feature-content"><small>{feature.eyebrow}</small><h3>{feature.title}</h3><p>{feature.text}</p><strong>{feature.cta} {"->"}</strong></div>
          </a>
        ))}
      </div>
    </section>
  );
}
