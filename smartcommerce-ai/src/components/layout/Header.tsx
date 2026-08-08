import {
  Camera,
  Compass,
  Heart,
  ImageUp,
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
  { label: "AI Assistant", href: "/assistant" }
];

const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];

const exploreLinks = [
  { title: "Browse all categories", description: "Navigate departments and category pages", href: "/categories" },
  { title: "Rentals catalogue", description: "Explore equipment and rental terms", href: "/rentals" },
  { title: "Repair services", description: "Book diagnostics, maintenance, and service", href: "/repairs" },
  { title: "Commercial accounts", description: "Open or manage business pricing access", href: "/commercial" },
  { title: "SmartCommerce AI Assistant", description: "Get guided recommendations and next steps", href: "/assistant" },
  { title: "Product match by photo", description: "Use upload or camera to identify products", href: "/product-match" },
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
    const categoryLinks = getCategories().slice(0, 8).map((category) => ({
      title: category.name,
      description: `Category · ${category.description}`,
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
    const query = search.trim().toLowerCase();
    if (matchTerms.some((term) => query.includes(term))) return go("/product-match");
    if (query.includes("repair")) return go("/repairs");
    if (query.includes("rental") || query.includes("rent ")) return go("/rentals");
    go(`/search?q=${encodeURIComponent(search.trim())}`);
  }
  function openExplore() {
    setIsLauncherOpen(true);
  }
  function closeExplore() {
    setIsLauncherOpen(false);
    launcherTriggerRef.current?.focus();
  }
  function launchTo(path: string) {
    closeExplore();
    go(path);
  }

  return (
    <header className={`tt-header ${isCompact ? "tt-header--compact" : ""}`}>
      <Container size="wide" className="tt-header__top">
        <a className="tt-brand tt-brand--image" href={routeHref("/")} aria-label="Total Tools Jamaica home">
          <img src={logo} alt="Total Tools Jamaica official logo" width="900" height="249" />
          <span>{company.subtitle}</span>
        </a>
        <form className="tt-search tt-search--smart" role="search" onSubmit={submitSearch}>
          <Search size={19} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="global-search">Search Total Tools</label>
          <input id="global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search, ask AI, or upload a photo to match a product..." />
          <button type="button" className="tt-search__icon" title="Upload a product photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload image</span></button>
          <button type="button" className="tt-search__icon" title="Use camera for Product Match" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Open camera</span></button>
          <button type="button" className="tt-search__icon" title="Start voice search" onClick={() => go("/assistant?prompt=Voice%20search%20demo")}><Mic size={19} /><span className="tt-sr-only">Voice search</span></button>
          <button type="submit" className="tt-search__submit"><Sparkles size={17} /> <span>Ask AI</span></button>
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
        </form>
        <div className="tt-header__actions" aria-label="Customer actions">
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
            onClick={openExplore}
            ref={launcherTriggerRef}
            aria-haspopup="dialog"
            aria-expanded={isLauncherOpen}
            aria-controls="tt-explore-launcher"
          >
            <Compass size={17} />
            <span>Explore</span>
            <small>Ctrl/Cmd + K</small>
          </button>
        </nav>
      </Container>
      {isLauncherOpen && (
        <div className="tt-explore-overlay" role="presentation" onClick={closeExplore}>
          <div
            id="tt-explore-launcher"
            className="tt-explore-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Explore pages and services"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Quick Find</h2>
              <p>Explore pages, services, and categories.</p>
            </header>
            <label htmlFor="tt-explore-search" className="tt-sr-only">Quick Find search</label>
            <div className="tt-explore-search">
              <Search size={17} aria-hidden="true" />
              <input
                id="tt-explore-search"
                ref={launcherInputRef}
                value={launcherQuery}
                onChange={(event) => setLauncherQuery(event.target.value)}
                placeholder="Find categories, rentals, services, and support…"
              />
            </div>
            <div className="tt-explore-results" role="list">
              {filteredLauncherItems.length ? (
                filteredLauncherItems.map((item) => (
                  <button key={item.href} type="button" role="listitem" onClick={() => launchTo(item.href)}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </button>
                ))
              ) : (
                <p className="tt-explore-empty">No matching destinations yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
