import {
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  Clock3,
  ImageUp,
  Mic,
  PackageSearch,
  Search,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { getCategories, getProducts } from "../data/products";
import { slugify } from "../lib/format";
import { go } from "../lib/router";

const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];
const RECENT_SEARCH_KEY = "smartcommerce_recent_searches_v1";

const quickPaths = [
  { label: "Shop products", detail: "Tools, parts, brands and categories", href: "/products", icon: PackageSearch },
  { label: "Rent equipment", detail: "Find equipment around the job and dates", href: "/rentals", icon: BriefcaseBusiness },
  { label: "Start a repair", detail: "Describe the machine and the problem", href: "/repairs", icon: Wrench },
  { label: "Find from a photo", detail: "Use an image when you do not know the name", href: "/product-match", icon: Camera },
  { label: "Commercial support", detail: "Quotes, bulk orders and business purchasing", href: "/commercial", icon: BriefcaseBusiness },
] as const;

type Props = {
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  onCommandFocusChange?: (active: boolean) => void;
};

function readRecentSearches() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_SEARCH_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

export default function HeroAdvisor({ prompt, setPrompt, onCommandFocusChange }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const query = prompt.trim().toLowerCase();
  const typedSuggestions = useMemo(() => {
    if (query.length < 2) return { categories: [], products: [] };

    const categories = getCategories()
      .filter((category) => `${category.name} ${category.description || ""}`.toLowerCase().includes(query))
      .slice(0, 3);

    const products = getProducts()
      .filter((product) => {
        const haystack = [
          product.name,
          product.sku,
          product.category,
          product.department,
          product.subcategory,
          ...(product.tags || []),
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 4);

    return { categories, products };
  }, [query]);

  const hasTypedSuggestions = typedSuggestions.categories.length > 0 || typedSuggestions.products.length > 0;

  useEffect(() => {
    if (!searchMode) return;
    setRecentSearches(readRecentSearches());
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [searchMode]);

  function rememberSearch(value: string) {
    if (!value) return;
    const next = [value, ...readRecentSearches().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 5);
    window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    setRecentSearches(next);
  }

  function routeSearch(value: string) {
    const normalized = value.toLowerCase();
    if (matchTerms.some((term) => normalized.includes(term))) return go("/product-match");
    if (normalized.includes("repair")) return go(`/repairs?equipment=${encodeURIComponent(value)}`);
    if (normalized.includes("rent ") || normalized.includes("rental")) return go(`/rentals?q=${encodeURIComponent(value)}`);
    go(`/assistant?prompt=${encodeURIComponent(value || "Help me choose what I need for this job")}`);
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    rememberSearch(value);
    setSearchMode(false);
    onCommandFocusChange?.(false);
    routeSearch(value);
  }

  function openSearchMode() {
    setSearchMode(true);
    onCommandFocusChange?.(true);
  }

  function closeSearchMode() {
    setSearchMode(false);
    onCommandFocusChange?.(false);
    inputRef.current?.blur();
  }

  function useRecent(value: string) {
    setPrompt(value);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function clearRecent() {
    window.localStorage.removeItem(RECENT_SEARCH_KEY);
    setRecentSearches([]);
    inputRef.current?.focus();
  }

  function openSuggestion(href: string, value?: string) {
    if (value) rememberSearch(value);
    setSearchMode(false);
    onCommandFocusChange?.(false);
    go(href);
  }

  return (
    <div
      className={`v2-command${searchMode ? " is-search-mode" : ""}`}
      onFocusCapture={openSearchMode}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (!window.matchMedia("(max-width: 760px)").matches) {
          setSearchMode(false);
          onCommandFocusChange?.(false);
        }
      }}
    >
      <div className="v2-command__mobile-head">
        <span>Search SmartCommerce</span>
        <button type="button" onClick={closeSearchMode} aria-label="Close search"><X size={22} /></button>
      </div>

      <form className="v2-command__form" onSubmit={ask}>
        <Search size={22} aria-hidden="true" />
        <label className="tt-sr-only" htmlFor="hero-ai-input">What are you working on today?</label>
        <input
          ref={inputRef}
          id="hero-ai-input"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the job, product, or problem…"
          autoComplete="off"
          enterKeyHint="search"
        />
        <div className="v2-command__tools">
          <button type="button" title="Find from a photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload photo</span></button>
          <button type="button" title="Use camera" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Use camera</span></button>
          <button type="button" title="Voice-assisted search" onClick={() => go("/assistant?prompt=Help%20me%20search%20by%20voice")}><Mic size={19} /><span className="tt-sr-only">Voice-assisted search</span></button>
        </div>
        <button type="submit" className="v2-command__submit" aria-label="Ask SmartCommerce"><Sparkles size={18} /><span>Ask SmartCommerce</span></button>
        <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
      </form>

      <div className="v2-command__hint"><span>Natural search</span><span>Photo match</span><span>Voice-assisted</span><span>Live data when connected</span></div>

      <div className="v2-command__search-content">
        {query.length >= 2 ? (
          <section className="v2-command__suggestions" aria-labelledby="search-suggestions-title">
            <div className="v2-command__section-head">
              <h2 id="search-suggestions-title">Suggestions</h2>
            </div>

            {hasTypedSuggestions ? (
              <div className="v2-command__suggestion-list">
                {typedSuggestions.categories.map((category) => (
                  <button type="button" key={`category-${category.name}`} onClick={() => openSuggestion(`/category/${slugify(category.name)}`, category.name)}>
                    <span className="v2-command__suggestion-icon"><PackageSearch size={19} aria-hidden="true" /></span>
                    <span><strong>{category.name}</strong><small>Category</small></span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ))}
                {typedSuggestions.products.map((product) => (
                  <button type="button" key={`product-${product.id}`} onClick={() => openSuggestion(`/product/${product.id}`, product.name)}>
                    <span className="v2-command__suggestion-icon"><Search size={19} aria-hidden="true" /></span>
                    <span><strong>{product.name}</strong><small>{product.category}{product.sku ? ` · ${product.sku}` : ""}</small></span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="v2-command__no-match">No direct catalogue match yet. SmartCommerce can still understand the job or problem you describe.</p>
            )}

            <button type="button" className="v2-command__search-all" onClick={() => openSuggestion(`/search?q=${encodeURIComponent(prompt.trim())}`, prompt.trim())}>
              <Search size={18} aria-hidden="true" />
              <span>Search all products for “{prompt.trim()}”</span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </section>
        ) : (
          <>
            {recentSearches.length > 0 ? (
              <section className="v2-command__recent" aria-labelledby="recent-searches-title">
                <div className="v2-command__section-head">
                  <h2 id="recent-searches-title">Recent searches</h2>
                  <button type="button" onClick={clearRecent}>Clear</button>
                </div>
                <div className="v2-command__recent-list">
                  {recentSearches.map((item) => (
                    <button type="button" key={item} onClick={() => useRecent(item)}>
                      <Clock3 size={18} aria-hidden="true" />
                      <span>{item}</span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="v2-command__quick-paths" aria-labelledby="quick-paths-title">
              <div className="v2-command__section-head">
                <h2 id="quick-paths-title">Quick paths</h2>
              </div>
              <div className="v2-command__path-list">
                {quickPaths.map(({ label, detail, href, icon: Icon }) => (
                  <button type="button" key={href} onClick={() => openSuggestion(href)}>
                    <span className="v2-command__path-icon"><Icon size={20} aria-hidden="true" /></span>
                    <span><strong>{label}</strong><small>{detail}</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
