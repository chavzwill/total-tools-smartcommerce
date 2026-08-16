import { Bot, Home, HardHat, ShoppingBag, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { getRoute, go, routeHref } from "../../lib/router";

const items = [
  ["Home", "/", Home],
  ["Shop", "/products", ShoppingBag],
  ["Ask AI", "/assistant", Bot],
  ["Rentals", "/rentals", HardHat],
  ["Cart", "/cart", ShoppingCart],
] as const;

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/products") {
    return path === "/products" || path.startsWith("/product/") || path.startsWith("/category/") || path.startsWith("/search");
  }
  return path.startsWith(href);
}

export default function MobileCommerceNav() {
  const [path, setPath] = useState(() => getRoute().path);

  useEffect(() => {
    const sync = () => setPath(getRoute().path);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <nav className="sc-mobile-commerce-nav" aria-label="Mobile commerce navigation">
      {items.map(([label, href, Icon], index) => {
        const active = isActive(path, href);
        return (
          <a
            href={routeHref(href)}
            key={label}
            className={`${active ? "is-active" : ""} ${index === 2 ? "is-featured" : ""}`.trim()}
            aria-current={active ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              go(href);
            }}
          >
            <Icon size={index === 2 ? 23 : 20} aria-hidden="true" />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
