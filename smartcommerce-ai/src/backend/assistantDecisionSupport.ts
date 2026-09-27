import type { CommerceProduct, RentalAsset } from "../platform/contracts.js";
import type { AssistantRecommendationEvidence } from "./platformBackendTypes.js";
import type { AssistantUnderstanding } from "./assistantIntelligenceEngine.js";

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "another", "because", "before", "being", "between",
  "could", "does", "from", "have", "help", "instead", "into", "need", "needs", "only", "please", "show",
  "something", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "want",
  "what", "when", "where", "which", "with", "would", "your",
]);

const normalize = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const meaningfulTokens = (value: unknown) => normalize(value)
  .split(/\s+/)
  .filter((token) => token.length > 3 && !STOP_WORDS.has(token));

function requestTokens(understanding: AssistantUnderstanding) {
  return Array.from(new Set([
    ...meaningfulTokens(understanding.job),
    ...understanding.productQueries.flatMap(meaningfulTokens),
    ...understanding.rentalQueries.flatMap(meaningfulTokens),
    ...understanding.requiredSpecs.flatMap(meaningfulTokens),
    ...understanding.constraints.flatMap(meaningfulTokens),
  ])).slice(0, 40);
}

function productText(product: CommerceProduct) {
  return normalize([
    product.name,
    product.brand,
    product.sku,
    product.barcode,
    product.description,
    ...(product.tags || []),
    ...Object.entries(product.attributes || {}).flatMap(([key, value]) => [key, value]),
  ].join(" "));
}

function rentalText(rental: RentalAsset) {
  return normalize([
    rental.name,
    rental.assetTag,
    rental.serialNumber,
    rental.status,
    ...Object.entries(rental.attributes || {}).flatMap(([key, value]) => [key, value]),
  ].join(" "));
}

function relevantAttributes(
  attributes: Record<string, string | number | boolean | null> | undefined,
  tokens: string[],
) {
  if (!attributes) return [];
  return Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .filter(([key, value]) => {
      const factText = normalize(`${key} ${String(value)}`);
      return tokens.some((token) => factText.includes(token));
    })
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function previewRecord(metadata: CommerceProduct["metadata"] | RentalAsset["metadata"]) {
  return metadata?.source === "preview_catalogue" || metadata?.liveVerified === false;
}

export function buildProductRecommendationEvidence(
  product: CommerceProduct,
  understanding: AssistantUnderstanding,
): AssistantRecommendationEvidence {
  const tokens = requestTokens(understanding);
  const text = productText(product);
  const matchedTerms = tokens.filter((token) => text.includes(token)).slice(0, 4);
  const matchingAttributes = relevantAttributes(product.attributes, tokens);
  const fitReasons: string[] = [];
  const cautions: string[] = [];

  if (matchedTerms.length) fitReasons.push(`Matches request terms: ${matchedTerms.join(", ")}.`);
  if (matchingAttributes.length) fitReasons.push(`Relevant catalogue specification${matchingAttributes.length === 1 ? "" : "s"}: ${matchingAttributes.join("; ")}.`);
  if (understanding.intent === "rent" && product.rentable) fitReasons.push("The catalogue marks this product as rentable.");
  if (understanding.intent !== "rent" && product.purchasable) fitReasons.push("The catalogue marks this product as purchasable.");

  const preview = previewRecord(product.metadata);
  if (preview) cautions.push("Preview catalogue record — live branch stock and availability are not verified.");
  if (!product.pricing?.length) cautions.push("No provider price is available on this catalogue record.");

  return {
    entityType: "product",
    entityId: product.id,
    fitReasons: fitReasons.slice(0, 3),
    matchingAttributes,
    cautions: cautions.slice(0, 2),
    sourceMode: preview ? "preview" : "connected",
  };
}

export function buildRentalRecommendationEvidence(
  rental: RentalAsset,
  understanding: AssistantUnderstanding,
): AssistantRecommendationEvidence {
  const tokens = requestTokens(understanding);
  const text = rentalText(rental);
  const matchedTerms = tokens.filter((token) => text.includes(token)).slice(0, 4);
  const matchingAttributes = relevantAttributes(rental.attributes, tokens);
  const fitReasons: string[] = [];
  const cautions: string[] = [];

  if (matchedTerms.length) fitReasons.push(`Matches request terms: ${matchedTerms.join(", ")}.`);
  if (matchingAttributes.length) fitReasons.push(`Relevant rental specification${matchingAttributes.length === 1 ? "" : "s"}: ${matchingAttributes.join("; ")}.`);
  if (rental.status === "available") fitReasons.push("The provider currently lists this rental asset as available.");

  const preview = previewRecord(rental.metadata);
  if (preview) cautions.push("Preview rental record — live branch/date availability is not verified.");
  if (rental.status !== "available") cautions.push("Exact rental availability still needs branch and date verification.");

  return {
    entityType: "rental",
    entityId: rental.id,
    fitReasons: fitReasons.slice(0, 3),
    matchingAttributes,
    cautions: Array.from(new Set(cautions)).slice(0, 2),
    sourceMode: preview ? "preview" : "connected",
  };
}
