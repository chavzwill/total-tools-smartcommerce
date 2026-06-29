import HeroExperience from "../components/HeroExperience";
import PrimaryActions from "../components/home/PrimaryActions";
import CommerceSections from "../components/home/CommerceSections";
import Container from "../components/shared/Container";
import { getCategories } from "../data/products";
import { slugify } from "../lib/format";
import { routeHref } from "../lib/router";

type Props = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

export default function HomePage(props: Props) {
  const categories = getCategories();
  return (
    <div className="demo-home demo-home--focused">
      <HeroExperience />
      <PrimaryActions />
      <section className="home-categories" aria-labelledby="home-categories-title">
        <Container size="wide">
          <div className="home-categories__heading"><div><span>Shop by category</span><h2 id="home-categories-title">Go straight to what you need.</h2></div><a href={routeHref("/categories")}>View all categories</a></div>
          <div className="home-category-links">{categories.map((category) => <a href={routeHref(`/category/${slugify(category.name)}`)} key={category.name}><b>{category.icon}</b><span>{category.name}<small>{category.description}</small></span></a>)}</div>
        </Container>
      </section>
      <CommerceSections {...props} />
    </div>
  );
}
