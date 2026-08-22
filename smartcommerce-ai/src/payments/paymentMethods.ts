export type PaymentMethodId =
  | "apple-pay"
  | "google-pay"
  | "click-to-pay"
  | "paypal"
  | "card"
  | "pay-in-store";

export type PaymentMethodGroup = "express" | "wallet" | "standard" | "offline";
export type PaymentCapabilityState = "ready" | "requires-provider" | "unavailable";

export type PaymentMethodDefinition = {
  id: PaymentMethodId;
  label: string;
  shortLabel: string;
  group: PaymentMethodGroup;
  description: string;
  settlementRail: "primary-acquirer" | "paypal" | "store-pos";
  confirmationMode: "webhook" | "webhook-or-query" | "pos-confirmation";
  capability: PaymentCapabilityState;
};

/**
 * Customer-facing methods are intentionally separated from settlement rails.
 * Multiple wallet methods should normally settle through one primary acquirer.
 * Capability remains `requires-provider` until a real merchant processor and
 * server-side confirmation path are configured.
 */
export const paymentMethods: readonly PaymentMethodDefinition[] = [
  {
    id: "apple-pay",
    label: "Apple Pay",
    shortLabel: "Apple Pay",
    group: "express",
    description: "Fast wallet checkout on eligible Apple devices and supported cards.",
    settlementRail: "primary-acquirer",
    confirmationMode: "webhook-or-query",
    capability: "requires-provider",
  },
  {
    id: "google-pay",
    label: "Google Pay",
    shortLabel: "Google Pay",
    group: "express",
    description: "Fast wallet checkout when the customer and processor are eligible.",
    settlementRail: "primary-acquirer",
    confirmationMode: "webhook-or-query",
    capability: "requires-provider",
  },
  {
    id: "click-to-pay",
    label: "Click to Pay",
    shortLabel: "Click to Pay",
    group: "express",
    description: "Recognised-card checkout through participating card networks.",
    settlementRail: "primary-acquirer",
    confirmationMode: "webhook-or-query",
    capability: "requires-provider",
  },
  {
    id: "paypal",
    label: "PayPal",
    shortLabel: "PayPal",
    group: "wallet",
    description: "Pay using a PayPal account or eligible funding source.",
    settlementRail: "paypal",
    confirmationMode: "webhook-or-query",
    capability: "requires-provider",
  },
  {
    id: "card",
    label: "Debit or credit card",
    shortLabel: "Card",
    group: "standard",
    description: "Secure card payment through the selected merchant acquirer.",
    settlementRail: "primary-acquirer",
    confirmationMode: "webhook-or-query",
    capability: "requires-provider",
  },
  {
    id: "pay-in-store",
    label: "Pay in store & pick up",
    shortLabel: "Pay in store",
    group: "offline",
    description: "Reserve the order, then complete payment at the selected branch before collection.",
    settlementRail: "store-pos",
    confirmationMode: "pos-confirmation",
    capability: "requires-provider",
  },
] as const;

export function paymentMethodsByGroup(group: PaymentMethodGroup) {
  return paymentMethods.filter((method) => method.group === group);
}
