import { useState } from "react";
import { createSmartCommercePlatformApi } from "../apiClient";
import type { CommerceProduct, PosAdapterContext } from "../platform";

const getConfiguredContext = (): PosAdapterContext | undefined => {
  const businessAccountId = import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID;
  const providerId = import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID;

  if (!businessAccountId || !providerId) return undefined;

  return {
    businessAccountId,
    providerId,
    requestId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
};

export default function ImageSearchDemo() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<CommerceProduct[]>([]);

  const fetchMatches = async () => {
    const context = getConfiguredContext();

    if (!context) {
      setStatus("error");
      setError(
        "Image matching requires configured business and provider context."
      );
      return;
    }

    setStatus("loading");
    setError("");
    const api = createSmartCommercePlatformApi({ context });
    const result = await api.searchProducts({
      search: "fitting",
      pageSize: 6,
    });

    if (!result.success) {
      setStatus("error");
      setMatches([]);
      setError(result.error.message);
      return;
    }

    setStatus("idle");
    setMatches(result.data.items);
  };

  return (
    <section className="section image-search" id="image-search">
      <div className="section-heading">
        <span className="eyebrow">Find products by picture</span>
        <h2>Identify fittings and parts from connected catalog data</h2>
      </div>
      <div className="image-search-layout">
        <div className="fake-upload">
          <div className="upload-icon">IMG</div>
          <strong>Drop a fitting photo here</strong>
          <p>Results are sourced from the connected provider catalog.</p>
          <button className="deal-button" onClick={() => void fetchMatches()}>
            {status === "loading" ? "Searching..." : "Search connected catalog"}
          </button>
        </div>
        <div className="matched-products">
          {status === "error" && (
            <div className="empty-match">Search unavailable: {error}</div>
          )}
          {!matches.length && status !== "error" && (
            <div className="empty-match">
              Matches will appear here after searching the connected catalog.
            </div>
          )}
          {matches.map((product) => (
            <article className="product-card" key={product.id}>
              <h3>{product.name}</h3>
              <p>{product.description || "Provider product record"}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
