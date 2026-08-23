export type DeliveryDestinationClass = "metro" | "regular" | "rural" | "remote";
export type DeliverySpeed = "standard" | "same_day";

export type DeliveryQuoteInputItem = {
  productId: string;
  quantity: number;
  fulfilmentType?: "sale" | "rental";
};

export type DeliveryOption = {
  provider: "tara" | "knutsford" | "jamaica_post" | "doorway" | "dhl" | "fedex";
  serviceId: string;
  label: string;
  providerCostJmd: number;
  operationsMarkupRate: number;
  operationsMarkupJmd: number;
  customerChargeJmd: number;
  billableWeightLb: number;
  sourceStatus: "published_current" | "published_reference" | "provider_quote_required";
  mode: "door_to_door" | "branch_to_branch" | "post_to_post" | "hybrid" | "provider_quote";
  notes?: string;
};

export type DeliveryQuoteResult =
  | {
      status: "manual_review";
      reasonCode: string;
      message: string;
      options: [];
    }
  | {
      status: "quoted";
      markupRate: number;
      billableWeightLb: number;
      options: DeliveryOption[];
    };

type ApiError = Error & { code?: string; status?: number };

export async function getDeliveryQuote(input: {
  items: DeliveryQuoteInputItem[];
  destinationCountryCode?: string;
  destinationClass?: DeliveryDestinationClass;
  requestedSpeed?: DeliverySpeed;
}) {
  const response = await fetch("/api/delivery-quote", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as { delivery?: DeliveryQuoteResult; error?: { code?: string; message?: string } };
  if (!response.ok || !payload.delivery) {
    const error = new Error(payload.error?.message || "Delivery pricing could not be prepared.") as ApiError;
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload.delivery;
}
