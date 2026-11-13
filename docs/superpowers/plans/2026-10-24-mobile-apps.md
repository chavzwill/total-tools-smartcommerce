# Smartcommerce Mobile Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship separate customer and courier iOS/Android apps with verified commerce and delivery flows.

**Architecture:** Two Expo/React Native apps in an isolated mobile workspace share typed contracts, transport and native primitives. Server-owned account, commerce and POS services remain authoritative; add explicit mobile session and driver authorization boundaries rather than proxying arbitrary requests to existing cookie handlers.

**Tech Stack:** TypeScript, React Native, Expo, existing TypeScript APIs and Neon/PostgreSQL; existing HandyPay integration.

**Spec:** docs/superpowers/specs/2026-10-24-mobile-apps-design.md, approved by user on 2026-10-24.

## Global Constraints

- Separate customer and courier apps on iOS and Android; separate IDs, credentials and releases.
- POS owns catalog identity, SKU, prices, stock, rental/repair lifecycle and staff approvals.
- No POS, database, AI-provider or payment secrets ship in either binary.
- Do not weaken browser origin/CSRF protections or expose browser session credentials.
- Driver identities see only authorized offers/assignments; fleet management remains in POS.
- Keep existing courier guards until the replacement server/database contract is verified.
- Continuous courier tracking, route optimization and offline checkout are outside the initial scope.
- Existing website build remains independent. No store submission or production activation from this plan approval alone.

## Review Focus

- Concurrent refresh or expired credentials: at most one refresh per client; replay revokes the server session family (Tasks 2–3).
- Account switching with cached jobs or notifications: no prior-account data survives; deep links reauthorize (Tasks 3, 7, 10).
- Price/stock changes and duplicated payment callbacks: updated server quote and one order, never client-declared payment success (Task 5).
- Driver suspension or reassignment during offline proof capture: retain pending evidence safely, reject unauthorized finalization (Tasks 8–9).
- Large text, denied permissions and interrupted uploads: reachable actions, manual alternatives and explicit pending state (Tasks 4, 9, 11).

## File map and execution boundaries

- `mobile/package.json`, lockfile, `tsconfig.base.json`: mobile-only workspaces and pinned dependency resolution.
- `mobile/apps/{customer,courier}/{app.config.ts,eas.json,package.json,app/}`: independent Expo apps and native routes.
- `mobile/packages/core/src/{contracts,transport,session,cache,links}.ts`: data contracts, API calls, credential lifecycle, scoped cache, link validation.
- `mobile/packages/ui/src/{tokens,Button,Screen,AsyncState}.tsx`: native primitives; tokens.ts may be plain TypeScript.
- `smartcommerce-ai/src/server/mobile/`: mobile server handlers and domain adapters; no generic URL proxy.
- `smartcommerce-ai/api/mobile/v1/[...path].ts`: bounded route dispatcher.
- `smartcommerce-ai/migrations/20261024_mobile_sessions.sql`, `20261024_driver_identity.sql`, `20261024_mobile_notifications.sql`: separate additive migrations.
- `mobile/tests/`: Vitest behavior tests and React Native Testing Library component tests.
- `mobile/e2e/{customer,courier}/`: Maestro physical-device flows and fixture requirements.
- `smartcommerce-ai/tests/mobile-*.mjs`: existing repository-style server regression runners.
- `docs/mobile/`: endpoint contracts, POS integration, build/release runbooks and evidence.

Use one focused commit per task. Tasks 1–3 precede authenticated app features; Tasks 6 and 8 precede operational courier work. Tasks 4–5 and 7–9 can be reviewed as separate customer/courier subsystems. Keep incomplete integrations capability-disabled with accurate status.

## Task 1: Reproducible two-app workspace and public API contract

**Files:** Create mobile workspace/config files, core/src/contracts.ts, core/src/transport.ts, mobile/tests/transport.test.ts, docs/mobile/API_CONTRACT.md.
**Interfaces:** `AppAudience = 'customer' | 'courier'`; `ApiError {code:string;status:number;retryable:boolean;requestId?:string}`; `createApiClient({baseUrl,audience,getAccessToken,fetchImpl})` returns `request<T>(path,options,decode):Promise<T>`; decoder accepts unknown and returns T or throws.

- [ ] Create the minimal mobile test manifest/runner and write `transport.test.ts`: reject non-HTTPS release URLs and absolute/unallowlisted request paths; do not send credentials on redirects; malformed JSON/response shape produces a sanitized error; AbortSignal cancels requests.
- [ ] Run `cd mobile && npm test -- transport.test.ts`; expect missing-module failure before implementation.
- [ ] Create mobile workspace and both native app configurations using the current stable Expo template; pin template-compatible Expo/React/React Native versions in the lockfile, separate schemes and package IDs; leave EAS project IDs unset until real projects exist. Implement transport with redirect rejection, explicit JSON handling and decoder validation.
- [ ] Document route schemas, methods, auth audience and error codes for Tasks 2–10; distinguish existing adapters from new endpoints. Use `/api/mobile/v1/` namespace; never invent a configured provider or live capability.
- [ ] Run mobile install, tests, typecheck and `npx expo config --type public` per app; expect valid independent configs and no embedded secrets. Commit `feat: add two-app mobile workspace and transport`.

## Task 2: Server-issued mobile sessions

**Files:** Create mobile migration, server/mobile/{sessionRepository,sessionService,authHandler,router}.ts, api/mobile/v1/[...path].ts, tests/mobile-auth-regression.mjs and mobile-auth-database-regression.mjs. Modify account recovery/security services to revoke mobile sessions on all-device revocation/reset.
**Interfaces:** POST `/auth/login` `{email,password,audience,deviceId}`; POST `/auth/refresh` `{refreshToken,audience}` returns `MobileSession {accessToken,refreshToken,accessExpiresAt,refreshExpiresAt,account:{id,fullName},audience}`; POST `/auth/logout` and `/auth/logout-all`; GET `/auth/me`. `requireMobileActor(request,audience):Promise<MobileActor>` authenticates all later handlers. Access expiry 15 minutes; refresh absolute expiry 30 days; opaque 32-byte random credentials hashed at rest; atomic refresh rotation, no plaintext stored. Courier login does not imply driver eligibility.

- [ ] Write auth tests: wrong audience, missing/expired/revoked credentials return 401; login uses existing password/rate-limit services; refresh rotation replaces both tokens atomically; replay revokes the family; current logout preserves other devices, logout-all/reset revoke all. Concurrent reuse has one successful rotation and then family revocation.
- [ ] Run `node smartcommerce-ai/tests/mobile-auth-regression.mjs`; expect missing handler. Run DB tests only against a disposable URL with explicit production refusal.
- [ ] Extract shared identity verification from account.ts into a server service without changing cookie endpoints. Implement handlers/repository, payload limits and no-store responses; preserve existing MFA/step-up requirements with explicit challenge response, never issue authenticated tokens before completing required challenges.
- [ ] Run auth tests and existing security-session, security-session-management, security-account-recovery and security-mfa suites; expect pass. Exercise migration up on disposable DB. Commit `feat: add revocable mobile sessions`.

## Task 3: Native credential and account lifecycle

**Files:** core/src/{session,cache}.ts, apps/{customer,courier}/src/session.ts, app/(auth)/{login,signup,recovery}.tsx, tests/session.test.ts, server/mobile/accountHandler.ts.
**Interfaces:** `createSessionManager({audience,store,api})` exposes `restore`, `login`, `logout`, `getAccessToken`; store exposes async `get/set/remove`. `createAccountCache(accountId,audience)` isolates reads and deletes. `/auth/signup`, `/auth/recovery` and challenge completion use existing server policies and rate limits.

- [ ] Test secure-store failures never fall back to plaintext; ten simultaneous expired-token requests share one refresh; sign-out during refresh cannot restore a session; account switch clears cached records and credentials; password/MFA failures do not reveal account existence.
- [ ] Run `npm test -- session.test.ts`; expect missing module.
- [ ] Implement secure storage adapter with Expo SecureStore, auth screens and restoration states. Retain access tokens in memory; protect refresh credentials in secure storage. Missing device credentials lead to sign-in; biometrics do not skip server challenges.
- [ ] Run mobile tests/typecheck and both native auth smoke flows including reset, relaunch and session revocation. Commit `feat: add native account lifecycle`.

## Task 4: Customer discovery and native interface foundation

**Files:** ui/src/* primitives, core/src/catalogue.ts, customer app/(tabs)/{index,shop}.tsx, app/product/[id].tsx, app/parts.tsx, server/mobile/catalogueHandler.ts, tests/catalogue.test.ts and customer-navigation.test.tsx.
**Interfaces:** GET `/catalogue?branchId&query&cursor`, `/products/:id?branchId`, `/parts?brand&model&variant`; adapters reuse configured POS readers/product matching. `Availability {state:'available'|'unavailable'|'unknown';checkedAt:string|null}`; retain authoritative product IDs and fit confidence.

- [ ] Test unavailable/stale stock is never displayed as confirmed available; branch and model/variant survive navigation; unknown fit remains uncertain; empty/error states have accessible retry controls and large-text navigation stays reachable.
- [ ] Run catalogue/navigation tests; expect missing components/adapters.
- [ ] Locate approved UI assets/history before deriving native tokens. Implement Home/Shop/Product/Parts screens with native safe areas, accessible controls and deterministic loading states. Add tab routes for Assistant/Orders/Account as their tasks land; do not ship no-op links.
- [ ] Run mobile tests/typecheck; capture iPhone/Android screenshots at default/large text and inspect keyboard/safe areas. Commit `feat: add customer catalogue and parts discovery`.

## Task 5: Cart, checkout, payment and customer orders

**Files:** server/mobile/commerceHandler.ts, extracted shared commerce/payment services, core/src/commerce.ts, customer app/{cart,checkout,payment-return}.tsx and app/orders/[id].tsx, tests/mobile-commerce-regression.mjs, mobile/tests/checkout.test.ts, customer e2e/checkout.yaml.
**Interfaces:** GET `/cart`, POST `/cart/items` `{productId,quantity,branchId}`, PATCH/DELETE `/cart/items/:id`; POST `/quotes`; POST `/checkout` `{quoteId,fulfillment,idempotencyKey}` returns `{orderId,checkoutUrl}`; GET `/orders`, `/orders/:id`. Server quote/fulfillment models reuse current commerce service schema and money conventions, documented in API_CONTRACT.md before adapters are written.

- [ ] Test expired quote or changed stock/price demands re-quote; client totals ignored; repeated checkout with same key creates one order; wrong-owner reads denied; cancel/forged return link cannot mark paid; repeated valid webhook delivers one POS operation.
- [ ] Run server/mobile checkout tests; expect missing adapters.
- [ ] Extract services from commerce.ts without routing native requests through browser handlers. Validate HandyPay URL host server-side; launch system-browser checkout and verified HTTPS return; refresh order state after return/resume. Include pickup/delivery eligibility, fees and genuine POS transfer status. Add receipt confirmation/problem reporting using existing customer-delivery policy.
- [ ] Run mobile tests, payment and POS-order delivery regressions plus disposable outbox DB suite. Run native cancel/success/resume flows against provider sandbox. Commit `feat: connect mobile checkout and orders`.

## Task 6: Driver identity and POS decision exchange

**Files:** driver migration, server/mobile/{driverRepository,driverAuthorization,posDecisionHandler}.ts, existing POS event router/contracts, types/courier.ts, docs/mobile/POS_DRIVER_CONTRACT.md, tests/mobile-driver-authorization-regression.mjs and database companion.
**Interfaces:** `MobileDriverActor {kind:'driver';accountId:string;driverId:string;organizationId:string}`; `requireEligibleDriver(actor:MobileDriverActor,jobId:string,action:string):Promise<void>` checks current authoritative membership, approval, suspension and assignment. Extend only reviewed delivery APIs/DB functions to accept this actor; never cast it to owner. GET `/driver/profile` returns verified eligibility or explicit pending status.

- [ ] Test two drivers in one organization cannot read/mutate one another's assigned jobs; suspended/reassigned driver denied immediately; old owner flags cannot grant driver approval; signed POS decision replay is harmless, stale version cannot overwrite new and conflicting same-version payload fails closed.
- [ ] Run driver regression tests; expect missing actor path.
- [ ] Implement driver membership and authenticated versioned POS decision ingestion using existing event infrastructure. Define event IDs, POS entity IDs, versions, actor/reason and audit. Publish receiving POS endpoint/schema requirements; implement receiver-side changes only in an authorized accessible POS repository. Keep integration disabled until end-to-end handshake is demonstrated.
- [ ] Run driver/DB tests and existing POS authority regressions, updating assertions only to enforce the reviewed replacement contract. Record actual POS readiness. Commit `feat: add driver-scoped POS authority contract`.

## Task 7: Courier onboarding and offer workflow

**Files:** server/mobile/courierHandler.ts, core/src/courier.ts, courier app/(tabs)/{jobs,account}.tsx, app/{application,offer/[id]}.tsx, tests/mobile-offers-regression.mjs, mobile/tests/courier-offers.test.ts.
**Interfaces:** GET `/driver/offers`, POST `/driver/offers/:id/respond` `{action:'accept'|'decline',expectedVersion,idempotencyKey,reason?}`, POST `/driver/application`. Reuse application/document policy; pending review does not grant work. Only eligible recipient offers are readable.

- [ ] Test expired offer, duplicate command and concurrent acceptance against disposable DB; one authorized winner, stale version prompts refresh; pending/suspended users cannot accept; switching accounts removes prior offers, including pending requests.
- [ ] Run offer tests; expect missing handlers.
- [ ] Implement onboarding and offer screens with deadlines, loading/error/conflict states; connect the atomic server/DB operation under Task 6 eligibility checks. Reject offline acceptance rather than queueing it.
- [ ] Run mobile/server offer tests and native onboarding/accept/decline flow; confirm accepted job appears once. Commit `feat: add courier onboarding and offers`.

## Task 8: Courier pickup and delivery progression

**Files:** server/mobile/deliveryHandler.ts, existing delivery/dispatch repository services and migrations, courier app/(tabs)/active.tsx and app/delivery/[id].tsx, tests/mobile-delivery-regression.mjs and DB companion.
**Interfaces:** GET `/driver/jobs`, `/driver/jobs/:id`; POST `/driver/jobs/:id/commands` `{action,expectedVersion,idempotencyKey,payload}`. Allowed action names derive from reviewed POS pickup/status contracts; publish their exact transition table in POS_DRIVER_CONTRACT.md before coding. Commands return authoritative job version or 409 conflict.

- [ ] Test invalid transition, wrong driver, reused pickup pass and stale version denied; suspension between read/write checked transactionally; duplicate successful command returns same result; unauthorized destination/customer fields absent.
- [ ] Run delivery tests; expect missing handler/actor support.
- [ ] Implement checked transitions, eligible pickup confirmation, issue reporting and native job controls. Navigation uses safe coordinates/address with installed-map fallback; permission denial does not block viewing instructions. Status is pending until server acknowledgment.
- [ ] Run DB concurrency/pickup tests, existing delivery regressions and native pickup-to-delivery flow with real POS sandbox responses. Commit `feat: connect courier pickup and delivery`.

## Task 9: Private media and offline delivery evidence

**Files:** server/mobile/proofHandler.ts, private storage adapter, core/src/proofQueue.ts, courier src/proofCapture.tsx, tests/proof-queue.test.ts and tests/mobile-proof-regression.mjs.
**Interfaces:** POST `/driver/jobs/:id/proof-upload` `{mimeType,byteLength,idempotencyKey}` returns short-lived upload grant; POST `/driver/jobs/:id/proof` `{uploadId,expectedVersion,idempotencyKey}` acknowledges verified private evidence. `enqueueProof`, `retryProof`, `clearAccountProof` manage encrypted local evidence and explicit queued/uploading/acknowledged/conflict states.

- [ ] Test 10 MiB maximum, allowed JPEG/PNG signatures, rejected mismatched types, other-driver upload reuse, expired grants and interrupted retry; reassigned driver cannot finalize; photo stays pending until acknowledged; logout clears private artifacts without claiming delivery completion.
- [ ] Run proof tests; expect missing queue/handler.
- [ ] Implement private storage using the existing configured private-media provider if adequate; otherwise provision only after selecting its supported contract. No public bucket fallback. Use encrypted app-private local files for queued evidence; camera denial permits a clear retry/manual issue route. Document deletion and retention configuration, default 30 days for local unacknowledged evidence with expiration notice, remote policy requiring company approval before release.
- [ ] Run proof tests and airplane-mode/relaunch/upload-interruption/device-account-switch checks. Commit `feat: add private retry-safe delivery evidence`.

## Task 10: Notifications, links and earnings

**Files:** notification migration, server/mobile/{notificationHandler,notificationDelivery,earningsHandler}.ts, core/src/links.ts, apps/*/src/notifications.ts, courier app/(tabs)/earnings.tsx, tests/mobile-notifications-regression.mjs, tests/links.test.ts.
**Interfaces:** POST/DELETE `/devices/push` `{token,app,deviceId}`; GET `/driver/earnings` returns explicit currency, minor-unit values and pending/approved/paid categories from authoritative data. `parseAppLink(url,audience)` returns an allowlisted route or null. Only domain-verified HTTPS links route to records, never perform mutations.

- [ ] Test token rotation/logout/account switch, wrong-audience link, unowned record and stale push; payload contains no address/payment secrets; earnings cannot treat approved as paid or sum currencies together.
- [ ] Run notification/link tests; expect missing modules.
- [ ] Implement opt-in push registration and retry-safe outbox, invalid-token cleanup and foreground refetch. Use existing POS/provider earnings read models; unavailable upstream shows unavailable, never zero fabricated earnings. Associate domains and configure Android app links with actual signing information during release.
- [ ] Run tests and physical-device notification/open/logout checks for both apps. Commit `feat: add mobile notifications and earnings views`.

## Task 11: Assistant, rentals, repairs and commercial accounts

**Files:** server/mobile/serviceHandler.ts, core/src/services.ts, customer app/(tabs)/{assistant,account}.tsx, app/services/{rentals,repairs,commercial}.tsx, tests/mobile-services-regression.mjs, tests/customer-services.test.tsx.
**Interfaces:** explicit `/assistant`, `/rentals`, `/repairs`, `/commercial` routes adapt existing assistant/customer-rentals/customer-repairs/commercial-account services; define customer action schemas from those services in API_CONTRACT.md. Customer repair estimate response remains separate from staff approval. AI responses preserve grounding and uncertainty.

- [ ] Test cross-member commercial access, branch/task continuity, unavailable rental rates, wrong-owner repair response and interrupted assistant stream; large-text form/keyboard controls remain accessible.
- [ ] Run services tests; expect missing adapters/screens.
- [ ] Implement grounded assistant, service request/status detail, allowed estimate response and commercial account views/actions with existing permission/step-up policies. Preserve pending POS status and avoid unsupported action controls.
- [ ] Run relevant intelligence, commercial/member enforcement and repair/rental regressions plus native service flows. Commit `feat: add mobile assistant and customer services`.

## Task 12: Whole-product verification and signed preview releases

**Files:** mobile/e2e/{customer,courier}/*.yaml, docs/mobile/{RELEASE_RUNBOOK,ACCEPTANCE_EVIDENCE,PRIVACY_DATA_MAP}.md, per-app EAS config and CI workflow `.github/workflows/mobile.yml`.
**Interfaces:** `npm --prefix mobile run typecheck`, `npm --prefix mobile test`, per-app `npx expo export --platform all`; Maestro flows run against configured sandbox IDs. CI covers both apps and changed server contracts without assuming production credentials.

- [ ] Add end-to-end cases for customer purchase/resume and courier onboarding-to-delivery, expired session, denied permissions, offline proof, large text, suspension and account switching; mark required sandbox fixtures explicitly.
- [ ] Run against development builds and record failures before fixes; do not replace missing POS/provider operations with mocks in acceptance evidence.
- [ ] Fix observed issues, document app data collection/deletion/retention and create release/rollback ownership checklist. Configure real EAS projects and company-owned signing when access exists; generate signed Android/iOS preview builds without store submission.
- [ ] Run mobile suites, both platform exports, both signed native builds, physical-device flows, affected DB suites on disposable DB and `cd smartcommerce-ai && npm ci && npm run build`. Record exact SHA, device/OS, commands and unresolved dependencies. Commit `chore: verify mobile preview releases`.

## Self-review and handoff

Coverage: discovery/parts (4), cart/payment/orders/receipt (5), identity/security (2–3), courier POS/driver boundary (6), onboarding/offers (7), pickup/status/navigation (8), proof/offline/privacy (9), notifications/earnings/links (10), AI/rentals/repairs/commercial (11), native quality/release (12). Review Focus failures are pinned in the owning test steps. No live courier readiness claim until Tasks 6–9 pass with the POS.

Recommend native execution in this session, with an independent whole-branch review, because transport/session and POS/driver interfaces are tightly coupled and one implementer can keep those changes consistent. User review of this plan and execution-method choice precede implementation per the writing-plans workflow.
