import { Bot, Camera, Grid3X3, Search, Sparkles } from "lucide-react";
import { routeHref } from "../../lib/router";
import Container from "../shared/Container";

const paths = [
  ["Find a product", "Search by name, model, specification, or SKU.", "/products", Search],
  ["Browse categories", "Start with a department when you know the item type.", "/categories", Grid3X3],
  ["Describe the job", "Tell SmartCommerce what you are trying to accomplish.", "/assistant?prompt=Help%20me%20choose%20what%20I%20need%20for%20this%20job", Sparkles],
  ["Find from a photo", "Use an image when you do not know the product name.", "/product-match", Camera],
  ["Ask SmartCommerce", "Get guided product, rental, repair, or commercial next steps.", "/assistant", Bot],
] as const;

export default function IntentDiscovery() {
  return (
    <section className="sc-intent-discovery" aria-labelledby="sc-intent-discovery-title">
      <Container size="wide">
        <div className="sc-intent-discovery__heading">
          <span>Find it faster</span>
          <h2 id="sc-intent-discovery-title">Start With the Job.</h2>
          <p>Search directly, browse a category, describe the work, use a photo, or ask SmartCommerce.</p>
        </div>
        <div className="sc-intent-discovery__grid">
          {paths.map(([title, description, href, Icon]) => (
            <a href={routeHref(href)} key={title}>
              <Icon size={22} aria-hidden="true" />
              <strong>{title}</strong>
              <span>{description}</span>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}
