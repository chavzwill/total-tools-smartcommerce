# Courier implementation — local verification, 23 September 2026

Work is isolated in `feature/courier-marketplace`. The original storefront and POS integration worktrees were not edited. Existing storefront edits were copied into the isolated worktree as the baseline, so the overall Git diff also contains inherited changes. Courier work has not been merged or deployed.

## Implemented locally

- Business applications, staff approval/rejection/suspension/reinstatement, service areas, hours, availability, item categories, parcel limits and exact currency rates.
- Dedicated courier login/signup pages and separate durable courier sessions, reusing existing SmartCommerce identity credentials.
- Encrypted private ID/business document uploads and staff review, with verification gating, reviewed versions and audit evidence.
- Email-bound driver invitations, individual membership, pass issuance/revocation and QR rendering.
- QR lookup returns current assigned orders, items/quantities, destinations and status at staff-authorized branches. Explicit, idempotent handover prevents duplicate collection.
- Encrypted bank details, staff verification, payable-earnings reservation, payout approvals, manual transfer references, ambiguous-transfer review and audit records.

## Checks completed

- Both TypeScript projects passed.
- Full existing release gate passed, including camera/storefront, authentication/security, courier regressions and dependency audit (zero reported vulnerabilities).
- Production Vite bundle built successfully into an isolated verification output.
- Real local PostgreSQL tests passed: migrations, ownership, retries, concurrent application decisions, audit atomicity, service publication/suspension, private encryption/retrieval, verification gates, branch order visibility, duplicate handover, payout reservation and transfer-reference requirements.
- Browser component tests used an explicitly labeled test fixture, not live accounts: application save/submit, service save and approval-dependent publication, application approval, pickup order display and handover receipt, QR rendering, and payout reason/reference controls. Checked mobile, tablet and desktop widths with no horizontal overflow in the inspected states.

## Remaining production dependencies and program scope

The feature remains disabled by default. Production migrations, encryption key, staff permission issuance, staff/branch assignments, governed service references and operational document-retention policy have not been configured or deployed.

The order/dispatch source must populate authoritative courier assignments before real orders appear when scanned. The booking/payment/delivery source must populate verified earnings before payouts can be requested. No production fixture orders or earnings exist, and there is no browser API to invent either.

Customer courier selection at checkout, payment collection/reconciliation and trusted dispatch ingestion remain subsequent increments. Delivery tracking and private proof are implemented for existing authoritative assignments. Bank transfers are performed by staff outside SmartCommerce; the application records their approved status/reference. POS synchronization remains paused.

## Checkout eligibility increment

Added a server-only preliminary rating function with regression tests for approved/verified/published services, capacity, authoritative packed dimensions, explicit restricted-goods classification, canonical route/category matching, currency, local opening hours/cutoff/closures and unambiguous whole-shipment weight-band prices. Unknown measurements or restriction status fail closed. Mixed-category rates must agree; no aggregation policy is invented. This is a pure eligibility foundation, not a reservation or a checkout integration.

Audit confirmed account and guest checkout currently return `paymentAvailable: false`; the provider product projection used by checkout does not supply authoritative parcel measurements. Customer selection remains disabled until authoritative shipment facts, transactional capacity reservations, tax policy, order persistence and verified payment reconciliation are connected. No browser-provided shipping facts are trusted and no POS calls were added.

## Delivery increment verified on 23 September 2026

- Added courier/company, branch-staff and customer delivery screens, connected to separate authenticated endpoints. Visible pages refresh every 30 seconds and show last-check and unavailable states.
- Driver updates follow collected → in transit → out for delivery → delivered. Delay/failed-attempt events preserve the stage. The confirmation receipt distinguishes the reported event from the current stage.
- Recipient name and private JPEG/PNG proof are encrypted and committed atomically with delivered status. Proof retrieval is permission-checked, audited and integrity-checked. Recording proof does not release earnings or establish independent recipient verification.
- Removed drivers cannot update or replay a delivery command; stale driver-removal versions now fail. Customer access depends on the trusted assignment's customer account binding.
- Both TypeScript projects, the full release gate (including dependency audit with zero reported vulnerabilities), real local PostgreSQL regressions and the production Vite build passed.
- Browser verification used the explicitly labeled local fixture: normal progression, delay with unchanged stage, photo upload/confirmation, evidence display, customer read-only controls, empty/unavailable states and a lost-response retry producing exactly one event. Inspected widths 390, 768 and 1440 had no horizontal overflow.
- The 12ui delivery design and responsive export were generated and inspected. Implementation adapts its grouped detail/timeline and update/proof panels to existing shared controls and fluid widths. Visual alignment was checked manually in the supported browser; no automated 12ui live-browser fidelity result is claimed.
- Whole-worktree whitespace review reports existing whitespace in PrimaryActions.tsx and CommercialPage.tsx; both files match the original storefront byte-for-byte and were left alone.

See [delivery operations](COURIER_DELIVERY_OPERATIONS.md) for contracts and remaining production prerequisites. No live order, bank transfer, deployment or POS synchronization was performed.
