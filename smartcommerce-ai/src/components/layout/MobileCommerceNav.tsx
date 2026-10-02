import { Bot, Home, HardHat, ShoppingBag, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { getRoute, go, routeHref } from "../../lib/router";
import {
  SHOPPING_BRANCH_CHANGED_EVENT,
  branchAwareHref,
  getShoppingBranch,
  type ShoppingBranch,
} from "../../lib/shoppingBranch";

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
    return path === "/products" || path === "/parts" || path.startsWith("/product/") || path.startsWith("/category/") || path.startsWith("/search");
  }
  return path.startsWith(href);
}

function contextualHref(href: string, branch: ShoppingBranch) {
  if (href !== "/products" && href !== "/rentals") return href;
  return branchAwareHref(href, branch);
}

export default function MobileCommerceNav() {
  const [path, setPath] = useState(() => getRoute().path);
  const [branch, setBranch] = useState<ShoppingBranch>(() => getShoppingBranch());

  useEffect(() => {
    const sync = () => setPath(getRoute().path);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    const syncBranch = () => setBranch(getShoppingBranch());
    window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch);
    return () => window.removeEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch);
  }, []);

  return (
    <nav className="sc-mobile-commerce-nav" aria-label="Mobile commerce navigation">
      {items.map(([label, href, Icon], index) => {
        const active = isActive(path, href);
        const destination = contextualHref(href, branch);
        return (
          <a
            href={routeHref(destination)}
            key={label}
            className={`${active ? "is-active" : ""} ${index === 2 ? "is-featured" : ""}`.trim()}
            aria-current={active ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              go(destination);
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
