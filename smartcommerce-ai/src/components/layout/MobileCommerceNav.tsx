import { Bot, Home, HardHat, ShoppingBag, ShoppingCart, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { getRoute, routeHref } from "../../lib/router";

const items = [
  { label: "Home", href: "/", icon: Home, featured: false },
  { label: "Shop", href: "/products", icon: ShoppingBag, featured: false },
  { label: "Ask AI", href: "/assistant", icon: Bot, featured: true },
  { label: "Rentals", href: "/rentals", icon: HardHat, featured: false },
  { label: "Account", href: "/account", icon: UserRound, featured: false },
  { label: "Cart", href: "/cart", icon: ShoppingCart, featured: false },
] as const;

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/products") return path === "/products" || path.startsWith("/product/") || path.startsWith("/category/") || path.startsWith("/search");
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
    <nav className="sc-mobile-commerce-nav" aria-label="Primary mobile navigation">
      {items.map(({ label, href, icon: Icon, featured }) => {
        const active = isActive(path, href);
        return (
          <a
            href={routeHref(href)}
            key={label}
            className={`${active ? "is-active" : ""} ${featured ? "is-featured" : ""}`.trim()}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="sc-mobile-commerce-nav__icon"><Icon size={featured ? 22 : 20} aria-hidden="true" /></span>
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
