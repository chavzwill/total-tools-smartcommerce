import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkout = fs.readFileSync(path.join(root, "api", "commercial-credit-checkout.ts"), "utf8");
const availability = fs.readFileSync(path.join(root, "api", "commercial-credit-availability.ts"), "utf8");
const reservations = fs.readFileSync(path.join(root, "src", "server", "commercialCreditReservations.ts"), "utf8");
const checkoutUi = fs.readFileSync(path.join(root, "src", "pages", "CheckoutPage.tsx"), "utf8");

const checks = [
  ["reservation schema exists", /commercial_credit_reservations/],
  ["account-scoped advisory lock serializes credit allocation", /pg_advisory_xact_lock\(hashtext/],
  ["provider-synced receivables reduce available credit", /entry_type='invoice'[\s\S]*source_coverage='provider_synced'/],
  ["active reservations reduce available credit", /status='reserved'[\s\S]*expires_at > NOW\(\)/],
  ["committed reservations remain counted until provider evidence arrives", /status='committed'[\s\S]*source_coverage='provider_synced'/],
  ["checkout acquires credit before provider order", /acquireCommercialCreditReservation\([\s\S]*platformService\.createOrder/],
  ["provider failure releases reservation", /releaseCommercialCreditReservation\(reservation\.reservationId\)/],
  ["accepted provider order commits reservation", /commitCommercialCreditReservation\(reservation\.reservationId, orderResult\.data\.id\)/],
  ["duplicate committed quote is rejected", /COMMERCIAL_CREDIT_ALREADY_SUBMITTED/],
  ["concurrent in-progress quote is rejected", /COMMERCIAL_CREDIT_IN_PROGRESS/],
  ["insufficient available credit is explicit", /COMMERCIAL_CREDIT_INSUFFICIENT_AVAILABLE/],
  ["availability API is authenticated", /AUTH_REQUIRED[\s\S]*commercial credit availability/],
  ["checkout UI loads current availability", /getCommercialCreditAvailability\(selectedCommercialAccountId\)/],
  ["checkout UI blocks over-limit submission", /!creditCanCoverOrder/],
  ["checkout UI shows outstanding and reservations", /Provider outstanding[\s\S]*In-flight reservations[\s\S]*Available now/],
];

const sources = `${reservations}\n${checkout}\n${availability}\n${checkoutUi}`;
const failures = checks.filter(([, pattern]) => !pattern.test(sources));
if (failures.length) {
  console.error("Commercial credit reservation regression failures:");
  for (const [label] of failures) console.error(`- ${label}`);
  process.exit(1);
}
console.log(`Commercial credit reservation regression gate passed (${checks.length} invariants).`);
