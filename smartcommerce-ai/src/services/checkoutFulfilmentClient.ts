export type CheckoutDeliveryAddress = {
  label?: string;
  type: "home" | "business" | "job_site";
  siteName?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode?: string;
  countryCode: "JM";
  notes?: string;
};

export type BoundFulfilment =
  | {
      mode: "pickup";
      status: "bound";
      deliveryMinor: 0;
      boundAt: string;
    }
  | {
      mode: "delivery";
      status: "manual_review";
      reviewId?: string;
      reasonCode: string;
      message: string;
      address: CheckoutDeliveryAddress;
      destinationClass?: "metro" | "regular" | "rural" | "remote" | null;
      zone?: any;
      requestedSpeed: "standard" | "same_day";
      requestedServiceId?: string | null;
      requestedAt: string;
    }
  | {
      mode: "delivery";
      status: "bound";
      provider: string;
      serviceId: string;
      serviceLabel: string;
      serviceMode: string;
      providerCostJmd: number;
      operationsMarkupRate: number;
      operationsMarkupJmd: number;
      customerChargeJmd: number;
      billableWeightLb: number;
      address: CheckoutDeliveryAddress;
      destinationClass: "metro" | "regular" | "rural" | "remote";
      zone?: any;
      requestedSpeed: "standard" | "same_day";
      sourceStatus: string;
      boundAt: string;
    };

export type FulfilmentBindingResult = {
  fulfilment: BoundFulfilment;
  zone?: any;
  quote: {
    id: string;
    deliveryMinor: number;
    totalMinor: number;
  };
};

type ErrorPayload = { error?: { code?: string; message?: string } };

export async function bindCheckoutFulfilment(input: {
  quoteId: string;
  mode: "pickup" | "delivery";
  serviceId?: string;
  requestedSpeed?: "standard" | "same_day";
  address?: CheckoutDeliveryAddress;
}) {
  const response = await fetch("/api/checkout-fulfilment", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as FulfilmentBindingResult & ErrorPayload;
  if (!response.ok && response.status !== 202) {
    const error = new Error(payload.error?.message || "Fulfilment could not be finalized.") as Error & { code?: string; status?: number };
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload as FulfilmentBindingResult;
}
