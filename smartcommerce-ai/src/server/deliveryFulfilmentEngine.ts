export const SMARTCOMMERCE_DELIVERY_MARKUP_RATE = 0.20;

export type DeliveryProvider =
  | "tara"
  | "knutsford"
  | "jamaica_post"
  | "doorway"
  | "dhl"
  | "fedex";

export type DeliveryService = {
  provider: DeliveryProvider;
  serviceId: string;
  label: string;
  mode: "door_to_door" | "branch_to_branch" | "post_to_post" | "hybrid" | "provider_quote";
  domestic: boolean;
  enabledForAutomaticQuote: boolean;
  sourceStatus: "published_current" | "published_reference" | "provider_quote_required";
  baseRateJmd?: number;
  includedWeightLb?: number;
  additionalWeightRateJmdPerLb?: number;
  sameDay?: boolean;
  notes?: string;
};

export type DeliveryItem = {
  id: string;
  quantity: number;
  fulfilmentType?: "sale" | "rental";
  parcelEligible?: boolean;
  weightLb?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  oversized?: boolean;
  hazardous?: boolean;
  fragileFreight?: boolean;
};

export type DeliveryQuoteRequest = {
  items: DeliveryItem[];
  destinationCountryCode?: string;
  destinationClass?: "metro" | "regular" | "rural" | "remote";
  requestedSpeed?: "standard" | "same_day";
};

export type AutomatedDeliveryOption = {
  provider: DeliveryProvider;
  serviceId: string;
  label: string;
  providerCostJmd: number;
  operationsMarkupRate: number;
  operationsMarkupJmd: number;
  customerChargeJmd: number;
  billableWeightLb: number;
  sourceStatus: DeliveryService["sourceStatus"];
  mode: DeliveryService["mode"];
  notes?: string;
};

export type DeliveryQuoteResult =
  | {
      status: "manual_review";
      reasonCode:
        | "RENTAL_REQUIRES_MANUAL_PRICING"
        | "LARGE_OR_SPECIAL_ITEM_REQUIRES_MANUAL_PRICING"
        | "MISSING_TRUSTED_FREIGHT_DATA"
        | "NO_AUTOMATED_PROVIDER_AVAILABLE"
        | "INTERNATIONAL_PROVIDER_QUOTE_REQUIRED";
      message: string;
      options: [];
    }
  | {
      status: "quoted";
      markupRate: number;
      billableWeightLb: number;
      options: AutomatedDeliveryOption[];
    };

// Provider rate configuration must remain data, not checkout UI logic.
// TARA and Knutsford values are based on their published Jamaica courier structures.
// Jamaica Post is retained as a configurable reference until Total Tools confirms a current business rate card.
// Doorway, DHL and FedEx remain provider-quote adapters until authoritative contracted/live rates are available.
export const DELIVERY_SERVICES: DeliveryService[] = [
  {
    provider: "tara",
    serviceId: "tara_next_day_metro",
    label: "TARA Next Day - Metro",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 640,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 95,
  },
  {
    provider: "tara",
    serviceId: "tara_next_day_regular",
    label: "TARA Next Day - Door to Door",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 1650,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 95,
  },
  {
    provider: "tara",
    serviceId: "tara_next_day_rural",
    label: "TARA Next Day - Rural",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 2875,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 95,
  },
  {
    provider: "tara",
    serviceId: "tara_next_day_remote",
    label: "TARA Next Day - Remote",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 4600,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 95,
  },
  {
    provider: "tara",
    serviceId: "tara_same_day_metro",
    label: "TARA Same Day - Metro",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 820,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 95,
    sameDay: true,
  },
  {
    provider: "tara",
    serviceId: "tara_same_day_regular",
    label: "TARA Same Day - Door to Door",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 2000,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 95,
    sameDay: true,
  },
  {
    provider: "tara",
    serviceId: "tara_branch_to_branch",
    label: "TARA Branch to Branch",
    mode: "branch_to_branch",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 700,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 50,
  },
  {
    provider: "knutsford",
    serviceId: "knutsford_courier",
    label: "Knutsford Express Courier",
    mode: "branch_to_branch",
    domestic: true,
    enabledForAutomaticQuote: true,
    sourceStatus: "published_current",
    baseRateJmd: 700,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 55,
    notes: "Dimensional weight uses L x W x H / 800; charge the greater of actual or dimensional weight.",
  },
  {
    provider: "jamaica_post",
    serviceId: "zipmail_post_to_post",
    label: "Jamaica Post Zip Mail - Post to Post",
    mode: "post_to_post",
    domestic: true,
    enabledForAutomaticQuote: false,
    sourceStatus: "published_reference",
    baseRateJmd: 500,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 50,
    notes: "Reference rate only until Total Tools confirms a current Jamaica Post business rate card.",
  },
  {
    provider: "jamaica_post",
    serviceId: "zipmail_door_to_door",
    label: "Jamaica Post Zip Mail - Door to Door",
    mode: "door_to_door",
    domestic: true,
    enabledForAutomaticQuote: false,
    sourceStatus: "published_reference",
    baseRateJmd: 1000,
    includedWeightLb: 10,
    additionalWeightRateJmdPerLb: 50,
    notes: "Reference rate only until Total Tools confirms a current Jamaica Post business rate card.",
  },
  {
    provider: "doorway",
    serviceId: "doorway_live_quote",
    label: "Doorway Express",
    mode: "provider_quote",
    domestic: true,
    enabledForAutomaticQuote: false,
    sourceStatus: "provider_quote_required",
  },
  {
    provider: "dhl",
    serviceId: "dhl_live_quote",
    label: "DHL",
    mode: "provider_quote",
    domestic: false,
    enabledForAutomaticQuote: false,
    sourceStatus: "provider_quote_required",
  },
  {
    provider: "fedex",
    serviceId: "fedex_live_quote",
    label: "FedEx",
    mode: "provider_quote",
    domestic: false,
    enabledForAutomaticQuote: false,
    sourceStatus: "provider_quote_required",
  },
];

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function dimensionalWeightLb(item: DeliveryItem) {
  if (!item.lengthIn || !item.widthIn || !item.heightIn) return undefined;
  return (item.lengthIn * item.widthIn * item.heightIn) / 800;
}

function itemBillableWeightLb(item: DeliveryItem) {
  if (!Number.isFinite(item.weightLb) || Number(item.weightLb) <= 0) return undefined;
  const actual = Number(item.weightLb);
  const dimensional = dimensionalWeightLb(item);
  return Math.max(actual, dimensional || 0) * Math.max(1, Math.floor(item.quantity || 1));
}

function manualReviewReason(request: DeliveryQuoteRequest): DeliveryQuoteResult | undefined {
  if (!request.items.length) {
    return {
      status: "manual_review",
      reasonCode: "MISSING_TRUSTED_FREIGHT_DATA",
      message: "Delivery pricing requires item freight data before a courier quote can be trusted.",
      options: [],
    };
  }

  if (request.items.some((item) => item.fulfilmentType === "rental")) {
    return {
      status: "manual_review",
      reasonCode: "RENTAL_REQUIRES_MANUAL_PRICING",
      message: "Rental delivery and collection require manual logistics review and pricing.",
      options: [],
    };
  }

  if (request.items.some((item) => item.oversized || item.hazardous || item.fragileFreight || item.parcelEligible === false)) {
    return {
      status: "manual_review",
      reasonCode: "LARGE_OR_SPECIAL_ITEM_REQUIRES_MANUAL_PRICING",
      message: "Large, oversized or special-handling items require manual delivery review and pricing.",
      options: [],
    };
  }

  if (request.items.some((item) => item.parcelEligible !== true || itemBillableWeightLb(item) === undefined)) {
    return {
      status: "manual_review",
      reasonCode: "MISSING_TRUSTED_FREIGHT_DATA",
      message: "Automatic courier pricing is only available when every item has trusted parcel eligibility and freight measurements.",
      options: [],
    };
  }

  return undefined;
}

function providerCost(service: DeliveryService, billableWeightLb: number) {
  if (service.baseRateJmd === undefined) return undefined;
  const included = service.includedWeightLb || 0;
  const additional = Math.max(0, Math.ceil(billableWeightLb - included));
  return roundCurrency(service.baseRateJmd + additional * (service.additionalWeightRateJmdPerLb || 0));
}

function serviceMatchesRequest(service: DeliveryService, request: DeliveryQuoteRequest) {
  const international = (request.destinationCountryCode || "JM").toUpperCase() !== "JM";
  if (international) return !service.domestic;
  if (!service.domestic) return false;

  if (request.requestedSpeed === "same_day" && !service.sameDay) return false;
  if (request.requestedSpeed !== "same_day" && service.sameDay) return false;

  if (service.provider !== "tara" || service.mode === "branch_to_branch") return true;
  const zone = request.destinationClass || "regular";
  return service.serviceId.includes(zone);
}

export function quoteDelivery(request: DeliveryQuoteRequest): DeliveryQuoteResult {
  const manual = manualReviewReason(request);
  if (manual) return manual;

  const billableWeightLb = roundCurrency(
    request.items.reduce((sum, item) => sum + (itemBillableWeightLb(item) || 0), 0),
  );

  const international = (request.destinationCountryCode || "JM").toUpperCase() !== "JM";
  if (international) {
    return {
      status: "manual_review",
      reasonCode: "INTERNATIONAL_PROVIDER_QUOTE_REQUIRED",
      message: "International parcels require a live DHL/FedEx provider quote before checkout.",
      options: [],
    };
  }

  const options = DELIVERY_SERVICES
    .filter((service) => service.enabledForAutomaticQuote)
    .filter((service) => serviceMatchesRequest(service, request))
    .map((service): AutomatedDeliveryOption | undefined => {
      const cost = providerCost(service, billableWeightLb);
      if (cost === undefined) return undefined;
      const markup = roundCurrency(cost * SMARTCOMMERCE_DELIVERY_MARKUP_RATE);
      return {
        provider: service.provider,
        serviceId: service.serviceId,
        label: service.label,
        providerCostJmd: cost,
        operationsMarkupRate: SMARTCOMMERCE_DELIVERY_MARKUP_RATE,
        operationsMarkupJmd: markup,
        customerChargeJmd: roundCurrency(cost + markup),
        billableWeightLb,
        sourceStatus: service.sourceStatus,
        mode: service.mode,
        notes: service.notes,
      };
    })
    .filter((value): value is AutomatedDeliveryOption => Boolean(value))
    .sort((left, right) => left.customerChargeJmd - right.customerChargeJmd);

  if (!options.length) {
    return {
      status: "manual_review",
      reasonCode: "NO_AUTOMATED_PROVIDER_AVAILABLE",
      message: "No verified automated courier rate is available for this shipment. Delivery must be reviewed manually.",
      options: [],
    };
  }

  return {
    status: "quoted",
    markupRate: SMARTCOMMERCE_DELIVERY_MARKUP_RATE,
    billableWeightLb,
    options,
  };
}
