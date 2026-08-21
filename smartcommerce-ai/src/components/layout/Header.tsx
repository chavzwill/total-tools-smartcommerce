import {
  Bot,
  Camera,
  ChevronDown,
  Compass,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
import {
  SHOPPING_BRANCH_CHANGED_EVENT,
  SHOPPING_BRANCHES,
  branchAwareHref,
  branchDescription,
  getShoppingBranch,
  isShoppingBranch,
  setShoppingBranch,
  type ShoppingBranch,
} from "../../lib/shoppingBranch";
import Container from "../shared/Container";

const GUEST_CART_KEY = "smartcommerce_guest_cart_v1";
const GUEST_CART_CHANGED_EVENT = "smartcommerce:guest-cart-changed";

const navigation = [
  { label: "Shop", href: "/products", match: ["/products", "/product/", "/category/", "/categories", "/search", "/compare"] },
  { label: "Rent", href: "/rentals", match: ["/rentals", "/rental/"] },
  { label: "Repair", href: "/repairs", match: ["/repairs", "/repair-"] },
  { label: "Commercial", href: "/commercial", match: ["/commercial"] },
  { label: "Deals", href: "/deals", match: ["/deals"] },
];

const exploreLinks = [
  { title: "All products", description: "Search the complete product catalogue", href: "/products", icon: ShoppingBag },
  { title: "Equipment rentals", description: "Plan equipment by job, date, and branch", href: "/rentals", icon: Compass },
  { title: "Repairs", description: "Start a repair or service request", href: "/repairs", icon: Bot },
  { title: "Commercial", description: "Business, contractor, and quote support", href: "/commercial", icon: ShoppingCart },
  { title: "SmartCommerce AI", description: "Describe the job and get guided help", href: "/assistant", icon: Sparkles },
  { title: "Photo match", description: "Find an item when you do not know its name", href: "/product-match", icon: Camera },
] as const;

const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function customerLabel(customer: CustomerAccount | null) {
  if (!customer) return "Account";
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

export default function Header() {
  const [search, setSearch] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [path, setPath] = useState(() => getRoute().path);
  const [guestCartCount, setGuestCartCount] = useState(initialGuestCartCount);
  const [branch, setBranch] = useState<ShoppingBranch>(() => getShoppingBranch());
  const [branchOpen, setBranchOpen] = useState(false);
  const launcherInputRef = useRef<HTMLInputElement>(null);
  const launcherTriggerRef = useRef<HTMLButtonElement>(null);
  const launcherDialogRef = useRef<HTMLElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const branchTriggerRef = useRef<HTMLButtonElement>(null);

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
    const syncBranch = (event: Event) => {
      const next = (event as CustomEvent<{ branch?: unknown }>).detail?.branch;
      if (isShoppingBranch(next)) setBranch(next);
    };
    window.addEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch);
    return () => window.removeEventListener(SHOPPING_BRANCH_CHANGED_EVENT, syncBranch);
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
      if (event.key === "Escape" && branchOpen) { setBranchOpen(false); branchTriggerRef.current?.focus(); }
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
    setShoppingBranch(next);
    setBranchOpen(false);
    branchTriggerRef.current?.focus();
  }

  function trapLauncherFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(launcherDialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []).filter((item) => !item.hasAttribute("hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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

  function askAI() {
    const prompt = search.trim() || `Help me find the right tool or equipment${branch === "Online" ? "" : ` from ${branch}`}`;
    go(`/assistant?prompt=${encodeURIComponent(prompt)}`);
  }

  const closeLauncher = () => { setLauncherOpen(false); launcherTriggerRef.current?.focus(); };
  const accountLabel = customerLabel(customer);
  const cartLabel = guestCartCount > 0 && !customer ? `Cart, ${guestCartCount} item${guestCartCount === 1 ? "" : "s"}` : "Cart";

  return (
    <header className="v2-header">
      <Container size="wide" className="v2-header__primary">
        <div className="v2-branch-selector" ref={branchRef}>
          <button ref={branchTriggerRef} type="button" className="v2-branch-selector__trigger" onClick={() => setBranchOpen((open) => !open)} aria-haspopup="menu" aria-expanded={branchOpen} aria-controls="v2-branch-menu" aria-label={`Shopping from ${branch}. Change branch`}>
            <Store size={19} aria-hidden="true" />
            <span><small>Shopping from</small><strong>{branch}</strong></span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {branchOpen ? (
            <div id="v2-branch-menu" className="v2-branch-selector__menu" role="menu" aria-label="Choose shopping branch">
              <div className="v2-branch-selector__intro"><strong>Choose where you shop</strong><span>Stock, pickup and rental context follow your selection where live data is available.</span></div>
              {SHOPPING_BRANCHES.map((option) => (
                <button key={option} type="button" role="menuitemradio" aria-checked={option === branch} className={option === branch ? "is-selected" : ""} onClick={() => chooseBranch(option)}>
                  <span><strong>{option}</strong><small>{branchDescription(option)}</small></span>
                  {option === branch ? <em>Current</em> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <a className="v2-brand" href={routeHref("/")} aria-label="Total Tools Jamaica home">
          <img src={logo} alt="Total Tools Jamaica" width="900" height="249" />
        </a>

        <nav className="v2-header__nav" aria-label="Primary commerce navigation">
          {navigation.map((item) => {
            const active = isActive(path, item.match);
            const destination = branchAwareHref(item.href, branch);
            return <a key={item.href} href={routeHref(destination)} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{item.label}</a>;
          })}
        </nav>

        <div className="v2-header__actions" aria-label="Customer actions">
          <button type="button" onClick={() => go("/account")} title={customer ? "Open account" : "Sign in or create account"} aria-label={customer ? `Open ${accountLabel}'s account` : "Open account, sign in or create an account"} className={path === "/account" ? "v2-account-action is-active" : "v2-account-action"}>
            <UserRound size={19} aria-hidden="true" /><span>{accountLabel}</span>
          </button>
          <button type="button" onClick={() => go("/cart")} title="Cart" aria-label={cartLabel} className={path === "/cart" || path === "/checkout" ? "v2-cart is-active" : "v2-cart"}>
            <ShoppingCart size={19} aria-hidden="true" /><span>Cart</span>{guestCartCount > 0 && !customer ? <strong className="v2-cart__count" aria-hidden="true">{guestCartCount}</strong> : null}
          </button>
        </div>
      </Container>

      <Container size="wide" className="v2-header__command-row">
        <form className="v2-global-command" role="search" onSubmit={submitSearch}>
          <Search size={21} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="v2-global-search">Search Total Tools</label>
          <input id="v2-global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${branch === "Online" ? "products, models, categories, or jobs" : `${branch} stock, models, categories, or jobs`}…`} autoComplete="off" />
          <button type="button" title="Find from a photo" aria-label="Find a product from a photo" onClick={() => go("/product-match")} className={`v2-photo-match${path === "/product-match" ? " is-active" : ""}`}><Camera size={18} aria-hidden="true" /><span>Photo</span></button>
          <button className="v2-search-submit" type="submit">Search</button>
          <button className={path === "/assistant" ? "v2-ai-submit is-active" : "v2-ai-submit"} type="button" onClick={askAI}><Sparkles size={17} aria-hidden="true" /><span>Ask AI</span></button>
        </form>
        <button ref={launcherTriggerRef} className="v2-quick-find" type="button" onClick={() => setLauncherOpen(true)} aria-expanded={launcherOpen} aria-haspopup="dialog" aria-controls="v2-explore-dialog"><Compass size={18} aria-hidden="true" /><span>Explore</span><kbd aria-hidden="true">⌘K</kbd></button>
      </Container>

      {launcherOpen ? (
        <div className="v2-command-overlay" role="presentation" onClick={closeLauncher}>
          <section ref={launcherDialogRef} id="v2-explore-dialog" className="v2-command-palette" role="dialog" aria-modal="true" aria-labelledby="v2-explore-title" onKeyDown={trapLauncherFocus} onClick={(event) => event.stopPropagation()}>
            <button className="v2-command-palette__close" type="button" onClick={closeLauncher} aria-label="Close Explore"><X size={18} aria-hidden="true" /></button>
            <div className="v2-command-palette__top"><span>SmartCommerce</span><h2 id="v2-explore-title">What do you need to do?</h2><p>Jump to shopping, rentals, repairs, commercial support, product matching, or guided AI help.</p></div>
            <div className="v2-command-palette__search"><Search size={19} aria-hidden="true" /><label className="tt-sr-only" htmlFor="v2-explore-search">Search SmartCommerce destinations</label><input id="v2-explore-search" ref={launcherInputRef} value={launcherQuery} onChange={(event) => setLauncherQuery(event.target.value)} placeholder="Search destinations and categories" /></div>
            <div className="v2-command-palette__results">
              {filteredLauncherItems.map((item) => {
                const Icon = item.icon;
                const destination = branchAwareHref(item.href, branch);
                return <button key={item.href} type="button" onClick={() => { setLauncherOpen(false); go(destination); }}><Icon size={19} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.description}</small></span></button>;
              })}
              {!filteredLauncherItems.length ? <p role="status">No matching destination. Try the main search or Ask AI.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </header>
  );
}