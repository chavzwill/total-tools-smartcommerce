# Smartcommerce customer and courier mobile apps

Date: 2026-10-24 (Jamaica)
Status: Proposed design, awaiting user approval. No mobile product code built.
Baseline inspected: main at 3a4e1c0dc88ed5601290239546add6207ddaddd4.

## Intent and agreed direction

Create two separate apps for iOS and Android: Smartcommerce for customers and
Smartcommerce Courier for delivery partners. The user selected separate apps
sharing backend services and common code. Deliver actual mobile experiences
connected to Smartcommerce, its POS integrations and TT AI.

## Approaches

1. Selected: two apps with shared contracts, API infrastructure and design primitives.
   Focused navigation, permissions and store listings; two release pipelines to manage.
2. Considered: one app with customer and courier modes. One listing and installation,
   but more complex navigation, authorization and permission explanations.

Builder proposal, not a user-selected framework: React Native, TypeScript and Expo.
Keep both app projects in this repository, with a shared mobile workspace and pinned,
compatible dependency versions. Expo supports monorepos and per-app EAS configuration.
Use native screens; share platform-independent business contracts rather than importing
the website's DOM components or browser-only helpers.

## Current system and constraints

- Canonical website/API is smartcommerce-ai/. Main is the accepted baseline.
- React/Vite website, TypeScript serverless APIs, Neon-backed commerce state.
- POS owns catalog identity, SKU, prices, stock, rental/repair lifecycle and staff approvals.
- Existing browser clients use relative URLs and same-origin session cookies. Native
  authentication is an explicit backend deliverable, not a change of API base URL.
- account.ts creates HttpOnly sc_session cookies. Couriers have separate sessions.
- courierDelivery.ts and courierDispatch.ts expose paginated, versioned contracts.
- courier authority.ts blocks acceptance, assignment, pickup, status updates and payouts
  pending POS verification. dispatchRuntime.ts enforces this; deliveryRuntime.ts returns
  canUpdate:false and blocks status writes. These are real live-operation dependencies.
- No app.json, eas.json or native app project was found in the inspected checkout.
- Runtime, migrations, provider configuration and production POS readiness have not
  been certified by this design review. Existing docs are not production evidence.

## Customer experience

Proposed primary destinations: Home, Shop, Assistant, Orders, Account; cart reachable
from shopping screens. Parts finder and rental entry points are prominent on Home/Shop.

- Browse/search products, filter, choose branch, show stock with freshness and unavailable states.
- Product detail: images, variants, compatible parts, price, availability and quantity.
- Parts finder preserves model/variant context and distinguishes confirmed fit from uncertainty.
- Cart and checkout: authoritative price/stock revalidation, delivery/pickup, server-owned totals,
  payment provider flow and confirmed order receipt. A payment redirect is not payment success.
- Customer registration, sign-in, recovery, account security and session revocation.
- Order detail and delivery tracking, receipt confirmation and issue reporting.
- Rentals, repair requests/status and customer estimate responses where backend supports them.
- TT AI with signed-in context and grounded product/branch availability through server APIs.
- Order notifications and verified deep links into the appropriate order or service request.
- Commercial account capabilities reuse server-enforced membership and approval boundaries.

## Courier experience

Proposed primary destinations: Jobs, Active Delivery, Earnings, Account.

Builder proposal: individual drivers sign in with their own identities and can access
only their offers/assignments. Existing courier actors are owner/staff based; introduce
explicit driver membership and assignment authorization on the server. Do not give
drivers organization-owner sessions. Fleet management and staff decisions remain in POS.
Independent owner-drivers can use a driver profile linked to their approved organization.

- Sign-in, partner application, document upload and accurate POS review status.
- Offer list/detail, deadline, accept/decline and clear stale-offer/conflict states.
- Assigned delivery, pickup instructions, eligible pickup verification and confirmation.
- Launch installed navigation app; show only authorized delivery/customer details.
- Delivery progression, failure reason, retry-safe photo/signature/confirmation evidence
  as required by the reviewed backend proof contract.
- Earnings/history distinguish pending, approved and actually paid amounts; POS controls payouts.
- Notifications for offers and assignment changes. Every action rechecks server eligibility.
- Offline access to minimum assigned-job details with explicit freshness; queued evidence
  remains pending until acknowledged. No offline job acceptance or financial finalization.

## Shared architecture and security

Proposed directories: mobile/apps/customer, mobile/apps/courier, mobile/packages/core,
mobile/packages/ui. Keep existing website build scripts unchanged unless a proven need arises.
Use separate bundle/package IDs, signing credentials, app links, notification registrations
and development/preview/production configurations for each app.

Implement an explicitly mobile session contract reusing existing account identity and
authorization services. Issue opaque, expiring, revocable credentials with hashed server
storage, audience separation and secure device storage; rotate refresh credentials with
replay detection. Define exact TTLs and request schemas during the authentication task.
Do not expose HttpOnly browser session tokens through a convenience API or weaken browser
origin/CSRF protections. Password reset, logout and session revocation invalidate mobile
credentials too, according to scope: ordinary logout revokes only the current session;
password reset and explicit sign-out-all revoke all affected sessions across devices.
Biometric unlock protects local credential access; it is not server MFA.

Payment handoff uses system-browser checkout and a verified HTTPS return link. Create
checkout through an authenticated mobile server contract; do not copy browser cookies
into URLs or assume HandyPay supports custom app-scheme callbacks. On return, refetch
server payment/order status, which is driven by validated provider events.

All API access uses HTTPS to explicit environment base URLs. Server checks identity,
ownership, role, courier eligibility and resource version for every protected operation.
No POS, database, AI-provider or payment secrets ship in either binary. Validate responses,
bound payload sizes and redact logs. Use safe allowlisted deep links and upload contracts.

POS integration must supply authenticated, versioned review decisions and narrowly scoped
courier action contracts with actor, reason, event identity, audit and replay protection.
Resolve assignment, suspension, offer expiry and concurrent acceptance on the server.
Keep existing guards until the replacement contract and database enforcement are verified.
Never report local submission as POS acceptance or approval.

Push is an update hint; refetch authorized state on receipt/open. Bind tokens to app,
account and device; unlink on logout and remove invalid tokens. Avoid sensitive payloads.
Navigation and proof capture request location/camera/photos only when needed. Continuous
background location is deferred unless explicitly agreed; initial tracking uses recorded
delivery status, not a claimed live vehicle map. Proof media needs private storage,
authorized upload/download, retention rules and retry-safe attachment acknowledgment.

## Design quality and accessibility

Use the accepted Smartcommerce brand as source material after locating its approved
implementation. Rebuild for native navigation, safe areas, keyboards and touch targets.
Customer screens prioritize discovery and purchase confidence; courier screens prioritize
job status, readable addresses and a clear next action. Include loading, empty, denied,
expired-session, stale-stock, offline and service-unavailable states. Support screen readers,
dynamic text, adequate contrast and reduced motion. Show dated stale data honestly.

## Delivery sequence and acceptance

1. Validate endpoint contracts and POS capabilities; agree mobile authentication, proof,
   payment callback and notification contracts. Record unsupported capabilities explicitly.
2. Build both app foundations and shared API/auth/storage; run in development builds.
3. Complete customer browse-to-order and courier onboarding-to-delivery vertical slices.
   Finish and verify POS action integration before claiming courier operational readiness.
4. Add remaining parts, rental, repair, AI and commercial experiences and harden recovery.
5. Test signed preview binaries on physical iPhone and Android devices, then prepare stores.

Required evidence: valid/expired/revoked sessions; customer/courier and tenant isolation;
stock/price changes at checkout; payment cancel/failure/webhook and deep-link resume;
POS delivery retries without duplicate orders; courier approval/suspension; duplicate and
concurrent offer acceptance; stale versions; lost connectivity and proof retry; denied
permissions; notification logout/account switching; accessibility and keyboard handling.
Run existing affected server regressions and production build as well as mobile type,
bundle and native build checks. Demo data is explicitly marked and cannot claim live success.

Release requires company-controlled Apple/Google publishing access, per-app signing,
push/provider credentials, privacy/support/deletion information, reviewed permission text
and documented release/rollback ownership. These are release dependencies, not reasons
to block implementation of development builds. No store submission or production activation
is included in design approval alone.

## Goals, exclusions and builder decisions

Success means two usable mobile apps backed by consistent live commerce/delivery state,
with verified customer purchase and courier delivery flows on both platforms.
Avoid a website wrapper, duplicated inventory ledger, bypassed POS approvals, fake live
tracking or shipping polished screens whose essential actions remain disconnected.
No replacement POS/admin app or new payment provider is proposed. Continuous courier
tracking, route optimization and offline checkout are outside the initial scope.
Builder review completed; driver identity, logout scope and payment handoff clarified.
Framework, driver identity, workspace paths, navigation and release sequence are builder proposals.
Builder may settle compatible package versions, internal module names and implementation
details while preserving these contracts. Material scope changes return to the user.

## References

- README.md; smartcommerce-ai/package.json
- smartcommerce-ai/docs/POS_COMMERCE_SYNC_ARCHITECTURE.md
- smartcommerce-ai/docs/POS_APPROVAL_AUTHORITY.md
- smartcommerce-ai/api/account.ts; smartcommerce-ai/api/courier-account.ts
- smartcommerce-ai/src/lib/courierDelivery.ts; smartcommerce-ai/src/lib/courierDispatch.ts
- smartcommerce-ai/src/server/couriers/{authority,dispatchRuntime,deliveryRuntime}.ts
- https://docs.expo.dev/guides/monorepos/
- https://docs.expo.dev/build-reference/build-with-monorepos/
- https://docs.expo.dev/versions/latest/sdk/securestore/
- https://docs.expo.dev/push-notifications/push-notifications-setup/
