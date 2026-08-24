import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const adapters = fs.readFileSync(path.join(root, "src", "server", "paymentProviderAdapters.ts"), "utf8");
const evidence = fs.readFileSync(path.join(root, "src", "server", "paymentProviderEvidence.ts"), "utf8");
const webhook = fs.readFileSync(path.join(root, "api", "payment-provider-webhook.ts"), "utf8");
const settlement = fs.readFileSync(path.join(root, "src", "server", "paymentSettlement.ts"), "utf8");
const sources = `${adapters}\n${evidence}\n${webhook}\n${settlement}`;

const checks = [
  ["provider adapter exposes launch webhook and query contracts", /launch\([\s\S]*verifyWebhook\([\s\S]*query\(/],
  ["wallet and card methods share the primary acquirer boundary", /primary_acquirer[\s\S]*apple-pay[\s\S]*google-pay[\s\S]*click-to-pay[\s\S]*card/],
  ["paypal remains a separate provider boundary", /paypal[\s\S]*\["paypal"\]/],
  ["pay in store remains a POS confirmation boundary", /store_pos[\s\S]*pay-in-store/],
  ["unconfigured adapters fail closed", /PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED/],
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
];

const failures = checks.filter(([, pattern]) => !pattern.test(sources));
if (failures.length) {
  console.error("Payment provider adapter regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}
console.log(`Payment provider adapter regression gate passed (${checks.length} invariants).`);
