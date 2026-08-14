import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImageUp,
  ScanSearch,
  Store,
  UserCheck,
} from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import Container from "../components/shared/Container";
import toolsImage from "../assets/smartcommerce-tools-optimized.jpg";
import { matchProductPhoto, prepareProductMatchImage } from "../lib/productMatch";
import { go, routeHref } from "../lib/router";
import type { CommerceProduct, InventoryAvailability } from "../platform";
import type { ProductMatchResult } from "../types/productMatch";

type Props = { onAdd: (id: string) => void };
type MatchState = "idle" | "preparing" | "scanning" | "results" | "error";

function productImage(product: CommerceProduct) {
  return [...(product.images || [])]
    .sort((a, b) => (a.position || 0) - (b.position || 0))[0]?.url;
}

function productPrice(product: CommerceProduct) {
  for (const pricing of product.pricing || []) {
    const value = pricing.salePrice ?? pricing.listPrice ?? pricing.commercialPrice;
    if (value !== undefined) return { value, currency: pricing.currency || "JMD" };
  }
  return null;
}

function formatPrice(product: CommerceProduct) {
  const price = productPrice(product);
  if (!price) return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-JM", {
      style: "currency",
      currency: price.currency,
      maximumFractionDigits: 2,
    }).format(price.value);
  } catch {
    return `${price.currency} ${price.value.toLocaleString("en-JM")}`;
  }
}

function availabilityLabel(
  availability: InventoryAvailability[],
  branchNames: Record<string, string>
) {
  const available = availability.filter((item) =>
    ["in_stock", "low_stock"].includes(item.status)
  );
  if (!availability.length) return "Availability not returned by provider";
  if (!available.length) return "No confirmed branch stock";

  const labels = available.map((item) =>
    item.branchId
      ? branchNames[String(item.branchId)] || `Branch ${item.branchId}`
      : "Available"
  );
  return Array.from(new Set(labels)).join(", ");
}

export default function ProductMatchPage({ onAdd }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(toolsImage);
  const [state, setState] = useState<MatchState>("idle");
  const [result, setResult] = useState<ProductMatchResult | null>(null);
  const [error, setError] = useState("");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setState("preparing");
    setError("");
    setResult(null);

    try {
      const imageDataUrl = await prepareProductMatchImage(file);
      setPreview(imageDataUrl);
      setState("scanning");
      const response = await matchProductPhoto(imageDataUrl);
      if (!response.success) {
        setError(response.error.message);
        setState("error");
        return;
      }
      setResult(response.data);
      setState("results");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Product Match failed.");
      setState("error");
    }
  }

  const top = result?.candidates[0];
  const alternatives = result?.candidates.slice(1) || [];
  const analysisSummary = result
    ? [result.analysis.brand, result.analysis.model, result.analysis.productType]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="demo-page match-page">
      <section className="demo-page-hero match-hero">
        <Container>
          <span>SmartCommerce Vision</span>
          <h1>Show Us the Product.</h1>
          <p>
            Upload a tool, part, label, or equipment photo. SmartCommerce reads visible clues,
            searches the connected catalogue, and ranks real candidates.
          </p>
        </Container>
      </section>

      <Container className="match-layout">
        <section className="match-upload">
          <div className="match-preview">
            <img src={preview} alt="Product Match preview" />
            {(state === "preparing" || state === "scanning") && (
              <div className="match-scanner" role="status">
                <ScanSearch size={38} />
                <strong>
                  {state === "preparing" ? "Preparing image..." : "Reading product clues..."}
                </strong>
                <span>
                  {state === "preparing"
                    ? "Optimizing the photo for secure matching"
                    : "Then checking those clues against connected catalogue data"}
                </span>
              </div>
            )}
          </div>

          <h2>Snap it. Match it.</h2>
          <p>
            For the strongest match, include the full product and any brand, label, model plate,
            or packaging text you can see.
          </p>
          <div className="match-upload__actions">
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={state === "preparing" || state === "scanning"}
            >
              <ImageUp size={18} /> Upload Photo
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={state === "preparing" || state === "scanning"}
            >
              <Camera size={18} /> Use Camera
            </button>
          </div>
          <input ref={uploadRef} type="file" accept="image/*" onChange={choose} hidden />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={choose}
            hidden
          />
        </section>

        <section className="match-results" aria-live="polite">
          {state === "idle" && (
            <div className="match-waiting">
              <ScanSearch size={36} />
              <h2>Your closest matches appear here.</h2>
              <p>No sample result is shown. Every result comes from the uploaded image and connected catalogue.</p>
            </div>
          )}

          {state === "error" && (
            <div className="match-waiting">
              <AlertCircle size={36} />
              <h2>Product Match is unavailable.</h2>
              <p>{error}</p>
            </div>
          )}

          {state === "results" && result && (
            <>
              <header>
                <div>
                  {result.needsClarification ? <AlertCircle size={22} /> : <CheckCircle2 size={22} />}
                  <span>{result.needsClarification ? "Possible match" : "Match complete"}</span>
                </div>
                {top && <strong>{Math.round(top.confidence * 100)}% catalogue match</strong>}
              </header>

              {analysisSummary && (
                <div className="match-availability">
                  <ScanSearch size={20} />
                  <div>
                    <strong>Visible clues</strong>
                    <span>{analysisSummary}</span>
                  </div>
                </div>
              )}

              {result.needsClarification && result.clarification && (
                <div className="match-availability">
                  <AlertCircle size={20} />
                  <div>
                    <strong>Help us narrow it down</strong>
                    <span>{result.clarification}</span>
                  </div>
                </div>
              )}

              {top ? (
                <article className="match-best">
                  {productImage(top.product) ? (
                    <img src={productImage(top.product)} alt={top.product.name} />
                  ) : (
                    <div className="match-product-placeholder" aria-hidden="true">
                      <ScanSearch size={32} />
                    </div>
                  )}
                  <div>
                    <span>{result.needsClarification ? "Closest candidate" : "Closest match"}</span>
                    <h2>{top.product.name}</h2>
                    <p>{top.product.brand || top.product.sku || "Connected catalogue item"}</p>
                    <strong>{formatPrice(top.product)}</strong>
                    {top.reasons.length > 0 && (
                      <ul>
                        {top.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    )}
                    <div>
                      {top.product.purchasable && (
                        <button type="button" onClick={() => onAdd(String(top.product.id))}>
                          Add to Cart
                        </button>
                      )}
                      <a href={routeHref(`/product/${top.product.id}`)}>View Product</a>
                    </div>
                  </div>
                </article>
              ) : (
                <div className="match-waiting">
                  <AlertCircle size={36} />
                  <h2>No catalogue candidate found.</h2>
                  <p>{result.clarification || "Try another angle or a closer label photo."}</p>
                </div>
              )}

              {top && (
                <div className="match-availability">
                  <Store size={20} />
                  <div>
                    <strong>Provider availability</strong>
                    <span>{availabilityLabel(top.availability, result.branchNames)}</span>
                  </div>
                </div>
              )}

              {alternatives.length > 0 && (
                <>
                  <h3>Other possible matches</h3>
                  <div className="match-alternatives">
                    {alternatives.map((candidate) => (
                      <a href={routeHref(`/product/${candidate.product.id}`)} key={candidate.product.id}>
                        {productImage(candidate.product) ? (
                          <img src={productImage(candidate.product)} alt={candidate.product.name} />
                        ) : null}
                        <span>{candidate.product.name}</span>
                        <strong>{Math.round(candidate.confidence * 100)}% match</strong>
                      </a>
                    ))}
                  </div>
                </>
              )}

              {top && (
                <button
                  className="match-verify"
                  type="button"
                  onClick={() =>
                    go(
                      `/assistant?prompt=${encodeURIComponent(
                        `Help me verify whether ${top.product.name} is the right match for my photo.`
                      )}`
                    )
                  }
                >
                  <UserCheck size={18} /> Ask SmartCommerce to verify
                </button>
              )}
            </>
          )}
        </section>
      </Container>
    </div>
  );
}
