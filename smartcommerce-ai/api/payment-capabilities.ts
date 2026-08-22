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

  const primaryAcquirerReady =
    configured(process.env.PAYMENT_PRIMARY_PROVIDER) &&
    configured(process.env.PAYMENT_WEBHOOK_SECRET);

  const paypalReady =
    configured(process.env.PAYPAL_CLIENT_ID) &&
    configured(process.env.PAYPAL_CLIENT_SECRET) &&
    configured(process.env.PAYPAL_WEBHOOK_ID);

  const storePosReady =
    configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_URL) &&
    configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_SECRET);

  const walletFlag = (name: string) => process.env[name] === "true";

  const capabilities: Capability[] = [
    {
      id: "apple-pay",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_APPLE_PAY_ENABLED"),
      reason: primaryAcquirerReady ? "Wallet requires merchant/provider eligibility." : "Primary acquirer is not configured.",
    },
    {
      id: "google-pay",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_GOOGLE_PAY_ENABLED"),
      reason: primaryAcquirerReady ? "Wallet requires merchant/provider eligibility." : "Primary acquirer is not configured.",
    },
    {
      id: "click-to-pay",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_CLICK_TO_PAY_ENABLED"),
      reason: primaryAcquirerReady ? "Click to Pay must be enabled by the selected acquirer." : "Primary acquirer is not configured.",
    },
    {
      id: "card",
      enabled: primaryAcquirerReady && walletFlag("PAYMENT_CARD_ENABLED"),
      reason: primaryAcquirerReady ? "Card capture is not enabled for this merchant configuration." : "Primary acquirer is not configured.",
    },
    {
      id: "paypal",
      enabled: paypalReady && walletFlag("PAYMENT_PAYPAL_ENABLED"),
      reason: paypalReady ? "PayPal is disabled for this environment." : "PayPal merchant/webhook configuration is incomplete.",
    },
    {
      id: "pay-in-store",
      enabled: storePosReady && walletFlag("PAYMENT_PAY_IN_STORE_ENABLED"),
      reason: storePosReady ? "Pay-in-store reservation is disabled for this environment." : "Store POS confirmation is not connected.",
    },
  ];

  return send(response, 200, {
    capabilities: capabilities.map((capability) => capability.enabled ? { ...capability, reason: undefined } : capability),
    policy: {
      browserRedirectIsProofOfPayment: false,
      paymentConfirmationRequired: true,
      confirmationSources: ["verified_webhook", "server_side_provider_query", "verified_pos_confirmation"],
    },
  });
}
