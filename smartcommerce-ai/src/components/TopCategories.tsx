const categories = [
  { name: "Power Tools", code: "PT", className: "cat-power" },
  { name: "Generators", code: "GN", className: "cat-generator" },
  { name: "Electrical", code: "EL", className: "cat-electrical" },
  { name: "Concrete", code: "CN", className: "cat-concrete" },
  { name: "Safety", code: "SF", className: "cat-safety" },
  { name: "Cleaning", code: "CL", className: "cat-cleaning" }
];

export default function TopCategories() {
  return (
    <section className="top-categories" id="categories" aria-labelledby="categories-title">
      <div className="section-intro compact-intro"><span>Top categories</span><h2 id="categories-title">Start with the work.</h2></div>
      <div className="top-category-grid">
        {categories.map((category) => (
          <a className={`top-category-card ${category.className}`} href="#products" key={category.name}>
            <div className="category-photo" aria-hidden="true" />
            <div className="category-copy"><span className="category-icon" aria-hidden="true">{category.code}</span><h3>{category.name}</h3><small>View category {"->"}</small></div>
          </a>
        ))}
      </div>
    </section>
  );
}
