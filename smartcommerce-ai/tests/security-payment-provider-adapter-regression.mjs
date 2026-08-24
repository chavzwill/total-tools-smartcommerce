import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const adapters = fs.readFileSync(path.join(root, "src", "server", "paymentProviderAdapters.ts"), "utf8");
const paypal = fs.readFileSync(path.join(root, "src", "server", "paypalPaymentAdapter.ts"), "utf8");
const evidence = fs.readFileSync(path.join(root, "src", "server", "paymentProviderEvidence.ts"), "utf8");
const webhook = fs.readFileSync(path.join(root, "api", "payment-provider-webhook.ts"), "utf8");
const providerReturn = fs.readFileSync(path.join(root, "api", "payment-provider-return.ts"), "utf8");
const paymentAttempt = fs.readFileSync(path.join(root, "api", "payment-attempt.ts"), "utf8");
const recheck = fs.readFileSync(path.join(root, "api", "payment-provider-recheck.ts"), "utf8");
const recheckUi = fs.readFileSync(path.join(root, "src", "pages", "PaymentReconciliationPage.tsx"), "utf8");
const settlement = fs.readFileSync(path.join(root, "src", "server", "paymentSettlement.ts"), "utf8");
const sources = `${adapters}\n${paypal}\n${evidence}\n${webhook}\n${providerReturn}\n${paymentAttempt}\n${recheck}\n${recheckUi}\n${settlement}`;

const checks = [
  ["provider adapter exposes launch webhook query and return contracts", /launch\([\s\S]*verifyWebhook\([\s\S]*query\([\s\S]*completeReturn/],
  ["wallet and card methods share the primary acquirer boundary", /primary_acquirer[\s\S]*apple-pay[\s\S]*google-pay[\s\S]*click-to-pay[\s\S]*card/],
  ["paypal is registered as its own concrete provider", /paypal:\s*paypalPaymentAdapter/],
  ["pay in store remains a POS confirmation boundary", /store_pos[\s\S]*pay-in-store/],
  ["unconfigured adapters fail closed", /PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED/],
  ["paypal uses oauth client credentials", /\/v1\/oauth2\/token[\s\S]*grant_type=client_credentials/],
  ["paypal currency support is explicit and excludes silent conversion", /SUPPORTED_CURRENCIES[\s\S]*PAYPAL_CURRENCY_UNSUPPORTED/],
  ["checkout blocks unsupported paypal quote currencies", /paypalSupportsCurrency\(currency\)[\s\S]*PAYMENT_CURRENCY_UNSUPPORTED/],
  ["paypal order creation is idempotent", /PayPal-Request-Id[\s\S]*input\.attemptId/],
  ["paypal approval url comes from provider response", /rel === "approve"[\s\S]*launchUrl/],
  ["paypal webhook signature is verified by paypal", /verify-webhook-signature[\s\S]*verification_status !== "SUCCESS"/],
  ["paypal return token must match stored provider transaction", /tokenParam !== input\.providerPaymentId[\s\S]*PAYMENT_PROVIDER_TRANSACTION_MISMATCH/],
  ["paypal capture is server side and idempotent", /\/capture[\s\S]*PayPal-Request-Id[\s\S]*-capture/],
  ["paypal capture is re-queried before confirmation evidence", /const after = await getOrder\(input\.providerPaymentId\)[\s\S]*evidenceFromOrder/],
  ["provider return requires signed in customer ownership", /getPaymentAttemptForCustomer\([\s\S]*customerId[\s\S]*attemptId/],
  ["provider return applies verified evidence only", /completeReturn\([\s\S]*applyVerifiedProviderEvidence/],
  ["webhook reads raw bytes before provider verification", /readRawBody\(request\)[\s\S]*adapter\.verifyWebhook/],
  ["webhook payload size is bounded", /MAX_WEBHOOK_BYTES/],
  ["unknown providers cannot reach verification", /PAYMENT_PROVIDER_NOT_FOUND/],
  ["provider evidence is matched to authoritative attempt", /authoritativeAttempt\(evidence\.attemptId\)/],
  ["provider identity mismatch is rejected", /PAYMENT_PROVIDER_EVIDENCE_MISMATCH/],
  ["currency mismatch is rejected", /PAYMENT_PROVIDER_CURRENCY_MISMATCH/],
  ["amount mismatch is rejected", /PAYMENT_PROVIDER_AMOUNT_MISMATCH/],
  ["provider transaction mismatch is rejected", /PAYMENT_PROVIDER_TRANSACTION_MISMATCH/],
  ["confirmed evidence requires provider reference", /PAYMENT_PROVIDER_EVIDENCE_INCOMPLETE/],
  ["verified evidence alone calls settlement confirmation", /confirmPaymentFromProvider/],
  ["webhook response never treats receipt as payment success", /received:\s*true,\s*applied:/],
  ["provider recheck requires authorized staff", /PAYMENT_RECHECK_FORBIDDEN/],
  ["provider recheck is limited to pending payments", /PAYMENT_RECHECK_NOT_PENDING/],
  ["provider recheck queries adapter then validates evidence", /adapter\.query\([\s\S]*applyVerifiedProviderEvidence/],
  ["finance UI only offers provider recheck for pending rows", /item\.status === "provider_pending"[\s\S]*Recheck provider/],
  ["finance UI states recheck cannot manually mark paid", /never manually marks a payment paid/i],
];

const failures = checks.filter(([, pattern]) => !pattern.test(sources));
if (failures.length) {
  console.error("Payment provider adapter regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}
console.log(`Payment provider adapter regression gate passed (${checks.length} invariants).`);
