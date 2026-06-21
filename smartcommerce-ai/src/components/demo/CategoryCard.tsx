import { ArrowRight } from "lucide-react";
import { routeHref } from "../../lib/router";
import { slugify } from "../../lib/format";
import type { Category } from "../../types";

export default function CategoryCard({ category }: { category: Category }) {
  return (
    <article className="demo-category-card">
      <img src={category.image} alt={`${category.name} department`} />
      <div className="demo-category-card__shade" />
      <div className="demo-category-card__content">
        <span className="demo-category-icon">{category.icon}</span>
        <h3>{category.name}</h3>
        <p>{category.description}</p>
        <a href={routeHref(`/category/${slugify(category.name)}`)}>Browse <ArrowRight size={16} /></a>
      </div>
    </article>
  );
}
