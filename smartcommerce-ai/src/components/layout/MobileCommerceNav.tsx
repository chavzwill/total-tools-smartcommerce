import { Bot, Home, HardHat, ShoppingBag, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { getRoute, go, routeHref } from "../../lib/router";

const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";
const SHOPPING_BRANCH_CHANGED_EVENT = "smartcommerce:shopping-branch-changed";

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

function readShoppingBranch() {
  try {
    const value = window.localStorage.getItem(SHOPPING_BRANCH_KEY) || "Online";
    return ["Ocho Rios", "Drax Hall", "Kingston", "Online"].includes(value) ? value : "Online";
  } catch {
    return "Online";
  }
}

function contextualHref(href: string, branch: string) {
  if (branch === "Online" || (href !== "/products" && href !== "/rentals")) return href;
  return `${href}?branch=${encodeURIComponent(branch)}`;
}

export default function MobileCommerceNav() {
  const [path, setPath] = useState(() => getRoute().path);
  const [branch, setBranch] = useState(readShoppingBranch);

  useEffect(() => {
    const sync = () => setPath(getRoute().path);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    const syncBranch = () => setBranch(readShoppingBranch());
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
