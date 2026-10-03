import {
  ChevronRight,
  PackageSearch,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { getProducts } from "../data/products";
import { getCommerceDataMode } from "../data/providerMode";
import { loadBranchCatalogue } from "../lib/branchCatalogue";
import {
  buildPartTree,
  buildPartsFitmentIndex,
  getAssemblies,
  searchPartsFitment,
  type EquipmentModelFitment,
  type FitmentPartNode,
  type FitmentSearchHit,
} from "../lib/partsFitment";
import { routeHref } from "../lib/router";
import { getShoppingBranch } from "../lib/shoppingBranch";
import type { Product } from "../types";

type Actions = {
  wishlist: string[];
  compared: string[];
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onAdd: (id: string) => void;
};

type LoadStatus = "ready" | "loading" | "error";

type Selection = {
  brand: string;
  equipmentType: string;
  model: string;
  variant: string;
  assembly: string;
};

const emptySelection: Selection = {
  brand: "",
  equipmentType: "",
  model: "",
  variant: "",
  assembly: "",
};

function hashParams() {
  const [, query = ""] = window.location.hash.slice(1).split("?");
  return new URLSearchParams(query);
}

function initialSelection(): Selection {
  const params = hashParams();
  return {
    brand: params.get("brand") || "",
    equipmentType: params.get("type") || "",
    model: params.get("model") || "",
    variant: params.get("variant") || "",
    assembly: params.get("assembly") || "",
  };
}

function initialQuery() {
  return hashParams().get("q") || "";
}

function money(product: Product) {
  if (!(product.price > 0)) return "Price not supplied";
  try {
    return new Intl.NumberFormat("en-JM", {
      style: "currency",
      currency: product.currency || "JMD",
      maximumFractionDigits: 0,
    }).format(product.price);
  } catch {
    return `${product.currency || "JMD"} ${product.price.toLocaleString()}`;
  }
}

function sameModel(fitment: EquipmentModelFitment, selection: Selection) {
  return (
    fitment.brand === selection.brand &&
    fitment.equipmentType === selection.equipmentType &&
    fitment.model === selection.model &&
    String(fitment.variant || "") === selection.variant
  );
}

function PartTreeNode({
  node,
  depth,
  onAdd,
}: {
  node: FitmentPartNode;
  depth: number;
  onAdd: (id: string) => void;
}) {
  const product = node.part.product;
  const blockedReason = product.purchaseBlockedReason || (product.purchasable === false ? "Not available for purchase" : "");
  const label = depth > 0 ? "Subpart" : node.part.assembly;

  return (
    <div className="sc-part-tree-node" data-depth={Math.min(depth, 3)}>
      <article className="sc-part-row">
        <a className="sc-part-row__image" href={routeHref(`/product/${product.id}`)} aria-label={`View ${product.name}`}>
          <img src={product.image} alt="" loading="lazy" decoding="async" />
        </a>
        <div className="sc-part-row__body">
          <div className="sc-part-row__eyebrow">
            <span>{label}</span>
            {node.part.reference ? <span>Ref {node.part.reference}</span> : null}
          </div>
          <h3><a href={routeHref(`/product/${product.id}`)}>{product.name}</a></h3>
          <p><strong>Part no.</strong> {node.part.partNumber}<span aria-hidden="true"> · </span><strong>SKU</strong> {product.sku}</p>
          <small>{product.stockStatus}</small>
        </div>
        <div className="sc-part-row__commerce">
          <strong>{money(product)}</strong>
          <a href={routeHref(`/product/${product.id}`)}>View details</a>
          <button
            type="button"
            disabled={Boolean(blockedReason)}
            title={blockedReason || "Add this part to cart"}
            onClick={() => { if (!blockedReason) onAdd(product.id); }}
          >
            {blockedReason ? "Unavailable" : "Add to cart"}
          </button>
        </div>
      </article>
      {node.children.length ? (
        <div className="sc-part-tree-children" aria-label={`Subparts for ${product.name}`}>
          {node.children.map((child) => (
            <PartTreeNode
              key={`${child.part.product.id}:${child.part.partNumber}`}
              node={child}
              depth={depth + 1}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PartsFinderPage({ actions }: { actions: Actions }) {
  const connected = getCommerceDataMode() === "connected";
  const branch = getShoppingBranch();
  const [products, setProducts] = useState<Product[]>(() => connected ? [] : getProducts());
  const [status, setStatus] = useState<LoadStatus>(connected ? "loading" : "ready");
  const [loadError, setLoadError] = useState("");
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [query, setQuery] = useState(initialQuery);
  const [draftQuery, setDraftQuery] = useState(initialQuery);

  useEffect(() => {
    let active = true;
    if (!connected) {
      setProducts(getProducts());
      setStatus("ready");
      setLoadError("");
      return () => { active = false; };
    }

    setStatus("loading");
    setLoadError("");
    void loadBranchCatalogue(branch)
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setProducts([]);
          setStatus("error");
          setLoadError(result.message);
          return;
        }
        setProducts(result.data.products);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
        setStatus("error");
        setLoadError("The connected provider catalogue could not be loaded.");
      });

    return () => { active = false; };
  }, [branch, connected]);

  const index = useMemo(() => buildPartsFitmentIndex(products), [products]);
  const selectedBrandModels = useMemo(
    () => index.models.filter((item) => item.brand === selection.brand),
    [index.models, selection.brand],
  );
  const equipmentTypes = useMemo(
    () => Array.from(new Set(selectedBrandModels.map((item) => item.equipmentType))).sort(),
    [selectedBrandModels],
  );
  const selectedTypeModels = useMemo(
    () => selectedBrandModels.filter((item) => item.equipmentType === selection.equipmentType),
    [selectedBrandModels, selection.equipmentType],
  );
  const selectedFitment = useMemo(
    () => index.models.find((item) => sameModel(item, selection)),
    [index.models, selection],
  );
  const assemblies = useMemo(
    () => selectedFitment ? getAssemblies(selectedFitment) : [],
    [selectedFitment],
  );
  const visibleParts = useMemo(
    () => selectedFitment
      ? selectedFitment.parts.filter((part) => !selection.assembly || part.assembly === selection.assembly)
      : [],
    [selectedFitment, selection.assembly],
  );
  const partTree = useMemo(() => buildPartTree(visibleParts), [visibleParts]);
  const searchHits = useMemo(() => searchPartsFitment(index, query), [index, query]);

  useEffect(() => {
    if (!selection.brand) return;
    if (index.brands.some((item) => item.brand === selection.brand)) return;
    setSelection(emptySelection);
  }, [index.brands, selection.brand]);

  useEffect(() => {
    const raw = window.location.hash.slice(1) || "/parts";
    const [path] = raw.split("?");
    if (path !== "/parts") return;
    const params = hashParams();
    ["brand", "type", "model", "variant", "assembly", "q"].forEach((key) => params.delete(key));
    if (selection.brand) params.set("brand", selection.brand);
    if (selection.equipmentType) params.set("type", selection.equipmentType);
    if (selection.model) params.set("model", selection.model);
    if (selection.variant) params.set("variant", selection.variant);
    if (selection.assembly) params.set("assembly", selection.assembly);
    if (query) params.set("q", query);
    const nextQuery = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/parts${nextQuery ? `?${nextQuery}` : ""}`,
    );
  }, [query, selection]);

  const chooseBrand = (brand: string) => {
    setQuery("");
    setDraftQuery("");
    setSelection({ ...emptySelection, brand });
  };

  const chooseEquipmentType = (equipmentType: string) => {
    setQuery("");
    setDraftQuery("");
    setSelection((current) => ({
      ...current,
      equipmentType,
      model: "",
      variant: "",
      assembly: "",
    }));
  };

  const chooseModel = (fitment: EquipmentModelFitment) => {
    setQuery("");
    setDraftQuery("");
    setSelection({
      brand: fitment.brand,
      equipmentType: fitment.equipmentType,
      model: fitment.model,
      variant: fitment.variant || "",
      assembly: "",
    });
  };

  const chooseSearchHit = (hit: FitmentSearchHit) => {
    setQuery("");
    setDraftQuery("");
    setSelection({
      brand: hit.brand,
      equipmentType: hit.equipmentType,
      model: hit.model,
      variant: hit.variant || "",
      assembly: hit.kind === "part" ? hit.assembly : "",
    });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draftQuery.trim());
  };

  const resetToBrands = () => {
    setQuery("");
    setDraftQuery("");
    setSelection(emptySelection);
  };

  const renderEmptyCatalogue = () => (
    <div className="demo-empty sc-parts-finder__empty">
      <Wrench size={28} aria-hidden="true" />
      <h2>No governed equipment-to-part relationships are published yet.</h2>
      <p>
        SmartCommerce will show a brand, equipment model, assembly, part, or subpart only when that relationship exists in approved catalogue data.
      </p>
      <div>
        <a href={routeHref("/products")}>Shop all products</a>
        <a href={routeHref("/assistant?prompt=Help%20me%20identify%20the%20right%20equipment%20part")}>Ask SmartCommerce AI</a>
      </div>
    </div>
  );

  return (
    <div className="demo-page sc-parts-finder">
      <section className="demo-page-hero sc-parts-finder__hero">
        <Container>
          <span>SmartCommerce equipment & parts</span>
          <h1>Find the right part from the machine it belongs to.</h1>
          <p>
            Choose a brand, equipment family, and exact model. SmartCommerce then narrows the catalogue to governed assemblies, parts, and subparts without guessing fitment.
          </p>
          <div className={`sc-data-mode ${connected ? "is-connected" : "is-preview"}`}>
            <span aria-hidden="true" />
            <strong>{connected ? "Connected provider mode" : "Catalogue preview mode"}</strong>
            <small>
              {connected
                ? `Product price and ${branch === "Online" ? "catalogue" : `${branch} availability`} remain sourced through the configured provider path.`
                : "Preview mode does not claim live price, stock, or equipment fitment that the provider has not supplied."}
            </small>
          </div>
        </Container>
      </section>

      <Container size="wide" className="sc-parts-finder__workspace">
        <div className="sc-parts-finder__search-row">
          <form role="search" onSubmit={submitSearch}>
            <Search size={20} aria-hidden="true" />
            <label className="tt-sr-only" htmlFor="parts-finder-search">Search equipment models or parts</label>
            <input
              id="parts-finder-search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search brand, model, OEM part number, SKU, assembly, or part name"
              autoComplete="off"
            />
            <button type="submit">Search</button>
          </form>
          <a href={routeHref(`/assistant?prompt=${encodeURIComponent(draftQuery ? `Help me find the correct part for ${draftQuery}` : "Help me find the correct equipment part")}`)}>
            <Sparkles size={17} aria-hidden="true" /> Ask AI
          </a>
        </div>

        <nav className="sc-parts-breadcrumbs" aria-label="Parts finder path">
          <button type="button" className={!selection.brand ? "is-current" : undefined} onClick={resetToBrands}>Brands</button>
          {selection.brand ? <><ChevronRight size={15} aria-hidden="true" /><button type="button" className={!selection.equipmentType ? "is-current" : undefined} onClick={() => chooseBrand(selection.brand)}>{selection.brand}</button></> : null}
          {selection.equipmentType ? <><ChevronRight size={15} aria-hidden="true" /><button type="button" className={!selection.model ? "is-current" : undefined} onClick={() => chooseEquipmentType(selection.equipmentType)}>{selection.equipmentType}</button></> : null}
          {selectedFitment ? <><ChevronRight size={15} aria-hidden="true" /><button type="button" className="is-current" onClick={() => chooseModel(selectedFitment)}>{selectedFitment.model}{selectedFitment.variant ? ` · ${selectedFitment.variant}` : ""}</button></> : null}
        </nav>

        {status === "loading" ? (
          <div className="demo-empty sc-parts-finder__empty"><PackageSearch size={28} aria-hidden="true" /><h2>Checking the connected catalogue…</h2><p>Loading provider products, fitment attributes, pricing, and your current branch context.</p></div>
        ) : status === "error" ? (
          <div className="demo-empty sc-parts-finder__empty"><PackageSearch size={28} aria-hidden="true" /><h2>The parts catalogue could not be loaded.</h2><p>{loadError}</p><div><a href={routeHref("/products")}>Return to products</a><a href={routeHref("/assistant?prompt=Help%20me%20find%20a%20part")}>Ask AI for help</a></div></div>
        ) : query ? (
          <section className="sc-parts-search-results" aria-labelledby="parts-search-results-title">
            <div className="sc-parts-section-heading">
              <div><span>Search</span><h2 id="parts-search-results-title">Matches for “{query}”</h2></div>
              <button type="button" onClick={() => { setQuery(""); setDraftQuery(""); }}>Clear search</button>
            </div>
            {searchHits.length ? (
              <div className="sc-parts-search-results__grid">
                {searchHits.map((hit) => (
                  <button type="button" key={hit.key} onClick={() => chooseSearchHit(hit)}>
                    <span>{hit.kind === "part" ? "Part" : "Equipment model"}</span>
                    <strong>{hit.label}</strong>
                    <small>{hit.detail}</small>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="demo-empty sc-parts-finder__empty"><h2>No governed fitment match found.</h2><p>Try the brand or exact model number, OEM part number, SKU, assembly name, or a shorter search.</p></div>
            )}
          </section>
        ) : !index.models.length ? renderEmptyCatalogue() : !selection.brand ? (
          <section aria-labelledby="parts-brand-title">
            <div className="sc-parts-section-heading"><div><span>Step 1</span><h2 id="parts-brand-title">Choose a brand</h2></div><p>{index.brands.length} brands with governed equipment or part relationships</p></div>
            <div className="sc-parts-choice-grid">
              {index.brands.map((brand) => (
                <button type="button" className="sc-parts-choice-card" key={brand.brand} onClick={() => chooseBrand(brand.brand)}>
                  <span>Brand</span>
                  <strong>{brand.brand}</strong>
                  <small>{brand.equipmentTypes} equipment {brand.equipmentTypes === 1 ? "family" : "families"} · {brand.models} {brand.models === 1 ? "model" : "models"} · {brand.parts} mapped {brand.parts === 1 ? "part" : "parts"}</small>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        ) : !selection.equipmentType ? (
          <section aria-labelledby="parts-type-title">
            <div className="sc-parts-section-heading"><div><span>Step 2</span><h2 id="parts-type-title">Choose {selection.brand} equipment</h2></div><p>Select the machine family before narrowing to a model.</p></div>
            <div className="sc-parts-choice-grid">
              {equipmentTypes.map((equipmentType) => {
                const models = selectedBrandModels.filter((item) => item.equipmentType === equipmentType);
                const parts = new Set(models.flatMap((item) => item.parts.map((part) => part.product.id)));
                return (
                  <button type="button" className="sc-parts-choice-card" key={equipmentType} onClick={() => chooseEquipmentType(equipmentType)}>
                    <span>Equipment</span>
                    <strong>{equipmentType}</strong>
                    <small>{models.length} {models.length === 1 ? "model" : "models"} · {parts.size} mapped {parts.size === 1 ? "part" : "parts"}</small>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : !selectedFitment ? (
          <section aria-labelledby="parts-model-title">
            <div className="sc-parts-section-heading"><div><span>Step 3</span><h2 id="parts-model-title">Choose the exact model</h2></div><p>{selection.brand} · {selection.equipmentType}</p></div>
            <div className="sc-parts-model-grid">
              {selectedTypeModels.map((fitment) => (
                <button type="button" className="sc-parts-model-card" key={fitment.key} onClick={() => chooseModel(fitment)}>
                  <span>{fitment.machineProducts.length ? "Catalogued equipment" : "Fitment model"}</span>
                  <strong>{fitment.model}</strong>
                  {fitment.variant ? <em>{fitment.variant}</em> : null}
                  <small>{fitment.parts.length} mapped {fitment.parts.length === 1 ? "part" : "parts"} · {getAssemblies(fitment).length} {getAssemblies(fitment).length === 1 ? "assembly" : "assemblies"}</small>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="sc-parts-model-workspace" aria-labelledby="parts-model-workspace-title">
            <div className="sc-parts-model-summary">
              <div>
                <span>{selectedFitment.brand} · {selectedFitment.equipmentType}</span>
                <h2 id="parts-model-workspace-title">{selectedFitment.model}{selectedFitment.variant ? ` · ${selectedFitment.variant}` : ""}</h2>
                <p>{selectedFitment.parts.length} governed mapped {selectedFitment.parts.length === 1 ? "part" : "parts"} across {assemblies.length} {assemblies.length === 1 ? "assembly" : "assemblies"}.</p>
              </div>
              {selectedFitment.machineProducts[0] ? (
                <a href={routeHref(`/product/${selectedFitment.machineProducts[0].id}`)}>View equipment</a>
              ) : null}
            </div>

            {selectedFitment.parts.length ? (
              <div className="sc-parts-model-layout">
                <aside className="sc-parts-assemblies" aria-label="Equipment assemblies">
                  <strong>Assemblies</strong>
                  <button type="button" className={!selection.assembly ? "is-active" : undefined} onClick={() => setSelection((current) => ({ ...current, assembly: "" }))}>
                    <span>All parts</span><small>{selectedFitment.parts.length}</small>
                  </button>
                  {assemblies.map((assembly) => (
                    <button type="button" className={selection.assembly === assembly.name ? "is-active" : undefined} key={assembly.name} onClick={() => setSelection((current) => ({ ...current, assembly: assembly.name }))}>
                      <span>{assembly.name}</span><small>{assembly.count}</small>
                    </button>
                  ))}
                </aside>

                <div className="sc-parts-list">
                  <div className="sc-parts-list__heading">
                    <div><span>{selection.assembly || "All assemblies"}</span><h3>{visibleParts.length} {visibleParts.length === 1 ? "part" : "parts"}</h3></div>
                    <small>Only provider-backed product price and branch availability are shown.</small>
                  </div>
                  {partTree.map((node) => (
                    <PartTreeNode
                      key={`${node.part.product.id}:${node.part.partNumber}`}
                      node={node}
                      depth={0}
                      onAdd={actions.onAdd}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="demo-empty sc-parts-finder__empty">
                <Wrench size={28} aria-hidden="true" />
                <h2>This model is governed, but its spare-part fitment has not been published yet.</h2>
                <p>SmartCommerce will not infer or invent compatible parts. The relationship can be added through approved POS, manufacturer, or TT AI catalogue enrichment.</p>
                <div><a href={routeHref(`/assistant?prompt=${encodeURIComponent(`Help me find parts for ${selectedFitment.brand} ${selectedFitment.model}`)}`)}>Ask AI for help</a><a href={routeHref("/products")}>Search all products</a></div>
              </div>
            )}
          </section>
        )}
      </Container>
    </div>
  );
}
