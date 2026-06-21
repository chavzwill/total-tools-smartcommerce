import { Camera, Heart, ImageUp, Mic, Search, ShoppingCart, Sparkles, UserRound } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import logo from "../../assets/brand/total-tools-logo-transparent.png";
import { go, routeHref } from "../../lib/router";
import { company } from "../../styles/theme";
import Container from "../shared/Container";

const navigation = [
  { label: "Products", href: "/products" },
  { label: "Rentals", href: "/rentals" },
  { label: "Repairs", href: "/repairs" },
  { label: "Commercial", href: "/commercial" },
  { label: "AI Assistant", href: "/assistant" },
  { label: "Deals", href: "/products?filter=deals" }
];

const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];

export default function Header() {
  const [search, setSearch] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (matchTerms.some((term) => query.includes(term))) return go("/product-match");
    if (query.includes("repair")) return go("/repairs");
    if (query.includes("rental") || query.includes("rent ")) return go("/rentals");
    go(`/search?q=${encodeURIComponent(search.trim())}`);
  }
  return (
    <header className="tt-header">
      <Container size="wide" className="tt-header__top">
        <a className="tt-brand tt-brand--image" href={routeHref("/")} aria-label="Total Tools Jamaica home">
          <img src={logo} alt="Total Tools Jamaica" />
          <span>{company.subtitle}</span>
        </a>
        <form className="tt-search tt-search--smart" role="search" onSubmit={submitSearch}>
          <Search size={19} aria-hidden="true" />
          <label className="tt-sr-only" htmlFor="global-search">Search Total Tools</label>
          <input id="global-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search, ask AI, or upload a photo to match a product..." />
          <button type="button" className="tt-search__icon" title="Upload a product photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload image</span></button>
          <button type="button" className="tt-search__icon" title="Use camera for Product Match" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Open camera</span></button>
          <button type="button" className="tt-search__icon" title="Start voice search" onClick={() => go("/assistant?prompt=Voice%20search%20demo")}><Mic size={19} /><span className="tt-sr-only">Voice search</span></button>
          <button type="submit" className="tt-search__submit"><Sparkles size={17} /> Ask AI</button>
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
          {navigation.map((item) => <a className={item.label === "Deals" ? "tt-nav__deal" : ""} href={routeHref(item.href)} key={item.label}>{item.label}</a>)}
        </nav>
      </Container>
    </header>
  );
}
