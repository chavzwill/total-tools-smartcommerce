import { departments } from "../data/products";

const visibleDepartments = departments.slice(0, 7);

export default function DepartmentGrid() {
  return (
    <section className="category-section" id="commercial" aria-labelledby="category-heading">
      <div className="section-intro split-intro">
        <div><span>Shop by category</span><h2 id="category-heading">Built around real work.</h2></div>
        <a href="#products">View all products {"->"}</a>
      </div>
      <div className="category-grid">
        {visibleDepartments.map((department, index) => (
          <a href="#products" className={`category-card category-${index + 1}`} key={department}>
            <span>{department}</span><small>Explore category {"->"}</small>
          </a>
        ))}
      </div>
    </section>
  );
}
