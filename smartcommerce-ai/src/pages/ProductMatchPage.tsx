import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImageUp,
  RefreshCw,
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
import type { ProductMatchCandidate, ProductMatchResult } from "../types/productMatch";

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

function confidenceLabel(value: number, needsClarification: boolean) {
  if (needsClarification) return "Needs another clue";
  if (value >= 0.85) return "Strong catalogue evidence";
  if (value >= 0.65) return "Good catalogue evidence";
  return "Possible catalogue evidence";
}

function evidenceStrength(value: number) {
  if (value >= 0.85) return "High evidence";
  if (value >= 0.65) return "Moderate evidence";
  return "Limited evidence";
}

function productMatchAdvisorPrompt(
  result: ProductMatchResult,
  candidate: ProductMatchCandidate,
) {
  const analysis = result.analysis;
  const visualClues = [
    analysis.productType ? `product type: ${analysis.productType}` : "",
    analysis.brand ? `brand clue: ${analysis.brand}` : "",
    analysis.model ? `model clue: ${analysis.model}` : "",
    ...analysis.visibleText.slice(0, 6).map((value) => `visible text: ${value}`),
    ...analysis.attributes.slice(0, 6).map((value) => `visible attribute: ${value}`),
  ].filter(Boolean);
  const reasons = candidate.reasons.slice(0, 4);
  const evidenceState = confidenceLabel(candidate.confidence, result.needsClarification);

  return [
    "This is a Product Match follow-up. Do not claim you can see or re-analyze the original photo in this chat; use only the supplied visual-analysis clues and connected catalogue facts.",
    `Catalogue candidate: ${candidate.product.name}.`,
    `Product Match evidence state: ${evidenceState}.`,
    visualClues.length ? `Supplied visual clues: ${visualClues.join("; ")}.` : "Supplied visual clues were limited.",
    reasons.length ? `Why Product Match ranked it: ${reasons.join("; ")}.` : "Product Match returned no additional ranking reasons.",
    result.clarification ? `Product Match still needs clarification: ${result.clarification}` : "",
    "Help me assess whether this catalogue candidate is consistent with those supplied clues, explain what supports the match, and tell me the single most useful additional clue that would confirm or rule it out. Use connected catalogue data only and do not invent unseen photo details.",
  ].filter(Boolean).join("\n").slice(0, 2200);
}

export default function ProductMatchPage({ onAdd }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(toolsImage);
  const [state, setState] = useState<MatchState>("idle");
  const [result, setResult] = useState<ProductMatchResult | null>(null);
  const [error, setError] = useState("");
  const [refining, setRefining] = useState(false);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const priorAnalysis = result?.analysis;
    const isRefinement = Boolean(priorAnalysis);
    setRefining(isRefinement);
    setState("preparing");
    setError("");
    if (!isRefinement) setResult(null);

    try {
      const imageDataUrl = await prepareProductMatchImage(file);
      setPreview(imageDataUrl);
      setState("scanning");
      const response = await matchProductPhoto(imageDataUrl, undefined, priorAnalysis);
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
    } finally {
      setRefining(false);
    }
  }

  const top = result?.candidates[0];
  const alternatives = result?.candidates.slice(1) || [];
  const analysisSummary = result
    ? [result.analysis.brand, result.analysis.model, result.analysis.productType]
        .filter(Boolean)
        .join(" · ")
    : "";
  const evidence = result
    ? Array.from(
        new Set([
          ...result.analysis.visibleText,
          ...result.analysis.attributes,
        ].filter(Boolean))
      ).slice(0, 8)
    : [];

  return (
    <div className="demo-page match-page sc-match-next">
      <section className="sc-match-next__hero">
        <Container>
          <span><ScanSearch size={15} /> Product Match</span>
          <h1>Show SmartCommerce what you need.</h1>
          <p>
            Take a photo of a tool, part, label, model plate, or package. We read
            visible clues, search the connected catalogue, and show the closest
            real matches.
          </p>
        </Container>
      </section>

      <Container className="sc-match-next__layout">
        <section className="sc-match-next__capture" aria-label="Product photo">
          <div className="sc-match-next__preview">
            <img src={preview} alt="Product Match preview" />
            {(state === "preparing" || state === "scanning") && (
              <div className="sc-match-next__scanner" role="status">
                <ScanSearch size={38} />
                <strong>
                  {state === "preparing"
                    ? "Preparing your photo…"
                    : refining
                      ? "Combining the new clues…"
                      : "Reading visible clues…"}
                </strong>
                <span>
                  {state === "preparing"
                    ? "Optimizing the image for secure matching"
                    : refining
                      ? "Refining the existing candidates without discarding the earlier evidence"
                      : "Checking those clues against the connected catalogue"}
                </span>
              </div>
            )}
          </div>

          <div className="sc-match-next__capture-copy">
            <span>Best results</span>
            <h2>{result ? "Add a different angle or label." : "Include the label if you can."}</h2>
            <p>
              {result
                ? "A second photo can refine the same match. Conflicting brand or model clues reduce confidence instead of being ignored."
                : "Brand names, model numbers, packaging text, fittings, ports, and full-product shape can all improve the match."}
            </p>
          </div>

          <div className="sc-match-next__capture-actions">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={state === "preparing" || state === "scanning"}
            >
              <Camera size={18} /> {result ? "Add another photo" : "Use camera"}
            </button>
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={state === "preparing" || state === "scanning"}
            >
              <ImageUp size={18} /> {result ? "Upload another angle" : "Upload photo"}
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

        <section className="sc-match-next__results" aria-live="polite">
          {state === "idle" && (
            <div className="sc-match-next__empty">
              <ScanSearch size={36} />
              <h2>Your real catalogue matches will appear here.</h2>
              <p>
                No sample product or invented confidence score is shown before
                you upload a photo.
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="sc-match-next__empty is-error">
              <AlertCircle size={36} />
              <h2>We couldn’t complete the match.</h2>
              <p>{error}</p>
              <button type="button" onClick={() => cameraRef.current?.click()}>
                <RefreshCw size={17} /> Try another photo
              </button>
            </div>
          )}

          {state === "results" && result && (
            <>
              <header className="sc-match-next__result-header">
                <div>
                  {result.needsClarification ? (
                    <AlertCircle size={21} />
                  ) : (
                    <CheckCircle2 size={21} />
                  )}
                  <span>
                    {top
                      ? confidenceLabel(top.confidence, result.needsClarification)
                      : "No catalogue match"}
                  </span>
                </div>
                {top ? (
                  <strong>{evidenceStrength(top.confidence)}</strong>
                ) : null}
              </header>

              {(analysisSummary || evidence.length > 0 || result.analysis.notes) && (
                <section className="sc-match-next__evidence">
                  <div>
                    <ScanSearch size={19} />
                    <div>
                      <span>What SmartCommerce could see · {result.evidenceImages} photo{result.evidenceImages === 1 ? "" : "s"} combined</span>
                      <strong>{analysisSummary || "Visual product clues"}</strong>
                    </div>
                  </div>
                  {evidence.length > 0 ? (
                    <div className="sc-match-next__evidence-chips">
                      {evidence.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  ) : null}
                  {result.analysis.notes ? <p>{result.analysis.notes}</p> : null}
                </section>
              )}

              {result.needsClarification && result.clarification ? (
                <section className="sc-match-next__clarification">
                  <AlertCircle size={20} />
                  <div>
                    <strong>One more clue would help.</strong>
                    <p>{result.clarification}</p>
                    <button type="button" onClick={() => cameraRef.current?.click()}>
                      <Camera size={16} /> Add another photo
                    </button>
                  </div>
                </section>
              ) : null}

              {top ? (
                <article className="sc-match-next__best">
                  <div className="sc-match-next__best-image">
                    {productImage(top.product) ? (
                      <img src={productImage(top.product)} alt={top.product.name} />
                    ) : (
                      <ScanSearch size={36} aria-hidden="true" />
                    )}
                  </div>
                  <div className="sc-match-next__best-copy">
                    <span>{result.needsClarification ? "Closest candidate" : "Best match"}</span>
                    <h2>{top.product.name}</h2>
                    <p>{top.product.brand || top.product.sku || "Connected catalogue item"}</p>
                    <strong className="sc-match-next__price">{formatPrice(top.product)}</strong>

                    {top.reasons.length > 0 ? (
                      <div className="sc-match-next__reasons">
                        <span>Why this ranked first</span>
                        <ul>
                          {top.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    <div className="sc-match-next__best-actions">
                      {top.product.purchasable ? (
                        <button type="button" onClick={() => onAdd(String(top.product.id))}>
                          Add to cart
                        </button>
                      ) : null}
                      <a href={routeHref(`/product/${top.product.id}`)}>View product</a>
                      {top.product.rentable ? (
                        <a href={routeHref(`/rentals?q=${encodeURIComponent(top.product.name)}`)}>
                          Find rental options
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="is-secondary"
                        onClick={() =>
                          go(
                            `/assistant?prompt=${encodeURIComponent(
                              productMatchAdvisorPrompt(result, top)
                            )}`
                          )
                        }
                      >
                        <UserCheck size={16} /> Ask AI about this match
                      </button>
                    </div>
                  </div>
                </article>
              ) : (
                <div className="sc-match-next__empty">
                  <AlertCircle size={36} />
                  <h2>No connected catalogue candidate was strong enough.</h2>
                  <p>{result.clarification || "Try another angle or a closer label photo."}</p>
                  <button type="button" onClick={() => cameraRef.current?.click()}>
                    <RefreshCw size={17} /> Add another photo
                  </button>
                </div>
              )}

              {top ? (
                <section className="sc-match-next__availability">
                  <Store size={19} />
                  <div>
                    <span>Connected availability</span>
                    <strong>{availabilityLabel(top.availability, result.branchNames)}</strong>
                  </div>
                </section>
              ) : null}

              {alternatives.length > 0 ? (
                <section className="sc-match-next__alternatives">
                  <header>
                    <span>Other possibilities</span>
                    <strong>Compare the visual evidence before choosing.</strong>
                  </header>
                  <div>
                    {alternatives.map((candidate) => (
                      <a
                        href={routeHref(`/product/${candidate.product.id}`)}
                        key={candidate.product.id}
                      >
                        <div>
                          {productImage(candidate.product) ? (
                            <img
                              src={productImage(candidate.product)}
                              alt={candidate.product.name}
                            />
                          ) : (
                            <ScanSearch size={24} aria-hidden="true" />
                          )}
                        </div>
                        <span>{candidate.product.name}</span>
                        <strong>{confidenceLabel(candidate.confidence, result.needsClarification)}</strong>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      </Container>
    </div>
  );
}
