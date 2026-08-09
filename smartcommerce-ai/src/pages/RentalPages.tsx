import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  Loader2,
  MapPin,
  Scale,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import RentalTile from "../components/demo/RentalTile";
import Container from "../components/shared/Container";
import { getRentalById, getRentals } from "../data/rentals";
import { money } from "../lib/format";
import { go, routeHref } from "../lib/router";
import { company } from "../styles/theme";
import type { RentalItem } from "../types";
import "./RentalExperience.css";

type FulfillmentMode = "pickup" | "delivery" | "unspecified";
type SortMode = "recommended" | "price-low" | "price-high" | "name";

type RentalQueryState = {
  search: string;
  category: string;
  branch: string;
  startDate: string;
  endDate: string;
  fulfillment: FulfillmentMode;
  availableNow: boolean;
  sort: SortMode;
  compare: string[];
  job: string;
};

type ReservationDraft = {
  startDate: string;
  endDate: string;
  branch: string;
  fulfillment: FulfillmentMode;
  fullName: string;
  email: string;
  phone: string;
};

const branchOptions = company.branches.map((branch) => branch.name);
const dateFormat = new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" });
const MAX_COMPARE = 3;

const parseQuery = (path: string): URLSearchParams =>
  new URLSearchParams(path.split("?")[1] || "");

const getHashPath = () => window.location.hash.slice(1) || "/";

const readQueryState = (path = getHashPath()): RentalQueryState => {
  const query = parseQuery(path);
  const compare = (query.get("compare") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const sort = (query.get("sort") || "recommended") as SortMode;
  const fulfillment = (query.get("fulfillment") || "unspecified") as FulfillmentMode;

  return {
    search: query.get("q") || "",
    category: query.get("category") || "",
    branch: query.get("branch") || "",
    startDate: query.get("start") || "",
    endDate: query.get("end") || "",
    fulfillment:
      fulfillment === "pickup" || fulfillment === "delivery"
        ? fulfillment
        : "unspecified",
    availableNow: query.get("availableNow") === "1",
    sort:
      sort === "price-low" || sort === "price-high" || sort === "name"
        ? sort
        : "recommended",
    compare,
    job: query.get("job") || "",
  };
};

const writeQueryState = (state: RentalQueryState) => {
  const params = new URLSearchParams();
  if (state.search) params.set("q", state.search);
  if (state.category) params.set("category", state.category);
  if (state.branch) params.set("branch", state.branch);
  if (state.startDate) params.set("start", state.startDate);
  if (state.endDate) params.set("end", state.endDate);
  if (state.fulfillment !== "unspecified")
    params.set("fulfillment", state.fulfillment);
  if (state.availableNow) params.set("availableNow", "1");
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.compare.length) params.set("compare", state.compare.join(","));
  if (state.job) params.set("job", state.job);

  const query = params.toString();
  const nextHash = `#/rentals${query ? `?${query}` : ""}`;
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(null, "", nextUrl);
};

const daysBetween = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return 0;
  return Math.max(0, Math.ceil((end.valueOf() - start.valueOf()) / 86400000) + 1);
};

const getDurationLabel = (days: number) => {
  if (!days) return "Select dates";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days % 7 === 0) return `${days / 7} week${days === 7 ? "" : "s"}`;
  return `${days} days`;
};

const statusLabel = (availability: string) => {
  const text = availability.toLowerCase();
  if (text.includes("today") || text.includes("now")) return "Available now";
  if (text.includes("tomorrow") || text.includes("week")) return "Limited availability";
  if (text.includes("maintenance") || text.includes("unavailable")) return "Unavailable";
  return "Check availability";
};

const categoryForItem = (item: RentalItem) => item.category || "Equipment";

const getSpecValue = (item: RentalItem, keys: string[]) => {
  for (const key of keys) {
    const value = item.specs[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Not provided";
};

const buildDecisionSummary = (item: RentalItem) => {
  const firstSpec = Object.entries(item.specs).find(([, value]) => value?.trim());
  const capacity = getSpecValue(item, ["Capacity", "Working height", "Reach / power"]);
  return {
    bestFor: item.description || "Provider description is not available yet.",
    keyAdvantage: firstSpec
      ? `${firstSpec[0]}: ${firstSpec[1]}`
      : "Confirm critical operating requirements with the rental desk.",
    watchOut:
      capacity === "Not provided"
        ? "Critical capability limits are missing. Confirm before reservation."
        : `Capacity context: ${capacity}. Verify site, transport, and operator requirements.`,
  };
};

const getCategoryComparisonKeys = (category: string) => {
  const name = category.toLowerCase();
  if (name.includes("access") || name.includes("lift")) {
    return ["Reach / power", "Capacity", "Operating weight", "Delivery"];
  }
  if (name.includes("power") || name.includes("generator")) {
    return ["Reach / power", "Capacity", "Delivery", "Support"];
  }
  if (name.includes("earth")) {
    return ["Operating weight", "Capacity", "Reach / power", "Delivery"];
  }
  return ["Capacity", "Reach / power", "Operating weight", "Delivery"];
};

const getComparableAlternatives = (item: RentalItem, items: RentalItem[]) =>
  items
    .filter((candidate) => candidate.id !== item.id)
    .sort((a, b) => Math.abs(a.dailyRate - item.dailyRate) - Math.abs(b.dailyRate - item.dailyRate))
    .slice(0, 3)
    .map((candidate) => ({
      item: candidate,
      reason:
        candidate.dailyRate < item.dailyRate
          ? "Cheaper daily rate for similar use."
          : candidate.dailyRate > item.dailyRate
            ? "Higher daily rate for potentially higher capability."
            : "Similar daily rate and category fit.",
    }));

const isAvailableNow = (item: RentalItem) =>
  /today|now|\d+\s+units?\s+available/i.test(item.availability);

const rentalSupportsDelivery = (item: RentalItem) =>
  Boolean(String(item.specs?.Delivery || item.branchAvailability).toLowerCase().includes("delivery"));

export function RentalsPage() {
  const [rentals, setRentals] = useState<RentalItem[]>(() => getRentals());
  const [queryState, setQueryState] = useState<RentalQueryState>(() => readQueryState());
  const [draftContext, setDraftContext] = useState(() => ({
    branch: queryState.branch,
    startDate: queryState.startDate,
    endDate: queryState.endDate,
    fulfillment: queryState.fulfillment,
    job: queryState.job,
  }));
  const [searchInput, setSearchInput] = useState(queryState.search);
  const [contextError, setContextError] = useState("");
  const [isContextSheetOpen, setContextSheetOpen] = useState(false);
  const [isApplyingContext, setApplyingContext] = useState(false);
  const [isLoading, setLoading] = useState(rentals.length === 0);
  const [showFilters, setShowFilters] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = (event: Event) => {
      const custom = event as CustomEvent<RentalItem[]>;
      setRentals(custom.detail || getRentals());
      setLoading(false);
    };
    const timeout = window.setTimeout(() => setLoading(false), 550);
    window.addEventListener("smartcommerce:rentals-changed", update as EventListener);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("smartcommerce:rentals-changed", update as EventListener);
    };
  }, []);

  useEffect(() => {
    writeQueryState(queryState);
  }, [queryState]);

  useEffect(() => {
    if (!isContextSheetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextSheetOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isContextSheetOpen]);

  useEffect(() => {
    if (!showFilters) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowFilters(false);
        filterButtonRef.current?.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showFilters]);

  const categories = useMemo(
    () =>
      Array.from(new Set(rentals.map((item) => categoryForItem(item)))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [rentals]
  );

  const filtered = useMemo(() => {
    const term = queryState.search.trim().toLowerCase();
    const sorted = rentals.filter((item) => {
      if (queryState.category && item.category !== queryState.category) return false;
      if (queryState.branch && !item.branchAvailability.toLowerCase().includes(queryState.branch.toLowerCase())) return false;
      if (queryState.availableNow && !isAvailableNow(item)) return false;
      if (queryState.fulfillment === "delivery" && !rentalSupportsDelivery(item)) return false;
      if (term) {
        const searchable = `${item.name} ${item.category} ${item.description} ${Object.values(item.specs).join(" ")}`.toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });

    if (queryState.sort === "price-low") {
      sorted.sort((a, b) => (a.dailyRate || Number.MAX_SAFE_INTEGER) - (b.dailyRate || Number.MAX_SAFE_INTEGER));
    } else if (queryState.sort === "price-high") {
      sorted.sort((a, b) => (b.dailyRate || 0) - (a.dailyRate || 0));
    } else if (queryState.sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
  }, [queryState, rentals]);

  const compareItems = useMemo(
    () => queryState.compare.map((id) => rentals.find((item) => item.id === id)).filter(Boolean) as RentalItem[],
    [queryState.compare, rentals]
  );

  const contextDuration = useMemo(
    () => getDurationLabel(daysBetween(queryState.startDate, queryState.endDate)),
    [queryState.endDate, queryState.startDate]
  );

  const unresolvedContext = [
    !queryState.branch ? "branch" : "",
    !queryState.startDate ? "start date" : "",
    !queryState.endDate ? "end date" : "",
    queryState.fulfillment === "unspecified" ? "pickup/delivery" : "",
  ].filter(Boolean);

  const activeFilterCount = [
    queryState.category,
    queryState.branch,
    queryState.availableNow ? "available-now" : "",
    queryState.fulfillment !== "unspecified" ? queryState.fulfillment : "",
    queryState.search.trim(),
  ].filter(Boolean).length;

  const applyContext = () => {
    if (draftContext.startDate && draftContext.endDate && draftContext.endDate < draftContext.startDate) {
      setContextError("End date must be on or after start date.");
      return;
    }
    setContextError("");
    setApplyingContext(true);
    setQueryState((prev) => ({
      ...prev,
      branch: draftContext.branch,
      startDate: draftContext.startDate,
      endDate: draftContext.endDate,
      fulfillment: draftContext.fulfillment,
      job: draftContext.job,
    }));
    window.setTimeout(() => setApplyingContext(false), 350);
    setContextSheetOpen(false);
  };

  const clearAllFilters = () => {
    setSearchInput("");
    setQueryState({
      ...queryState,
      search: "",
      category: "",
      availableNow: false,
      sort: "recommended",
    });
  };

  const onToggleCompare = (id: string) => {
    setQueryState((prev) => {
      const exists = prev.compare.includes(id);
      if (exists) return { ...prev, compare: prev.compare.filter((item) => item !== id) };
      if (prev.compare.length >= MAX_COMPARE) return prev;
      return { ...prev, compare: [...prev.compare, id] };
    });
  };

  const contextSummary = (
    <div className="rental-context-bar__summary">
      <span><MapPin size={15} /> {queryState.branch || "Select branch"}</span>
      <span><CalendarDays size={15} /> {queryState.startDate && queryState.endDate ? `${dateFormat.format(new Date(queryState.startDate))} - ${dateFormat.format(new Date(queryState.endDate))}` : "Select dates"}</span>
      <span><Clock3 size={15} /> {contextDuration}</span>
      <span><Truck size={15} /> {queryState.fulfillment === "unspecified" ? "Pickup or delivery" : queryState.fulfillment === "delivery" ? "Delivery" : "Pickup"}</span>
    </div>
  );

  return (
    <div className="demo-page rental-page-next">
      <section className="rental-intent-nav">
        <Container className="rental-intent-nav__inner">
          <a href={routeHref("/rentals")}>Browse all rentals</a>
          <a href={routeHref(`/assistant?prompt=${encodeURIComponent(queryState.job || "Help me choose rental equipment for my job")}`)}>Find equipment by job</a>
          <button type="button" onClick={() => setQueryState((prev) => ({ ...prev, availableNow: !prev.availableNow }))}>
            Available now
          </button>
          <button type="button" onClick={() => { setDraftContext((prev) => ({ ...prev, fulfillment: "delivery" })); setContextSheetOpen(true); }}>
            Delivery options
          </button>
          <a href={routeHref("/assistant?prompt=Show rental guides and planning tips")}>Rental guides</a>
          <a href={routeHref("/cart")}>Current reservation/cart</a>
        </Container>
      </section>

      <section className="rental-page-header">
        <Container className="rental-page-header__inner">
          <div>
            <span>Total Tools Rentals</span>
            <h1>Find, qualify, and reserve equipment with confidence.</h1>
            <p>
              Fast path for known equipment and guided AI path for job-based discovery.
              Availability and total cost remain tied to branch and date context.
            </p>
          </div>
          <div className="rental-page-header__assistant">
            <strong>Help me choose</strong>
            <p>
              Describe your job and constraints. Recommendations are returned from
              connected provider data only.
            </p>
            <a href={routeHref(`/assistant?prompt=${encodeURIComponent(queryState.job || "I need help choosing rental equipment for my job.")}`)}>
              Ask rental concierge <ArrowRight size={15} />
            </a>
          </div>
        </Container>
      </section>

      <Container className="rental-page-content-next">
        <section className="rental-context-bar" aria-label="Rental context">
          <div className="rental-context-bar__desktop">{contextSummary}</div>
          <button type="button" className="rental-context-bar__mobile-toggle" onClick={() => setContextSheetOpen(true)}>
            Edit rental context
          </button>
          <div className="rental-context-bar__editor">
            <label>
              Branch
              <select value={draftContext.branch} onChange={(event) => setDraftContext((prev) => ({ ...prev, branch: event.target.value }))}>
                <option value="">Select branch</option>
                {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </label>
            <label>
              Start date
              <input type="date" value={draftContext.startDate} onChange={(event) => setDraftContext((prev) => ({ ...prev, startDate: event.target.value }))} />
            </label>
            <label>
              End date
              <input type="date" value={draftContext.endDate} onChange={(event) => setDraftContext((prev) => ({ ...prev, endDate: event.target.value }))} />
            </label>
            <label>
              Pickup or delivery
              <select value={draftContext.fulfillment} onChange={(event) => setDraftContext((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}>
                <option value="unspecified">Choose</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            <label>
              Job context
              <input value={draftContext.job} onChange={(event) => setDraftContext((prev) => ({ ...prev, job: event.target.value }))} placeholder="Eg: Indoor electrical installation" />
            </label>
            <button type="button" onClick={applyContext}>Apply context</button>
          </div>
          {contextError ? <p className="rental-context-bar__error">{contextError}</p> : null}
          {unresolvedContext.length ? (
            <p className="rental-context-bar__missing">
              Missing: {unresolvedContext.join(", ")}. Set context to verify live availability and delivery charges.
            </p>
          ) : null}
          {isApplyingContext ? (
            <p className="rental-context-bar__updating" role="status">
              <Loader2 size={14} />
              Recalculating availability context…
            </p>
          ) : null}
        </section>

        <section className="rental-discovery-toolbar">
          <div className="rental-discovery-toolbar__search">
            <label htmlFor="rental-search">Search rentals</label>
            <input
              id="rental-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setQueryState((prev) => ({ ...prev, search: searchInput.trim() }));
                }
              }}
              placeholder="Fast path: equipment name, category, capability"
            />
            <button type="button" onClick={() => setQueryState((prev) => ({ ...prev, search: searchInput.trim() }))}>
              Search
            </button>
          </div>
          <div className="rental-discovery-toolbar__actions">
            <button ref={filterButtonRef} type="button" onClick={() => setShowFilters(true)}>
              <Filter size={16} />
              Filters {activeFilterCount ? `(${activeFilterCount})` : ""}
            </button>
            <label>
              Sort
              <select value={queryState.sort} onChange={(event) => setQueryState((prev) => ({ ...prev, sort: event.target.value as SortMode }))}>
                <option value="recommended">Recommended</option>
                <option value="price-low">Daily rate: low to high</option>
                <option value="price-high">Daily rate: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
            <strong aria-live="polite">{filtered.length} results</strong>
          </div>
        </section>

        {isLoading ? (
          <section className="rental-skeleton-grid" aria-label="Loading rentals">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="rental-skeleton-card" />)}
          </section>
        ) : filtered.length ? (
          <section className="demo-rental-grid rental-grid-next">
            {filtered.map((rental) => (
              <RentalTile
                key={rental.id}
                rental={rental}
                href={routeHref(`/rental/${rental.id}${window.location.hash.includes("?") ? `?${window.location.hash.split("?")[1]}` : ""}`)}
                compared={queryState.compare.includes(rental.id)}
                onToggleCompare={onToggleCompare}
                primaryActionLabel={unresolvedContext.length ? "Select dates" : "Check availability"}
              />
            ))}
          </section>
        ) : (
          <section className="rental-empty-state" role="status">
            <AlertTriangle size={20} />
            <h2>No rental results for the current filters</h2>
            <p>
              Review search, category, branch, and date constraints. You can clear one
              restriction, search all branches, or ask AI for alternatives.
            </p>
            <div>
              <button type="button" onClick={clearAllFilters}>Clear all filters</button>
              <button type="button" onClick={() => setQueryState((prev) => ({ ...prev, branch: "" }))}>
                Search all branches
              </button>
              <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Find rental alternatives for ${queryState.job || "my project"} in Jamaica.`)}`)}>
                Ask AI for alternatives
              </a>
            </div>
          </section>
        )}

        {compareItems.length > 0 ? (
          <section className="rental-compare-tray" aria-label="Rental comparison">
            <header>
              <div>
                <Scale size={16} />
                <strong>Compare equipment ({compareItems.length}/{MAX_COMPARE})</strong>
              </div>
              <button type="button" onClick={() => setQueryState((prev) => ({ ...prev, compare: [] }))}>
                Clear all
              </button>
            </header>
            <div className="rental-compare-tray__items">
              {compareItems.map((item) => {
                const keys = getCategoryComparisonKeys(item.category);
                return (
                  <article key={item.id}>
                    <div>
                      <h3>{item.name}</h3>
                      <button type="button" onClick={() => onToggleCompare(item.id)} aria-label={`Remove ${item.name} from comparison`}>
                        <X size={15} />
                      </button>
                    </div>
                    <p>{item.category}</p>
                    <dl>
                      <div><dt>Daily rate</dt><dd>{item.dailyRate ? money(item.dailyRate) : "Set context"}</dd></div>
                      <div><dt>Availability</dt><dd>{statusLabel(item.availability)}</dd></div>
                      {keys.map((key) => (
                        <div key={`${item.id}-${key}`}>
                          <dt>{key}</dt>
                          <dd>{getSpecValue(item, [key])}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </Container>

      {showFilters ? (
        <div className="rental-sheet-overlay" role="presentation" onClick={() => setShowFilters(false)}>
          <section className="rental-sheet" role="dialog" aria-modal="true" aria-label="Rental filters" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Filters</h2>
              <button type="button" onClick={() => setShowFilters(false)}><X size={18} /></button>
            </header>
            <label>
              Category
              <select value={queryState.category} onChange={(event) => setQueryState((prev) => ({ ...prev, category: event.target.value }))}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              Branch
              <select value={queryState.branch} onChange={(event) => setQueryState((prev) => ({ ...prev, branch: event.target.value }))}>
                <option value="">All branches</option>
                {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </label>
            <label>
              Pickup or delivery
              <select value={queryState.fulfillment} onChange={(event) => setQueryState((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}>
                <option value="unspecified">Any</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            <label className="rental-sheet__checkbox">
              <input type="checkbox" checked={queryState.availableNow} onChange={(event) => setQueryState((prev) => ({ ...prev, availableNow: event.target.checked }))} />
              Available now
            </label>
            <footer>
              <button type="button" onClick={clearAllFilters}>Clear all</button>
              <button type="button" onClick={() => setShowFilters(false)}>
                Apply ({filtered.length} results)
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isContextSheetOpen ? (
        <div className="rental-sheet-overlay" role="presentation" onClick={() => setContextSheetOpen(false)}>
          <section className="rental-sheet rental-sheet--context" role="dialog" aria-modal="true" aria-label="Edit rental context" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Rental context</h2>
              <button type="button" onClick={() => setContextSheetOpen(false)}><X size={18} /></button>
            </header>
            <div className="rental-sheet__context-preview">{contextSummary}</div>
            <label>
              Branch
              <select value={draftContext.branch} onChange={(event) => setDraftContext((prev) => ({ ...prev, branch: event.target.value }))}>
                <option value="">Select branch</option>
                {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </label>
            <label>
              Start date
              <input type="date" value={draftContext.startDate} onChange={(event) => setDraftContext((prev) => ({ ...prev, startDate: event.target.value }))} />
            </label>
            <label>
              End date
              <input type="date" value={draftContext.endDate} onChange={(event) => setDraftContext((prev) => ({ ...prev, endDate: event.target.value }))} />
            </label>
            <label>
              Pickup or delivery
              <select value={draftContext.fulfillment} onChange={(event) => setDraftContext((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}>
                <option value="unspecified">Choose</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            <label>
              Project/job context
              <input value={draftContext.job} onChange={(event) => setDraftContext((prev) => ({ ...prev, job: event.target.value }))} placeholder="Describe the work briefly" />
            </label>
            {contextError ? <p className="rental-context-bar__error">{contextError}</p> : null}
            <footer>
              <button type="button" onClick={() => setContextSheetOpen(false)}>Cancel</button>
              <button type="button" onClick={applyContext}>Apply</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function RentalDetailPage({ id }: { id: string }) {
  const rental = getRentalById(id);
  const rentals = getRentals();
  const queryState = readQueryState(getHashPath());
  const [reservation, setReservation] = useState<ReservationDraft>({
    startDate: queryState.startDate,
    endDate: queryState.endDate,
    branch: queryState.branch,
    fulfillment: queryState.fulfillment,
    fullName: "",
    email: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!rental) {
    return (
      <div className="demo-empty">
        <h1>Rental not found</h1>
        <a href={routeHref("/rentals")}>Return to rental fleet</a>
      </div>
    );
  }

  const summary = buildDecisionSummary(rental);
  const rentalDays = daysBetween(reservation.startDate, reservation.endDate);
  const subtotal = rentalDays ? rental.dailyRate * rentalDays : 0;
  const hasContext = Boolean(reservation.startDate && reservation.endDate && reservation.branch);
  const alternatives = getComparableAlternatives(rental, rentals);
  const compareKeys = getCategoryComparisonKeys(rental.category);
  const availabilityText = statusLabel(rental.availability);

  const submitReservation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (reservation.endDate && reservation.startDate && reservation.endDate < reservation.startDate) {
      setError("End date must be on or after start date.");
      return;
    }
    if (!reservation.startDate || !reservation.endDate || !reservation.branch || reservation.fulfillment === "unspecified") {
      setError("Equipment, location, dates, and pickup/delivery are required before requesting reservation.");
      return;
    }
    setError("");
    setSubmitting(true);
    go(`/rental-confirmation?item=${rental.id}`);
  };

  return (
    <div className="demo-page rental-detail-next">
      <Container className="rental-detail-next__container">
        <nav className="rental-detail-next__breadcrumbs">
          <a href={routeHref("/rentals")}>Rentals</a>
          <span>/</span>
          <a href={routeHref(`/rentals${window.location.hash.includes("?") ? `?${window.location.hash.split("?")[1]}` : ""}`)}>Results</a>
          <span>/</span>
          <span>{rental.name}</span>
        </nav>

        <section className="rental-context-bar rental-context-bar--detail">
          <div className="rental-context-bar__summary">
            <span><MapPin size={15} /> {reservation.branch || "Select branch"}</span>
            <span><CalendarDays size={15} /> {reservation.startDate && reservation.endDate ? `${dateFormat.format(new Date(reservation.startDate))} - ${dateFormat.format(new Date(reservation.endDate))}` : "Select dates"}</span>
            <span><Clock3 size={15} /> {getDurationLabel(rentalDays)}</span>
            <span><Truck size={15} /> {reservation.fulfillment === "unspecified" ? "Pickup or delivery" : reservation.fulfillment === "delivery" ? "Delivery" : "Pickup"}</span>
          </div>
          <div className="rental-context-bar__editor rental-context-bar__editor--detail">
            <label>
              Branch
              <select value={reservation.branch} onChange={(event) => setReservation((prev) => ({ ...prev, branch: event.target.value }))}>
                <option value="">Select branch</option>
                {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
              </select>
            </label>
            <label>
              Start date
              <input type="date" value={reservation.startDate} onChange={(event) => setReservation((prev) => ({ ...prev, startDate: event.target.value }))} />
            </label>
            <label>
              End date
              <input type="date" value={reservation.endDate} onChange={(event) => setReservation((prev) => ({ ...prev, endDate: event.target.value }))} />
            </label>
            <label>
              Pickup or delivery
              <select value={reservation.fulfillment} onChange={(event) => setReservation((prev) => ({ ...prev, fulfillment: event.target.value as FulfillmentMode }))}>
                <option value="unspecified">Choose</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rental-detail-next__hero">
          <div className="rental-detail-next__media">
            <img src={rental.image} alt={rental.name} />
          </div>
          <div className="rental-detail-next__summary">
            <small>{rental.category}</small>
            <h1>{rental.name}</h1>
            <p>{rental.description}</p>
            <div className="rental-detail-next__status">
              <CheckCircle2 size={18} />
              <div>
                <strong>{availabilityText}</strong>
                <span>{rental.branchAvailability}</span>
              </div>
            </div>
            <section className="rental-detail-next__decision">
              <h2>Decision summary</h2>
              <dl>
                <div><dt>Best for</dt><dd>{summary.bestFor}</dd></div>
                <div><dt>Key advantage</dt><dd>{summary.keyAdvantage}</dd></div>
                <div><dt>Watch out</dt><dd>{summary.watchOut}</dd></div>
              </dl>
            </section>
            <div className="rental-detail-next__actions">
              <a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Is ${rental.name} suitable for ${queryState.job || "my job"}?`)}`)}>
                <Sparkles size={16} /> Ask about this rental
              </a>
              <a href={routeHref(`/rentals?compare=${rental.id}`)}>
                <Scale size={16} /> Compare
              </a>
            </div>
          </div>
        </section>

        <section className="rental-detail-next__grid">
          <article className="rental-detail-next__card">
            <h2>Availability and pricing</h2>
            <div className="rental-detail-next__rate-grid">
              <div><span>Daily rate</span><strong>{rental.dailyRate ? money(rental.dailyRate) : "Set location/dates"}</strong></div>
              <div><span>Weekly rate</span><strong>{rental.weeklyRate ? money(rental.weeklyRate) : "Set location/dates"}</strong></div>
              <div><span>Monthly rate</span><strong>{rental.monthlyRate ? money(rental.monthlyRate) : "Set location/dates"}</strong></div>
            </div>
            {!hasContext ? (
              <p className="rental-detail-next__notice">
                Select branch and dates to verify live availability, delivery charges, and deposit.
              </p>
            ) : (
              <div className="rental-detail-next__estimate">
                <div><span>Selected duration</span><strong>{getDurationLabel(rentalDays)}</strong></div>
                <div><span>Equipment subtotal</span><strong>{subtotal ? money(subtotal) : "Unavailable"}</strong></div>
                <div><span>Delivery</span><strong>Calculated after branch + address</strong></div>
                <div><span>Deposit</span><strong>{getSpecValue(rental, ["Deposit", "deposit"])}</strong></div>
                <div className="rental-detail-next__estimate-total">
                  <span>Estimated total</span>
                  <strong>{subtotal ? money(subtotal) : "Select valid dates to estimate"}</strong>
                </div>
              </div>
            )}
          </article>

          <article className="rental-detail-next__card">
            <h2>Transportation planner</h2>
            <div className="rental-detail-next__transport">
              <div>
                <strong>Pickup yourself</strong>
                <p>Confirm suitable vehicle, trailer rating, and loading capability before pickup.</p>
              </div>
              <div>
                <strong>Delivery</strong>
                <p>{rentalSupportsDelivery(rental) ? "Delivery appears supported. Final charge depends on location and access." : "Delivery support is not listed for this equipment yet."}</p>
              </div>
              <div>
                <strong>Site access</strong>
                <p>Confirm gate width, delivery hours, unloading area, and surface conditions.</p>
              </div>
            </div>
            <p className="rental-detail-next__disclaimer">
              Transportation guidance is informational. Confirm critical towing and safety requirements with the branch.
            </p>
          </article>

          <article className="rental-detail-next__card">
            <h2>Technical specifications</h2>
            <dl className="rental-detail-next__specs">
              {compareKeys.map((key) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{getSpecValue(rental, [key])}</dd>
                </div>
              ))}
              {Object.entries(rental.specs)
                .filter(([key]) => !compareKeys.includes(key))
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value || "Not provided"}</dd>
                  </div>
                ))}
            </dl>
            <p className="rental-detail-next__disclaimer">
              Exact model may vary. Confirm critical requirements before reservation.
            </p>
          </article>

          <article className="rental-detail-next__card">
            <h2>Alternatives</h2>
            <div className="rental-detail-next__alternatives">
              {alternatives.length ? (
                alternatives.map(({ item, reason }) => (
                  <a key={item.id} href={routeHref(`/rental/${item.id}${window.location.hash.includes("?") ? `?${window.location.hash.split("?")[1]}` : ""}`)}>
                    <strong>{item.name}</strong>
                    <span>{item.dailyRate ? money(item.dailyRate) : "Rate after context"}</span>
                    <em>{reason}</em>
                  </a>
                ))
              ) : (
                <p>No comparable alternatives are currently available in this dataset.</p>
              )}
            </div>
          </article>
        </section>

        <form className="rental-detail-next__reservation" onSubmit={submitReservation}>
          <header>
            <h2>Reservation flow</h2>
            <ol>
              <li className="is-complete">1. Equipment</li>
              <li className={hasContext ? "is-complete" : ""}>2. Location and dates</li>
              <li className={reservation.fulfillment !== "unspecified" ? "is-complete" : ""}>3. Delivery or pickup</li>
              <li>4. Accessories and protection</li>
              <li>5. Customer details</li>
              <li>6. Review</li>
              <li>7. Request reservation</li>
            </ol>
          </header>
          <div className="rental-detail-next__reservation-grid">
            <label>
              Full name
              <input required value={reservation.fullName} onChange={(event) => setReservation((prev) => ({ ...prev, fullName: event.target.value }))} />
            </label>
            <label>
              Email
              <input type="email" required value={reservation.email} onChange={(event) => setReservation((prev) => ({ ...prev, email: event.target.value }))} />
            </label>
            <label>
              Phone
              <input required value={reservation.phone} onChange={(event) => setReservation((prev) => ({ ...prev, phone: event.target.value }))} />
            </label>
          </div>
          {error ? <p className="rental-context-bar__error">{error}</p> : null}
          <p className="rental-detail-next__request-note">
            Reservation requests are submitted pending branch confirmation.
          </p>
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Request reservation"}
          </button>
        </form>
      </Container>
    </div>
  );
}
