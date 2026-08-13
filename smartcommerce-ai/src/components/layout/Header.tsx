import {
  Bot,
  Camera,
  Compass,
  Heart,
  ImageUp,
  MapPin,
  Mic,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import logo from "../../assets/brand/total-tools-logo.svg";
import { getCategories } from "../../data/products";
import { slugify } from "../../lib/format";
import { go, routeHref } from "../../lib/router";
import Container from "../shared/Container";

const navigation = [
  { label: "Products", href: "/products" },
  { label: "Rentals", href: "/rentals" },
  { label: "Repairs", href: "/repairs" },
  { label: "Commercial", href: "/commercial" },
  { label: "Deals", href: "/deals" },
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

export default function Header() {
  const [search, setSearch] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const launcherInputRef = useRef<HTMLInputElement>(null);
  const launcherTriggerRef = useRef<HTMLButtonElement>(null);

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
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLauncherOpen(true);
      }
      if (event.key === "Escape" && launcherOpen) {
        setLauncherOpen(false);
        launcherTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launcherOpen]);

  useEffect(() => {
    if (!launcherOpen) {
      setLauncherQuery("");
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    window.setTimeout(() => launcherInputRef.current?.focus(), 0);
    return () => { document.body.style.overflow = ""; };
  }, [launcherOpen]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = search.trim();
    const normalized = value.toLowerCase();
    if (!value) return go("/products");
    if (matchTerms.some((term) => normalized.includes(term))) return go("/product-match");
    if (normalized.includes("repair")) return go(`/repairs?equipment=${encodeURIComponent(value)}`);
    if (normalized.includes("rental") || normalized.startsWith("rent ")) return go(`/rentals?q=${encodeURIComponent(value)}`);
    go(`/search?q=${encodeURIComponent(value)}`);
  }

  function askAI() {
    go(`/assistant?prompt=${encodeURIComponent(search.trim() || "Help me figure out what I need for this job")}`);
  }

  const closeLauncher = () => {
    setLauncherOpen(false);
    launcherTriggerRef.current?.focus();
  };

  return (
    <header className="v2-header">
      <Container size="wide" className="v2-header__primary">
        <a className="v2-brand" href={routeHref("/")} aria-label="Total Tools Jamaica home">
          <img src={logo} alt="Total Tools Jamaica" width="900" height="249" />
        </a>

        <nav className="v2-header__nav" aria-label="Primary commerce navigation">
          {navigation.map((item) => <a key={item.href} href={routeHref(item.href)}>{item.label}</a>)}
        </nav>

        <div className="v2-header__actions" aria-label="Customer actions">
          <button type="button" onClick={() => setLauncherOpen(true)} title="Locations and quick find"><MapPin size={19} /><span>Explore</span></button>
          <button type="button" onClick={() => go("/account")} title="Account"><UserRound size={19} /><span>Account</span></button>
          <button type="button" onClick={() => go("/cart")} title="Cart" className="v2-cart"><ShoppingCart size={19} /><span>Cart</span></button>
        </div>
      </Container>

      <Container size="wide" className="v2-header__command-row">
        <form className="v2-global-command" role="search" onSubmit={submitSearch}>
          <Search size={21} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="v2-global-search">Search Total Tools</label>
          <input id="v2-global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a product, model, category, or job…" autoComplete="off" />
          <div className="v2-global-command__media">
            <button type="button" title="Upload a photo" onClick={() => uploadRef.current?.click()}><ImageUp size={18} /><span className="tt-sr-only">Upload photo</span></button>
            <button type="button" title="Use camera" onClick={() => cameraRef.current?.click()}><Camera size={18} /><span className="tt-sr-only">Use camera</span></button>
            <button type="button" title="Voice-assisted search" onClick={() => go("/assistant?prompt=Help%20me%20search%20by%20voice")}><Mic size={18} /><span className="tt-sr-only">Voice-assisted search</span></button>
          </div>
          <button className="v2-search-submit" type="submit">Search</button>
          <button className="v2-ai-submit" type="button" onClick={askAI}><Sparkles size={17} /> Ask AI</button>
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
        </form>
        <button ref={launcherTriggerRef} className="v2-quick-find" type="button" onClick={() => setLauncherOpen(true)} aria-expanded={launcherOpen} aria-haspopup="dialog"><Compass size={18} /><span>Quick Find</span><kbd>⌘K</kbd></button>
      </Container>

      {launcherOpen ? (
        <div className="v2-command-overlay" role="presentation" onClick={closeLauncher}>
          <section className="v2-command-palette" role="dialog" aria-modal="true" aria-label="Quick Find" onClick={(event) => event.stopPropagation()}>
            <div className="v2-command-palette__top">
              <span>SmartCommerce navigation</span>
              <h2>Go anywhere in one move.</h2>
              <p>Products, rentals, repairs, commercial support, categories, and AI guidance.</p>
            </div>
            <div className="v2-command-palette__search"><Search size={19} /><input ref={launcherInputRef} value={launcherQuery} onChange={(event) => setLauncherQuery(event.target.value)} placeholder="Type a destination or category" /></div>
            <div className="v2-command-palette__results">
              {filteredLauncherItems.map((item) => {
                const Icon = item.icon;
                return <button key={item.href} type="button" onClick={() => { setLauncherOpen(false); go(item.href); }}><Icon size={19} /><span><strong>{item.title}</strong><small>{item.description}</small></span></button>;
              })}
              {!filteredLauncherItems.length ? <p>No matching destination. Try the main search or Ask AI.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </header>
  );
}
