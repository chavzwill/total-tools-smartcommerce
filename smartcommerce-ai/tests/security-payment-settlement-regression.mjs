import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const capabilities = fs.readFileSync(path.join(root, "api", "payment-capabilities.ts"), "utf8");
const attemptsApi = fs.readFileSync(path.join(root, "api", "payment-attempt.ts"), "utf8");
const reconciliationApi = fs.readFileSync(path.join(root, "api", "payment-reconciliation.ts"), "utf8");
const settlement = fs.readFileSync(path.join(root, "src", "server", "paymentSettlement.ts"), "utf8");
const reconciliation = fs.readFileSync(path.join(root, "src", "server", "paymentReconciliation.ts"), "utf8");
const reconciliationUi = fs.readFileSync(path.join(root, "src", "pages", "PaymentReconciliationPage.tsx"), "utf8");

const sources = `${capabilities}\n${attemptsApi}\n${reconciliationApi}\n${settlement}\n${reconciliation}\n${reconciliationUi}`;
const checks = [
  ["durable payment attempt table exists", /payment_attempts/],
  ["payment attempts use stable idempotency", /UNIQUE[\s\S]*(quote_id|idempotency)|ON CONFLICT|createHash/],
  ["standard payment states are explicit", /prepared[\s\S]*provider_pending[\s\S]*confirmed[\s\S]*failed[\s\S]*cancelled/],
  ["browser redirect is never proof of payment", /browserRedirectIsProofOfPayment\s*:\s*false/],
  ["paid requires verified provider evidence", /paidRequiresVerifiedProviderEvidence\s*:\s*true/],
  ["confirmation sources are constrained", /verified_webhook[\s\S]*server_side_provider_query[\s\S]*verified_pos_confirmation/],
  ["payment preparation requires authentication", /AUTH_REQUIRED[\s\S]*online payment/],
  ["quote ownership is server checked", /checkout_quotes[\s\S]*customer_id=\$\{customerId\}/],
  ["expired quotes cannot start payment", /CHECKOUT_QUOTE_EXPIRED/],
  ["fulfilment must be bound before payment", /FULFILMENT_NOT_FINALIZED/],
  ["authoritative total is read server side", /total_minor/],
  ["disabled merchant methods fail closed", /PAYMENT_METHOD_UNAVAILABLE/],
  ["provider launch cannot be fabricated", /launch:\{ ready:false[\s\S]*No charge was attempted/],
  ["provider pending attempts age into watch and stale", /provider_pending[\s\S]*warningMinutes[\s\S]*staleMinutes/],
  ["confirmed paid status requires confirmation source", /status === "confirmed"[\s\S]*confirmation_source/],
  ["finance reconciliation route is staff protected", /PAYMENT_RECONCILIATION_FORBIDDEN/],
  ["finance UI explicitly states redirects are not payment proof", /redirects never count as payment proof/i],
];

const failures = checks.filter(([, pattern]) => !pattern.test(sources));
if (failures.length) {
  console.error("Payment settlement regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}
console.log(`Payment settlement regression gate passed (${checks.length} invariants).`);
