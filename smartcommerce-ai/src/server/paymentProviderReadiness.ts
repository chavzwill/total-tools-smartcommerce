import { isPaymentProviderAdapterImplemented } from "./paymentProviderAdapters.js";
import { paypalSupportsCurrency } from "./paypalPaymentAdapter.js";

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

function enabled(name: string) {
  return process.env[name] === "true";
}

export function paymentProviderReadiness(currency = "JMD") {
  const normalizedCurrency = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase())
    ? String(currency).toUpperCase()
    : "JMD";

  const primaryMerchantConfigured = configured(process.env.PAYMENT_PRIMARY_PROVIDER) && configured(process.env.PAYMENT_WEBHOOK_SECRET);
  const primaryAdapterImplemented = isPaymentProviderAdapterImplemented("primary_acquirer");
  const paypalMerchantConfigured = configured(process.env.PAYPAL_CLIENT_ID) && configured(process.env.PAYPAL_CLIENT_SECRET) && configured(process.env.PAYPAL_WEBHOOK_ID);
  const paypalAdapterImplemented = isPaymentProviderAdapterImplemented("paypal");
  const storeMerchantConfigured = configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_URL) && configured(process.env.STORE_POS_PAYMENT_CONFIRMATION_SECRET);
  const storeAdapterImplemented = isPaymentProviderAdapterImplemented("store_pos");

  return {
    currency: normalizedCurrency,
    providers: [
      {
        key: "primary_acquirer" as const,
        selectedProvider: String(process.env.PAYMENT_PRIMARY_PROVIDER || "").trim() || null,
        adapterImplemented: primaryAdapterImplemented,
        merchantConfigured: primaryMerchantConfigured,
        currencySupported: null as boolean | null,
        executable: primaryAdapterImplemented && primaryMerchantConfigured,
        methods: [
          { id: "apple-pay", enabled: enabled("PAYMENT_APPLE_PAY_ENABLED") },
          { id: "google-pay", enabled: enabled("PAYMENT_GOOGLE_PAY_ENABLED") },
          { id: "click-to-pay", enabled: enabled("PAYMENT_CLICK_TO_PAY_ENABLED") },
          { id: "card", enabled: enabled("PAYMENT_CARD_ENABLED") },
        ],
      },
      {
        key: "paypal" as const,
        selectedProvider: "paypal",
        adapterImplemented: paypalAdapterImplemented,
        merchantConfigured: paypalMerchantConfigured,
        currencySupported: paypalSupportsCurrency(normalizedCurrency),
        executable: paypalAdapterImplemented && paypalMerchantConfigured && paypalSupportsCurrency(normalizedCurrency),
        methods: [{ id: "paypal", enabled: enabled("PAYMENT_PAYPAL_ENABLED") }],
      },
      {
        key: "store_pos" as const,
        selectedProvider: "store_pos",
        adapterImplemented: storeAdapterImplemented,
        merchantConfigured: storeMerchantConfigured,
        currencySupported: true,
        executable: storeAdapterImplemented && storeMerchantConfigured,
        methods: [{ id: "pay-in-store", enabled: enabled("PAYMENT_PAY_IN_STORE_ENABLED") }],
      },
    ],
    policy: {
      capabilityMeansExecutable: true,
      secretsExposed: false,
      browserRedirectIsProofOfPayment: false,
    },
  };
}
