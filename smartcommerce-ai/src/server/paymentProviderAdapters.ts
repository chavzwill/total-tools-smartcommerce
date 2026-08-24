import type { PaymentMethodId } from "./paymentSettlement.js";
import { paypalPaymentAdapter } from "./paypalPaymentAdapter.js";

export type PaymentProviderKey = "primary_acquirer" | "paypal" | "store_pos";
export type PaymentProviderEvidenceSource = "verified_webhook" | "server_side_provider_query" | "verified_pos_confirmation";

export type PaymentProviderLaunchInput = {
  attemptId: string;
  quoteId: string;
  customerId: string;
  paymentMethod: PaymentMethodId;
  currency: string;
  amountMinor: number;
  returnUrl: string;
  cancelUrl: string;
};

export type PaymentProviderLaunchResult =
  | { status: "pending"; providerPaymentId: string; launchUrl?: string | null }
  | { status: "unavailable"; reason: string };

export type PaymentProviderVerificationResult =
  | {
      status: "confirmed";
      attemptId: string;
      providerPaymentId: string;
      providerReference: string;
      currency: string;
      amountMinor: number;
      source: PaymentProviderEvidenceSource;
    }
  | {
      status: "pending" | "failed" | "cancelled" | "ignored";
      attemptId?: string;
      providerPaymentId?: string;
      failureCode?: string;
      source: PaymentProviderEvidenceSource;
    };

export interface PaymentProviderAdapter {
  readonly key: PaymentProviderKey;
  readonly supports: readonly PaymentMethodId[];
  launch(input: PaymentProviderLaunchInput): Promise<PaymentProviderLaunchResult>;
  verifyWebhook(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined> }): Promise<PaymentProviderVerificationResult>;
  query(input: { attemptId: string; providerPaymentId: string }): Promise<PaymentProviderVerificationResult>;
}

function unavailableAdapter(key: PaymentProviderKey, supports: readonly PaymentMethodId[]): PaymentProviderAdapter {
  const unavailable = async (): Promise<never> => {
    throw Object.assign(new Error("PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED"), { provider: key });
  };
  return {
    key,
    supports,
    launch: unavailable,
    verifyWebhook: unavailable,
    query: unavailable,
  };
}

const adapters: Record<PaymentProviderKey, PaymentProviderAdapter> = {
  primary_acquirer: unavailableAdapter("primary_acquirer", ["apple-pay", "google-pay", "click-to-pay", "card"]),
  paypal: paypalPaymentAdapter,
  store_pos: unavailableAdapter("store_pos", ["pay-in-store"]),
};

export function paymentProviderForMethod(method: PaymentMethodId): PaymentProviderKey {
  if (method === "paypal") return "paypal";
  if (method === "pay-in-store") return "store_pos";
  return "primary_acquirer";
}

export function getPaymentProviderAdapter(provider: string): PaymentProviderAdapter | null {
  const key = String(provider || "").trim() as PaymentProviderKey;
  return adapters[key] || null;
}

export function assertProviderSupportsMethod(adapter: PaymentProviderAdapter, method: PaymentMethodId) {
  if (!adapter.supports.includes(method)) {
    throw Object.assign(new Error("PAYMENT_METHOD_PROVIDER_MISMATCH"), { provider: adapter.key, method });
  }
}
