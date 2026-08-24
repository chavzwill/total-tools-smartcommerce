import { isPaymentProviderAdapterImplemented } from "../src/server/paymentProviderAdapters.js";
import { paypalSupportsCurrency } from "../src/server/paypalPaymentAdapter.js";

type Capability = {
  id: "apple-pay" | "google-pay" | "click-to-pay" | "paypal" | "card" | "pay-in-store";
  enabled: boolean;
  reason?: string;
};

const configured = (value: string | undefined) => Boolean(value && value.trim());

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export default function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET for payment capabilities." } });
  }

  const requestedCurrency = String(request.query?.currency || "JMD").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(requestedCurrency) ? requestedCurrency : "JMD";

  const primaryMerchantConfigured =
    configured(process.env.PAYMENT_PRIMARY_PROVIDER) &&
    configured(process.env.PAYMENT_WEBHOOK_SECRET);
  const primaryAdapterImplemented = isPaymentProviderAdapterImplemented("primary_acquirer");
  const primaryAcquirerReady = primaryMerchantConfigured && primaryAdapterImplemented;

  const paypalMerchantConfigured =
    configured(process.env.PAYPAL_CLIENT_ID) &&
    configured(process.env.PAYPAL_CLIENT_SECRET) &&
    configured(process.env.PAYPAL_WEBHOOK_ID);
  const paypalAdapterImplemented = isPaymentProviderAdapterImplemented("paypal");
  const paypalCurrencySupported = paypalSupportsCurrency(currency);
  const paypalReady = paypalMerchantConfigured && paypalAdapterImplemented && paypalCurrencySupported;

  const storePosConfigured =
    configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_URL) &&
    configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_SECRET);
  const storeAdapterImplemented = isPaymentProviderAdapterImplemented("store_pos");
  const storePosReady = storePosConfigured && storeAdapterImplemented;

  const walletFlag = (name: string) => process.env[name] === "true";
  const primaryUnavailableReason = !primaryMerchantConfigured
    ? "Primary acquirer is not configured."
    : !primaryAdapterImplemented
      ? "The selected primary-acquirer adapter is not installed yet."
      : undefined;
  const paypalUnavailableReason = !paypalMerchantConfigured
    ? "PayPal merchant/webhook configuration is incomplete."
    : !paypalAdapterImplemented
      ? "The PayPal adapter is not installed."
      : !paypalCurrencySupported
        ? `PayPal does not support direct ${currency} settlement for this checkout.`
        : undefined;
  const storeUnavailableReason = !storePosConfigured
    ? "Store POS confirmation is not connected."
    : !storeAdapterImplemented
      ? "The store POS payment adapter is not installed yet."
      : undefined;

  const capabilities: Capability[] = [
    {
      id: "apple-pay",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_APPLE_PAY_ENABLED"),
      reason: primaryUnavailableReason || (primaryAcquirerReady ? "Apple Pay is not enabled for this merchant configuration." : undefined),
    },
    {
      id: "google-pay",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_GOOGLE_PAY_ENABLED"),
      reason: primaryUnavailableReason || (primaryAcquirerReady ? "Google Pay is not enabled for this merchant configuration." : undefined),
    },
    {
      id: "click-to-pay",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_CLICK_TO_PAY_ENABLED"),
      reason: primaryUnavailableReason || (primaryAcquirerReady ? "Click to Pay is not enabled for this merchant configuration." : undefined),
    },
    {
      id: "card",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_CARD_ENABLED"),
      reason: primaryUnavailableReason || (primaryAcquirerReady ? "Card payment is not enabled for this merchant configuration." : undefined),
    },
    {
      id: "paypal",
      enabled: paypalReady && walletFlag("PAYMENT_PAYPAL_ENABLED"),
      reason: paypalUnavailableReason || (paypalReady ? "PayPal is disabled for this environment." : undefined),
    },
    {
      id: "pay-in-store",
      enabled: storePosReady && walletFlag("PAYMENT_PAY_IN_STORE_ENABLED"),
      reason: storeUnavailableReason || (storePosReady ? "Pay-in-store reservation is disabled for this environment." : undefined),
    },
  ];

  return send(response, 200, {
    currency,
    capabilities: capabilities.map((capability) => capability.enabled ? { ...capability, reason: undefined } : capability),
    policy: {
      capabilityMeansExecutable: true,
      browserRedirectIsProofOfPayment: false,
      paymentConfirmationRequired: true,
      confirmationSources: ["verified_webhook", "server_side_provider_query", "verified_pos_confirmation"],
    },
  });
}
