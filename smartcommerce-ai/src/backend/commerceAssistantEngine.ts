import type {
  CommerceProduct,
  PlatformApiResult,
  PosAdapter,
  PosAdapterContext,
  RentalAsset,
} from "../platform";

export type CommerceAssistantRequest = {
  prompt: string;
  branchId?: string;
  customerId?: string;
};

export type CommerceAssistantResult = {
  response: string;
  recommendedProducts: CommerceProduct[];
  recommendedRentals: RentalAsset[];
  nextActions: string[];
};

type AssistantPlan = {
  intent:
    | "product_search"
    | "job_guidance"
    | "comparison"
    | "rental"
    | "repair"
    | "commercial"
    | "unknown";
  customerGoal: string;
  needsClarification: boolean;
  clarificationQuestion: string;
  productSearchQueries: string[];
  wantsRentals: boolean;
  constraints: string[];
};

type RecommendationPlan = {
  response: string;
  productIds: string[];
  rentalIds: string[];
  nextActions: string[];
};

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

const model = () => process.env.OPENAI_COMMERCE_MODEL || "gpt-5-mini";

function outputText(response: OpenAIResponse) {
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

async function structuredResponse<T>(
  developerInstruction: string,
  userText: string,
  name: string,
  schema: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for SmartCommerce AI.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model(),
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: developerInstruction }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userText }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `SmartCommerce AI failed with HTTP ${response.status}.`);
  }
  const text = outputText(payload);
  if (!text) throw new Error("SmartCommerce AI returned no structured output.");
  return JSON.parse(text) as T;
}

async function planRequest(prompt: string) {
  return structuredResponse<AssistantPlan>(
    [
      "You are the planning layer for SmartCommerce, a tool/equipment commerce assistant.",
      "Understand the customer's actual job, shopping, rental, repair, comparison, or commercial intent.",
      "Ask one concise clarification only when a missing fact is genuinely required to make a safe/useful recommendation (for example generator load, breaker requirement, machine capability, or an ambiguous compatibility constraint).",
      "Do not ask unnecessary questions when the customer names an exact product/model or the request can be searched directly.",
      "Create short catalogue search queries using product nouns, brands, models, and specifications; never put conversational filler in search queries.",
      "Do not invent product availability, price, stock, model numbers, or provider capabilities.",
    ].join(" "),
    prompt,
    "smartcommerce_request_plan",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        intent: {
          type: "string",
          enum: [
            "product_search",
            "job_guidance",
            "comparison",
            "rental",
            "repair",
            "commercial",
            "unknown"
          ],
        },
        customerGoal: { type: "string" },
        needsClarification: { type: "boolean" },
        clarificationQuestion: { type: "string" },
        productSearchQueries: { type: "array", items: { type: "string" }, maxItems: 5 },
        wantsRentals: { type: "boolean" },
        constraints: { type: "array", items: { type: "string" }, maxItems: 10 },
      },
      required: [
        "intent",
        "customerGoal",
        "needsClarification",
        "clarificationQuestion",
        "productSearchQueries",
        "wantsRentals",
        "constraints"
      ],
    }
  );
}

function productFacts(product: CommerceProduct) {
  return {
    id: String(product.id),
    name: product.name,
    sku: product.sku || null,
    brand: product.brand || null,
    description: product.description || null,
    pricing: product.pricing || [],
    purchasable: product.purchasable ?? null,
    rentable: product.rentable ?? null,
    repairable: product.repairable ?? null,
    attributes: product.attributes || {},
  };
}

function rentalFacts(rental: RentalAsset) {
  return {
    id: String(rental.id),
    name: rental.name || null,
    productId: rental.productId || null,
    branchId: rental.branchId || null,
    status: rental.status,
    ratePlans: rental.ratePlans || [],
    attributes: rental.attributes || {},
  };
}

async function recommend(
  prompt: string,
  plan: AssistantPlan,
  products: CommerceProduct[],
  rentals: RentalAsset[]
) {
  return structuredResponse<RecommendationPlan>(
    [
      "You are the recommendation layer for SmartCommerce.",
      "You may use ONLY facts present in the supplied candidate data. Never invent stock, availability, prices, specifications, brands, model numbers, rental status, or capabilities.",
      "Select productIds and rentalIds only from IDs supplied in the candidate JSON.",
      "If the candidates do not support a reliable recommendation, say so clearly and recommend a refinement or human/provider check instead of guessing.",
      "Keep the customer-facing response concise, useful, and practical. Explain the key reason for the recommendation when the data supports it.",
      "nextActions should be short machine-readable actions such as view_products, view_rentals, refine_request, start_repair, commercial_support, compare_options, or check_availability.",
    ].join(" "),
    JSON.stringify({
      customerPrompt: prompt,
      plan,
      products: products.map(productFacts),
      rentals: rentals.map(rentalFacts),
    }),
    "smartcommerce_recommendation",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        response: { type: "string" },
        productIds: { type: "array", items: { type: "string" }, maxItems: 5 },
        rentalIds: { type: "array", items: { type: "string" }, maxItems: 5 },
        nextActions: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["response", "productIds", "rentalIds", "nextActions"],
    }
  );
}

const isUnsupported = (result: PlatformApiResult<unknown>) =>
  !result.success &&
  ["POS_ADAPTER_CAPABILITY_UNSUPPORTED", "PLATFORM_ADAPTER_UNSUPPORTED"].includes(result.error.code);

export async function runGroundedCommerceAssistant(
  adapter: PosAdapter,
  context: PosAdapterContext,
  input: CommerceAssistantRequest
): Promise<PlatformApiResult<CommerceAssistantResult>> {
  try {
    const prompt = input.prompt.trim();
    if (!prompt) {
      return {
        success: false,
        error: { code: "ASSISTANT_PROMPT_REQUIRED", message: "Tell SmartCommerce what you need help with." },
      };
    }

    const plan = await planRequest(prompt);
    if (plan.needsClarification && plan.clarificationQuestion.trim()) {
      return {
        success: true,
        data: {
          response: plan.clarificationQuestion.trim(),
          recommendedProducts: [],
          recommendedRentals: [],
          nextActions: ["answer_clarification"],
        },
      };
    }

    const queries = Array.from(
      new Set(plan.productSearchQueries.map((query) => query.trim()).filter(Boolean))
    ).slice(0, 5);

    const productResults = await Promise.all(
      queries.map((search) =>
        adapter.searchProducts(context, {
          search,
          branchId: input.branchId,
          pageSize: 8,
        })
      )
    );

    const productMap = new Map<string, CommerceProduct>();
    for (const result of productResults) {
      if (!result.success) {
        if (isUnsupported(result)) continue;
        return result as PlatformApiResult<CommerceAssistantResult>;
      }
      for (const product of result.data.items) productMap.set(String(product.id), product);
    }

    let rentals: RentalAsset[] = [];
    if (plan.wantsRentals || plan.intent === "rental") {
      const rentalResult = await adapter.listRentalAssets(context, {
        branchId: input.branchId,
        pageSize: 12,
      });
      if (rentalResult.success) rentals = rentalResult.data.items;
      else if (!isUnsupported(rentalResult)) {
        return rentalResult as PlatformApiResult<CommerceAssistantResult>;
      }
    }

    const products = Array.from(productMap.values()).slice(0, 20);

    if (!products.length && !rentals.length) {
      const routeAction =
        plan.intent === "repair"
          ? "start_repair"
          : plan.intent === "commercial"
            ? "commercial_support"
            : plan.intent === "rental"
              ? "view_rentals"
              : "refine_request";
      return {
        success: true,
        data: {
          response:
            plan.intent === "repair"
              ? "I understand this as a repair request, but I do not have connected product or repair data to verify the equipment yet. Add the make/model and fault details in the repair flow."
              : plan.intent === "commercial"
                ? "I understand this as a commercial request. The connected catalogue did not return enough items to build a grounded recommendation, so the next step is a structured commercial enquiry."
                : "The connected provider did not return enough catalogue or rental data for me to recommend something reliably. Try a more specific product, model, specification, or job requirement.",
          recommendedProducts: [],
          recommendedRentals: [],
          nextActions: [routeAction],
        },
      };
    }

    const recommendation = await recommend(prompt, plan, products, rentals);
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const rentalById = new Map(rentals.map((rental) => [String(rental.id), rental]));

    return {
      success: true,
      data: {
        response: recommendation.response,
        recommendedProducts: recommendation.productIds
          .map((id) => productById.get(id))
          .filter((product): product is CommerceProduct => Boolean(product)),
        recommendedRentals: recommendation.rentalIds
          .map((id) => rentalById.get(id))
          .filter((rental): rental is RentalAsset => Boolean(rental)),
        nextActions: recommendation.nextActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "COMMERCE_ASSISTANT_FAILED",
        message: error instanceof Error ? error.message : "SmartCommerce AI failed.",
      },
    };
  }
}
