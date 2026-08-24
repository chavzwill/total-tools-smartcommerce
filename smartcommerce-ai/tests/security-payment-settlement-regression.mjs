import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const capabilities = fs.readFileSync(path.join(root, "api", "payment-capabilities.ts"), "utf8");
const attemptsApi = fs.readFileSync(path.join(root, "api", "payment-attempt.ts"), "utf8");
const reconciliationApi = fs.readFileSync(path.join(root, "api", "payment-reconciliation.ts"), "utf8");
const settlement = fs.readFileSync(path.join(root, "src", "server", "paymentSettlement.ts"), "utf8");
const reconciliation = fs.readFileSync(path.join(root, "src", "server", "paymentReconciliation.ts"), "utf8");
const reconciliationUi = fs.readFileSync(path.join(root, "src", "pages", "PaymentReconciliationPage.tsx"), "utf8");
const commerceClient = fs.readFileSync(path.join(root, "src", "lib", "customerCommerce.ts"), "utf8");
const paymentClient = fs.readFileSync(path.join(root, "src", "services", "paymentAttemptClient.ts"), "utf8");
const paymentPanel = fs.readFileSync(path.join(root, "src", "components", "checkout", "PaymentMethodPanel.tsx"), "utf8");
const paymentPrincipal = fs.readFileSync(path.join(root, "src", "server", "paymentPrincipal.ts"), "utf8");
const guestIdentity = fs.readFileSync(path.join(root, "src", "server", "guestCheckoutIdentity.ts"), "utf8");
const guestFulfilment = fs.readFileSync(path.join(root, "api", "guest-checkout-fulfilment.ts"), "utf8");
const fulfilmentClient = fs.readFileSync(path.join(root, "src", "services", "checkoutFulfilmentClient.ts"), "utf8");

const sources = `${capabilities}\n${attemptsApi}\n${reconciliationApi}\n${settlement}\n${reconciliation}\n${reconciliationUi}\n${commerceClient}\n${paymentClient}\n${paymentPanel}\n${paymentPrincipal}\n${guestIdentity}\n${guestFulfilment}\n${fulfilmentClient}`;
const checks = [
  ["durable payment attempt table exists", /payment_attempts/],
  ["payment attempts use stable idempotency", /UNIQUE[\s\S]*(quote_id|idempotency)|ON CONFLICT|createHash/],
  ["standard payment states are explicit", /prepared[\s\S]*provider_pending[\s\S]*confirmed[\s\S]*failed[\s\S]*cancelled/],
  ["browser redirect is never proof of payment", /browserRedirectIsProofOfPayment\s*:\s*false/],
  ["paid requires verified provider evidence", /paidRequiresVerifiedProviderEvidence\s*:\s*true/],
  ["confirmation sources are constrained", /verified_webhook[\s\S]*server_side_provider_query[\s\S]*verified_pos_confirmation/],
  ["payment preparation requires server payment identity", /PAYMENT_IDENTITY_REQUIRED[\s\S]*customer or guest checkout session/],
  ["customer quote ownership is server checked", /checkout_quotes[\s\S]*customer_id=\$\{principal\.customerId\}/],
  ["guest quote ownership is server checked", /getGuestQuoteForSession\([\s\S]*guestSessionId:principal\.guestSessionId[\s\S]*quoteId/],
  ["guest payment identity is opaque and server derived", /GUEST_CHECKOUT_COOKIE[\s\S]*guestSessionFromToken[\s\S]*guestPaymentSubject/],
  ["expired quotes cannot start payment", /CHECKOUT_QUOTE_EXPIRED/],
  ["fulfilment must be bound before payment", /snapshot\?\.fulfilment[\s\S]*status !== "bound"[\s\S]*FULFILMENT_NOT_FINALIZED/],
  ["guest fulfilment requires owned durable session", /guestSessionFromToken[\s\S]*getGuestQuoteForSession\([\s\S]*guestSessionId:\s*guest\.id/],
  ["guest fulfilment is stored atomically", /updateGuestQuoteFulfilment\([\s\S]*guestSessionId:\s*guest\.id/],
  ["guest quotes route to guest fulfilment endpoint", /startsWith\("gqte_"\)[\s\S]*\/api\/guest-checkout-fulfilment/],
  ["guest payment is not blanket disabled in the browser", /const contextBlock = !quoteContext\.quoteId/],
  ["authoritative total is read server side", /total_minor/],
  ["disabled merchant methods fail closed", /PAYMENT_METHOD_UNAVAILABLE/],
  ["provider launch cannot be fabricated", /launch:\{ ready:false[\s\S]*No charge was attempted/],
  ["provider pending attempts age into watch and stale", /provider_pending[\s\S]*warningMinutes[\s\S]*staleMinutes/],
  ["confirmed paid status requires confirmation source", /status === "confirmed"[\s\S]*confirmation_source/],
  ["finance reconciliation route is staff protected", /PAYMENT_RECONCILIATION_FORBIDDEN/],
  ["finance UI explicitly states redirects are not payment proof", /redirects never count as payment proof/i],
  ["verified checkout quote pointer is session scoped", /smartcommerce_verified_quote_id[\s\S]*sessionStorage|sessionStorage[\s\S]*smartcommerce_verified_quote_id/],
  ["checkout prepares server payment attempt", /prepareStandardPaymentAttempt\([\s\S]*quoteId:[\s\S]*paymentMethod/],
  ["provider navigation only occurs when launch is ready", /launch\?\.ready[\s\S]*launch\.url[\s\S]*window\.location\.assign/],
  ["payment preparation errors state no charge attempted", /No charge was attempted/i],
];

const failures = checks.filter(([, pattern]) => !pattern.test(sources));
if (failures.length) {
  console.error("Payment settlement regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}
console.log(`Payment settlement regression gate passed (${checks.length} invariants).`);
