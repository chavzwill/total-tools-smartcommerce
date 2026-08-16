import {
  Bot,
  Camera,
  ChevronDown,
  Compass,
  MapPin,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import logo from "../../assets/brand/total-tools-logo-transparent.png";
import { getCategories } from "../../data/products";
import { slugify } from "../../lib/format";
import { getRoute, go, routeHref } from "../../lib/router";
import {
  CUSTOMER_ACCOUNT_CHANGED_EVENT,
  getCustomerAccount,
  type CustomerAccount,
  type CustomerAccountState,
} from "../../lib/customerAccount";
import Container from "../shared/Container";

const GUEST_CART_KEY = "smartcommerce_guest_cart_v1";
const GUEST_CART_CHANGED_EVENT = "smartcommerce:guest-cart-changed";
export const SHOPPING_BRANCH_KEY = "smartcommerce_shopping_branch_v1";
export const SHOPPING_BRANCH_CHANGED_EVENT = "smartcommerce:shopping-branch-changed";
export const SHOPPING_BRANCHES = ["Ocho Rios", "Drax Hall", "Kingston", "Online"] as const;
type ShoppingBranch = (typeof SHOPPING_BRANCHES)[number];

const navigation = [
  { label: "Products", href: "/products", match: ["/products", "/product/", "/category/", "/categories", "/search", "/compare"] },
  { label: "Rentals", href: "/rentals", match: ["/rentals", "/rental/"] },
  { label: "Repairs", href: "/repairs", match: ["/repairs", "/repair-"] },
  { label: "Commercial", href: "/commercial", match: ["/commercial"] },
  { label: "Deals", href: "/deals", match: ["/deals"] },
];

const exploreLinks = [
  { title: "All products", description: "Search the complete product experience", href: "/products", icon: ShoppingBag },
  { title: "Rentals", description: "Plan equipment by job, date, and branch", href: "/rentals", icon: Compass },
  { title: "Repairs", description: "Start a repair or service request", href: "/repairs", icon: Bot },
  { title: "Commercial", description: "Business, contractor, and quote support", href: "/commercial", icon: ShoppingCart },
  { title: "SmartCommerce AI", description: "Describe the job and get guided help", href: "/assistant", icon: Sparkles },
  { title: "Photo match", description: "Find an item when you do not know its name", href: "/product-match", icon: Camera },
] as const;

const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];

function customerLabel(customer: CustomerAccount | null) {
  if (!customer) return "Sign in";
  const firstName = customer.fullName.trim().split(/\s+/)[0];
  return firstName || "Account";
}

function isActive(path: string, matches: string[]) {
  return matches.some((candidate) => path === candidate || path.startsWith(candidate));
}

function initialGuestCartCount() {
  try {
    const items = JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) || "[]");
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
      const quantity = Number(item?.quantity || 0);
      return sum + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
  } catch {
    return 0;
  }
}

function initialShoppingBranch(): ShoppingBranch {
  try {
    const stored = window.localStorage.getItem(SHOPPING_BRANCH_KEY) as ShoppingBranch | null;
    return stored && SHOPPING_BRANCHES.includes(stored) ? stored : "Online";
  } catch {
    return "Online";
  }
}

export default function Header() {
  const [search, setSearch] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [path, setPath] = useState(() => getRoute().path);
  const [guestCartCount, setGuestCartCount] = useState(initialGuestCartCount);
  const [branch, setBranch] = useState<ShoppingBranch>(initialShoppingBranch);
  const [branchOpen, setBranchOpen] = useState(false);
  const launcherInputRef = useRef<HTMLInputElement>(null);
  const launcherTriggerRef = useRef<HTMLButtonElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  const launcherItems = useMemo(() => {
    const categoryLinks = getCategories().slice(0, 12).map((category) => ({
      title: category.name,
      description: category.description || "Product category",
      href: `/category/${slugify(category.name)}`,
      icon: Search,
    }));
    return [...exploreLinks, ...categoryLinks];
  }, []);

  const filteredLauncherItems = useMemo(() => {
    const query = launcherQuery.trim().toLowerCase();
    if (!query) return launcherItems;
    return launcherItems.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query));
  }, [launcherItems, launcherQuery]);

  useEffect(() => {
    const syncPath = () => setPath(getRoute().path);
    window.addEventListener("hashchange", syncPath);
    return () => window.removeEventListener("hashchange", syncPath);
  }, []);

  useEffect(() => {
    const syncCart = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count || 0);
      setGuestCartCount(Number.isInteger(count) && count > 0 ? count : 0);
    };
    window.addEventListener(GUEST_CART_CHANGED_EVENT, syncCart);
    return () => window.removeEventListener(GUEST_CART_CHANGED_EVENT, syncCart);
  }, []);

  useEffect(() => {
    const closeBranch = (event: PointerEvent) => {
      if (!branchRef.current?.contains(event.target as Node)) setBranchOpen(false);
    };
    document.addEventListener("pointerdown", closeBranch);
    return () => document.removeEventListener("pointerdown", closeBranch);
  }, []);

  useEffect(() => {
    let active = true;
    getCustomerAccount().then((state) => { if (active) setCustomer(state.customer); }).catch(() => { if (active) setCustomer(null); });
    const syncCustomer = (event: Event) => {
      const detail = (event as CustomEvent<CustomerAccountState>).detail;
      setCustomer(detail?.customer || null);
    };
    window.addEventListener(CUSTOMER_ACCOUNT_CHANGED_EVENT, syncCustomer);
    return () => { active = false; window.removeEventListener(CUSTOMER_ACCOUNT_CHANGED_EVENT, syncCustomer); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setLauncherOpen(true); }
      if (event.key === "Escape" && launcherOpen) { setLauncherOpen(false); launcherTriggerRef.current?.focus(); }
      if (event.key === "Escape" && branchOpen) setBranchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launcherOpen, branchOpen]);

  useEffect(() => {
    if (!launcherOpen) { setLauncherQuery(""); document.body.style.overflow = ""; return; }
    document.body.style.overflow = "hidden";
    window.setTimeout(() => launcherInputRef.current?.focus(), 0);
    return () => { document.body.style.overflow = ""; };
  }, [launcherOpen]);

  function chooseBranch(next: ShoppingBranch) {
    setBranch(next);
    setBranchOpen(false);
    window.localStorage.setItem(SHOPPING_BRANCH_KEY, next);
    window.dispatchEvent(new CustomEvent(SHOPPING_BRANCH_CHANGED_EVENT, { detail: { branch: next } }));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = search.trim();
    const normalized = value.toLowerCase();
    const branchQuery = branch === "Online" ? "" : `&branch=${encodeURIComponent(branch)}`;
    if (!value) return go(branch === "Online" ? "/products" : `/products?branch=${encodeURIComponent(branch)}`);
    if (matchTerms.some((term) => normalized.includes(term))) return go("/product-match");
    if (normalized.includes("repair")) return go(`/repairs?equipment=${encodeURIComponent(value)}`);
    if (normalized.includes("rental") || normalized.startsWith("rent ")) return go(`/rentals?q=${encodeURIComponent(value)}${branchQuery}`);
    go(`/search?q=${encodeURIComponent(value)}${branchQuery}`);
  }

  function askAI() { go(`/assistant?prompt=${encodeURIComponent(search.trim() || `Help me shop for this job${branch === "Online" ? "" : ` at ${branch}`}`)}`); }
  const closeLauncher = () => { setLauncherOpen(false); launcherTriggerRef.current?.focus(); };
  const accountLabel = customerLabel(customer);

  return (
    <header className="v2-header">
      <Container size="wide" className="v2-header__primary">
        <div className="v2-branch-selector" ref={branchRef}>
          <button type="button" className="v2-branch-selector__trigger" onClick={() => setBranchOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={branchOpen} aria-label={`Shopping from ${branch}. Change branch`}>
            <Store size={19} aria-hidden="true" />
            <span><small>Shopping from</small><strong>{branch}</strong></span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {branchOpen ? (
            <div className="v2-branch-selector__menu" role="listbox" aria-label="Choose shopping branch">
              <span>Shop inventory from</span>
              {SHOPPING_BRANCHES.map((option) => (
                <button key={option} type="button" role="option" aria-selected={option === branch} className={option === branch ? "is-selected" : ""} onClick={() => chooseBranch(option)}>
                  <span>{option}</span>{option === branch ? <strong>Current</strong> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <a className="v2-brand" href={routeHref("/")} aria-label="Total Tools Jamaica home"><img src={logo} alt="Total Tools Jamaica" width="900" height="249" /></a>
        <nav className="v2-header__nav" aria-label="Primary commerce navigation">
          {navigation.map((item) => {
            const active = isActive(path, item.match);
            return <a key={item.href} href={routeHref(item.href)} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{item.label}</a>;
          })}
        </nav>
        <div className="v2-header__actions" aria-label="Customer actions">
          <button type="button" onClick={() => setLauncherOpen(true)} title="Locations and quick find"><MapPin size={19} /><span>Explore</span></button>
          <button type="button" onClick={() => go("/account")} title={customer ? "Open account" : "Sign in or create account"} className={path === "/account" ? "v2-account-action is-active" : "v2-account-action"}><UserRound size={19} /><span>{accountLabel}</span></button>
          <button type="button" onClick={() => go("/cart")} title="Cart" className={path === "/cart" || path === "/checkout" ? "v2-cart is-active" : "v2-cart"}><ShoppingCart size={19} /><span>{guestCartCount > 0 && !customer ? `Cart · ${guestCartCount}` : "Cart"}</span></button>
        </div>
      </Container>

      <Container size="wide" className="v2-header__command-row">
        <form className="v2-global-command" role="search" onSubmit={submitSearch}>
          <Search size={21} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="v2-global-search">Search Total Tools</label>
          <input id="v2-global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${branch === "Online" ? "all products" : branch + " inventory"}, model, category, or job…`} autoComplete="off" />
          <div className="v2-global-command__media"><button type="button" title="Open Product Match" onClick={() => go("/product-match")} className={path === "/product-match" ? "is-active" : undefined}><Camera size={18} /><span className="tt-sr-only">Open Product Match</span></button></div>
          <button className="v2-search-submit" type="submit">Search</button>
          <button className={path === "/assistant" ? "v2-ai-submit is-active" : "v2-ai-submit"} type="button" onClick={askAI}><Sparkles size={17} /> Ask AI</button>
        </form>
        <div className="v2-command-side-actions">
          <a className="v2-mobile-account" href={routeHref("/account")} aria-label={customer ? `Open ${accountLabel}'s account` : "Sign in or create an account"}><UserRound size={18} /><span>{accountLabel}</span></a>
          <button ref={launcherTriggerRef} className="v2-quick-find" type="button" onClick={() => setLauncherOpen(true)} aria-expanded={launcherOpen} aria-haspopup="dialog"><Compass size={18} /><span>Quick Find</span><kbd>⌘K</kbd></button>
        </div>
      </Container>

      {launcherOpen ? <div className="v2-command-overlay" role="presentation" onClick={closeLauncher}><section className="v2-command-palette" role="dialog" aria-modal="true" aria-label="Quick Find" onClick={(event) => event.stopPropagation()}><div className="v2-command-palette__top"><span>SmartCommerce navigation</span><h2>Go anywhere in one move.</h2><p>Products, rentals, repairs, commercial support, categories, and AI guidance.</p></div><div className="v2-command-palette__search"><Search size={19} /><input ref={launcherInputRef} value={launcherQuery} onChange={(event) => setLauncherQuery(event.target.value)} placeholder="Type a destination or category" /></div><div className="v2-command-palette__results">{filteredLauncherItems.map((item) => { const Icon = item.icon; return <button key={item.href} type="button" onClick={() => { setLauncherOpen(false); go(item.href); }}><Icon size={19} /><span><strong>{item.title}</strong><small>{item.description}</small></span></button>; })}{!filteredLauncherItems.length ? <p>No matching destination. Try the main search or Ask AI.</p> : null}</div></section></div> : null}
    </header>
  );
}
