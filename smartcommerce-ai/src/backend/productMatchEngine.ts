import type {
  CommerceProduct,
  PlatformApiResult,
  PosAdapter,
  PosAdapterContext,
} from "../platform";
import type {
  ProductMatchCandidate,
  ProductMatchRequest,
  ProductMatchResult,
  ProductVisualAnalysis,
} from "../types/productMatch";

export type {
  ProductMatchCandidate,
  ProductMatchRequest,
  ProductMatchResult,
  ProductVisualAnalysis,
} from "../types/productMatch";

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (value: unknown) =>
  normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);

function productSearchText(product: CommerceProduct) {
  const attributes = Object.entries(product.attributes || {}).flatMap(([key, value]) => [key, value]);
  const metadata = Object.entries(product.metadata || {}).flatMap(([key, value]) => [key, value]);

  return normalize([
    product.name,
    product.sku,
    product.barcode,
    product.brand,
    product.description,
    ...(product.categoryIds || []),
    ...(product.tags || []),
    ...attributes,
    ...metadata,
  ].join(" "));
}

function scoreCandidate(product: CommerceProduct, analysis: ProductVisualAnalysis) {
  const haystack = productSearchText(product);
  const reasons: string[] = [];
  let score = 0;
  let possible = 0;

  const addExactSignal = (label: string, value: string, weight: number) => {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return;
    possible += weight;
    if (haystack.includes(normalizedValue)) {
      score += weight;
      reasons.push(`${label} matches: ${value}`);
    }
  };

  addExactSignal("Brand", analysis.brand, 0.25);
  addExactSignal("Model", analysis.model, 0.35);
  addExactSignal("Product type", analysis.productType, 0.2);

  const secondary = [
    ...analysis.visibleText,
    ...analysis.attributes,
    ...analysis.searchTerms,
  ];
  const secondaryTokens = Array.from(new Set(secondary.flatMap(tokens))).slice(0, 20);
  if (secondaryTokens.length) {
    possible += 0.2;
    const matched = secondaryTokens.filter((token) => haystack.includes(token));
    if (matched.length) {
      const portion = matched.length / secondaryTokens.length;
      score += 0.2 * portion;
      reasons.push(`Visual clues match: ${matched.slice(0, 5).join(", ")}`);
    }
  }

  const normalizedScore = possible > 0 ? score / possible : 0;
  const visionReliability = Math.max(0.2, Math.min(1, analysis.confidence || 0));
  return {
    confidence: Math.max(
      0,
      Math.min(0.99, normalizedScore * (0.75 + visionReliability * 0.25))
    ),
    reasons,
  };
}

function outputText(response: OpenAIResponse) {
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

async function analyzeImage(imageDataUrl: string): Promise<ProductVisualAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for Product Match.");
  }

  if (!imageDataUrl.startsWith("data:image/")) {
    throw new Error("Product Match requires an image data URL.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-5-mini",
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Analyze product, tool, part, and equipment photos for catalogue matching. Extract only clues visible or strongly supported by the image. Never invent a brand, model, specification, label, or text. If uncertain, use an empty string or array and lower confidence.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Identify the product type and any visible brand, model, label text, physical attributes, and concise catalogue search terms. Return structured data only.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "product_visual_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              productType: { type: "string" },
              brand: { type: "string" },
              model: { type: "string" },
              visibleText: { type: "array", items: { type: "string" } },
              attributes: { type: "array", items: { type: "string" } },
              searchTerms: { type: "array", items: { type: "string" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              notes: { type: "string" },
            },
            required: [
              "productType",
              "brand",
              "model",
              "visibleText",
              "attributes",
              "searchTerms",
              "confidence",
              "notes"
            ],
          },
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Vision analysis failed with HTTP ${response.status}.`
    );
  }

  const text = outputText(payload);
  if (!text) throw new Error("Vision analysis returned no structured output.");

  return JSON.parse(text) as ProductVisualAnalysis;
}

function searchQueries(analysis: ProductVisualAnalysis) {
  const queries = [
    [analysis.brand, analysis.model].filter(Boolean).join(" "),
    [analysis.brand, analysis.productType].filter(Boolean).join(" "),
    analysis.model,
    analysis.productType,
    ...analysis.searchTerms,
    ...analysis.visibleText,
  ]
    .map((query) => query.trim())
    .filter(Boolean);

  return Array.from(new Set(queries)).slice(0, 8);
}

export async function runGroundedProductMatch(
  adapter: PosAdapter,
  context: PosAdapterContext,
  request: ProductMatchRequest
): Promise<PlatformApiResult<ProductMatchResult>> {
  try {
    const [analysis, branchesResult] = await Promise.all([
      analyzeImage(request.imageDataUrl),
      adapter.listBranches(context),
    ]);
    const branchNames = branchesResult.success
      ? Object.fromEntries(branchesResult.data.map((branch) => [String(branch.id), branch.name]))
      : {};
    const queries = searchQueries(analysis);

    if (!queries.length) {
      return {
        success: true,
        data: {
          analysis,
          candidates: [],
          branchNames,
          needsClarification: true,
          clarification:
            "I could not identify enough visible product details. Try a clearer photo of the whole item, label, model plate, or packaging.",
        },
      };
    }

    const searchResults = await Promise.all(
      queries.map((search) =>
        adapter.searchProducts(context, {
          search,
          branchId: request.branchId,
          pageSize: 12,
        })
      )
    );

    const products = new Map<string, CommerceProduct>();
    for (const result of searchResults) {
      if (!result.success) continue;
      for (const product of result.data.items) products.set(String(product.id), product);
    }

    const ranked = Array.from(products.values())
      .map((product) => ({ product, ...scoreCandidate(product, analysis) }))
      .filter((candidate) => candidate.confidence > 0.05)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    const candidates: ProductMatchCandidate[] = [];
    for (const candidate of ranked) {
      const availability = await adapter.getInventoryAvailability(context, {
        productId: candidate.product.id,
        branchId: request.branchId,
        quantity: 1,
      });
      candidates.push({
        ...candidate,
        availability: availability.success ? availability.data : [],
      });
    }

    const top = candidates[0];
    const needsClarification = !top || top.confidence < 0.45;

    return {
      success: true,
      data: {
        analysis,
        candidates,
        branchNames,
        needsClarification,
        clarification: needsClarification
          ? "The image does not support a reliable exact match yet. Try a closer photo of the brand or model label, or add another angle."
          : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "PRODUCT_MATCH_FAILED",
        message: error instanceof Error ? error.message : "Product Match failed.",
      },
    };
  }
}
