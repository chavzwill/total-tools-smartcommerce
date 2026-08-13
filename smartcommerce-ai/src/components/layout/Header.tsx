import {
  Bot,
  Camera,
  Compass,
  Heart,
  ImageUp,
  MapPin,
  Mic,
  Search,
  ShoppingCart,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import logo from "../../assets/brand/total-tools-logo.svg";
import { getCategories } from "../../data/products";
import { slugify } from "../../lib/format";
import { go, routeHref } from "../../lib/router";
import { company } from "../../styles/theme";
import Container from "../shared/Container";

const navigation = [
  { label: "Products", href: "/products" },
  { label: "Rentals", href: "/rentals" },
  { label: "Repairs", href: "/repairs" },
  { label: "Commercial", href: "/commercial" },
  { label: "Deals", href: "/deals" },
  { label: "AI Assistant", href: "/assistant" },
];

const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];

const exploreLinks = [
  { title: "Browse all categories", description: "Navigate departments and category pages", href: "/categories" },
  { title: "Rentals catalogue", description: "Explore equipment and rental planning", href: "/rentals" },
  { title: "Repair services", description: "Start diagnostics and service requests", href: "/repairs" },
  { title: "Commercial support", description: "Business and contractor enquiries", href: "/commercial" },
  { title: "Deals", description: "See verified published promotions", href: "/deals" },
  { title: "SmartCommerce AI", description: "Describe the job when you need guidance", href: "/assistant" },
  { title: "Product match by photo", description: "Use upload or camera when you do not know the name", href: "/product-match" },
] as const;

export default function Header() {
  const [search, setSearch] = useState("");
  const [isCompact, setIsCompact] = useState(false);
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const launcherInputRef = useRef<HTMLInputElement>(null);
  const launcherTriggerRef = useRef<HTMLButtonElement>(null);

  const launcherItems = useMemo(() => {
    const categoryLinks = getCategories().slice(0, 10).map((category) => ({
      title: category.name,
      description: category.description ? `Category · ${category.description}` : "Product category",
      href: `/category/${slugify(category.name)}`,
    }));
    return [...exploreLinks, ...categoryLinks];
  }, []);

  const filteredLauncherItems = useMemo(() => {
    const query = launcherQuery.trim().toLowerCase();
    if (!query) return launcherItems;
    return launcherItems.filter((item) =>
      `${item.title} ${item.description}`.toLowerCase().includes(query)
    );
  }, [launcherItems, launcherQuery]);

  useEffect(() => {
    const handleScroll = () => setIsCompact(window.scrollY > 12);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsLauncherOpen(true);
      }
      if (event.key === "Escape" && isLauncherOpen) {
        event.preventDefault();
        setIsLauncherOpen(false);
        launcherTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLauncherOpen]);

  useEffect(() => {
    if (!isLauncherOpen) {
      setLauncherQuery("");
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    window.setTimeout(() => launcherInputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLauncherOpen]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = search.trim();
    const query = value.toLowerCase();
    if (!value) return go("/products");
    if (matchTerms.some((term) => query.includes(term))) return go("/product-match");
    if (query.includes("repair")) return go("/repairs");
    if (query.includes("rental") || query.startsWith("rent ")) return go(`/rentals?q=${encodeURIComponent(value)}`);
    go(`/search?q=${encodeURIComponent(value)}`);
  }

  function askAI() {
    go(`/assistant?prompt=${encodeURIComponent(search.trim() || "Help me figure out what I need for this job")}`);
  }

  function closeExplore() {
    setIsLauncherOpen(false);
    launcherTriggerRef.current?.focus();
  }

  return (
    <header className={`tt-header ${isCompact ? "tt-header--compact" : ""}`}>
      <Container size="wide" className="tt-header__top">
        <a className="tt-brand tt-brand--image" href={routeHref("/")} aria-label="Total Tools Jamaica home">
          <img src={logo} alt="Total Tools Jamaica" width="900" height="249" />
          <span>{company.subtitle}</span>
        </a>
        <form className="tt-search tt-search--smart" role="search" onSubmit={submitSearch}>
          <Search size={19} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="global-search">Search Total Tools</label>
          <input
            id="global-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="What are you working on today?"
            autoComplete="off"
          />
          <button type="button" className="tt-search__icon" title="Upload a product photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload image</span></button>
          <button type="button" className="tt-search__icon" title="Use camera for product match" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Open camera</span></button>
          <button type="button" className="tt-search__icon" title="Voice-assisted search" onClick={() => go("/assistant?prompt=Help%20me%20search%20by%20voice")}><Mic size={19} /><span className="tt-sr-only">Voice-assisted search</span></button>
          <button type="submit" className="tt-search__search-submit"><Search size={16} /> <span>Search</span></button>
          <button type="button" className="tt-search__ai-submit" onClick={askAI}><Sparkles size={16} /> <span>Ask AI</span></button>
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
        </form>
        <div className="tt-header__actions" aria-label="Customer actions">
          <button title="Branch locations" onClick={() => setIsLauncherOpen(true)}><MapPin size={20} /><span className="tt-sr-only">Branch locations</span></button>
          <button title="Wishlist" onClick={() => go("/wishlist")}><Heart size={20} /><span className="tt-sr-only">Wishlist</span></button>
          <button title="Account" onClick={() => go("/account")}><UserRound size={20} /><span className="tt-sr-only">Account</span></button>
          <button className="tt-header__cart" title="Cart" onClick={() => go("/cart")}><ShoppingCart size={20} /><span className="tt-sr-only">Cart</span></button>
        </div>
      </Container>
      <Container size="wide" className="tt-nav-wrap">
        <nav className="tt-nav" aria-label="Main navigation">
          {navigation.map((item) => <a href={routeHref(item.href)} key={item.label}>{item.label}</a>)}
          <button
            className="tt-explore-trigger"
            type="button"
            onClick={() => setIsLauncherOpen(true)}
            ref={launcherTriggerRef}
            aria-haspopup="dialog"
            aria-expanded={isLauncherOpen}
            aria-controls="tt-explore-launcher"
          >
            <Compass size={17} />
            <span>Quick Find</span>
            <small>Ctrl/Cmd + K</small>
          </button>
        </nav>
      </Container>
      {isLauncherOpen ? (
        <div className="tt-explore-overlay" role="presentation" onClick={closeExplore}>
          <div
            id="tt-explore-launcher"
            className="tt-explore-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Quick Find navigation"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <span><Bot size={17} /> SmartCommerce navigation</span>
              <h2>Where do you want to go?</h2>
              <p>Jump to a product category, service, rental flow, deal, or AI guidance.</p>
            </header>
            <label htmlFor="tt-explore-search" className="tt-sr-only">Quick Find search</label>
            <div className="tt-explore-search">
              <Search size={17} aria-hidden="true" />
              <input
                id="tt-explore-search"
                ref={launcherInputRef}
                value={launcherQuery}
                onChange={(event) => setLauncherQuery(event.target.value)}
                placeholder="Find categories, rentals, repairs, deals, or support"
              />
            </div>
            <div className="tt-explore-results" role="list">
              {filteredLauncherItems.length ? filteredLauncherItems.map((item) => (
                <button key={item.href} type="button" role="listitem" onClick={() => { closeExplore(); go(item.href); }}>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </button>
              )) : <p className="tt-explore-empty">No matching destination. Try the main search or Ask AI.</p>}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
