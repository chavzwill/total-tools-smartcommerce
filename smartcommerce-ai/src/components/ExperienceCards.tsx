const experiences = [
  { className: "experience-products", title: "Products", text: "Shop thousands of professional tools with smarter recommendations.", cta: "Browse Products", href: "#products" },
  { className: "experience-rentals", title: "Rentals", text: "Find available equipment and reserve it in minutes.", cta: "Browse Rentals", href: "#rentals" },
  { className: "experience-repairs", title: "Repairs", text: "Upload photos, book an inspection, and keep work moving.", cta: "Book Repair", href: "#repairs" }
];

export default function ExperienceCards() {
  return (
    <section className="experience-section" aria-labelledby="experience-title">
      <div className="section-intro"><span>Choose your next move</span><h2 id="experience-title">What are you trying to do?</h2></div>
      <div className="experience-grid">
        {experiences.map((experience) => (
          <a className={`experience-card ${experience.className}`} href={experience.href} key={experience.title}>
            <div className="experience-image" aria-hidden="true" />
            <div><h3>{experience.title}</h3><p>{experience.text}</p><strong>{experience.cta} {"->"}</strong></div>
          </a>
        ))}
      </div>
    </section>
  );
}
