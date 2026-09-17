# Courier Onboarding and Service Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; no parallel agents are needed.

**Goal:** Let real courier businesses apply, receive an audited staff decision, and maintain delivery services and rates without enabling unconfigured paid bookings.

**Architecture:** Extend SmartCommerce with organization-scoped durable courier records and thin authenticated API handlers. Keep application approval, service validation, persistence, and presentation separate. Use the existing customer identity for courier owners and the existing signed staff session with explicit courier permissions for reviewers.

**Tech Stack:** React, TypeScript, Vite, Node HTTP handlers, Neon/PostgreSQL, existing shared UI components and regression runner conventions.

**Spec:** `docs/superpowers/specs/2026-09-16-courier-marketplace-design.md`

## Global constraints

- The POS synchronization program remains paused: no POS contract changes, deployment, or order submission is part of this program without separate authorization.
- No mock couriers, rates, shipments, or proof are inserted into production workflows.
- Customers choose an eligible courier at checkout and pay the delivery fee through SmartCommerce.
- Live GPS tracking is outside the initial scope.
- Every approval, rejection, suspension, and reinstatement records actor, reason, timestamp, and version.
- Use failing behavioral/contract tests first.
- Preserve unrelated local work, the camera/responsive corrections, and existing checkout functionality.

This plan implements increment 1 only. Quote/booking/payment orchestration and shipment/proof/settlement each require their own execution plan based on the approved program specification. Do not expose unfinished controls that imply these later features are available.

## Preparation and ownership

- [ ] Record `git status --short`, staged paths, branch, and HEAD. Never reset, stash, or commit unrelated storefront files.
- [ ] Follow `using-git-worktrees` before creating an isolated execution worktree. Base it on current tracked source plus explicitly preserved current storefront changes; a clean HEAD alone omits the user's current UI. Do not use the POS-sync worktree.
- [ ] Read the approved specification and current `api/account.ts`, `api/commerce.ts`, `api/staff-session.ts`, `src/server/staffSession.ts`, and `vite.config.ts` before editing.
- [ ] Use the existing Neon connection environment variables. Test database configuration must be explicitly distinct from production. Never apply a migration merely because a production connection exists.

## File map

Create:

- `src/types/courier.ts`: shared DTOs; no secrets or database clients.
- `src/server/couriers/policy.ts`: strict payload normalization, permissions, and application state transitions.
- `src/server/couriers/serviceValidation.ts`: coverage, hours, capacity, category, package, and rate rules.
- `src/server/couriers/repository.ts`: parameterized durable persistence, ownership, compare-and-set updates, and audit writes.
- `src/server/couriers/http.ts`: bounded parsing, session resolution, response/error mapping, request guards.
- `api/couriers.ts`: owner application/service actions and approved public service projection.
- `api/courier-approvals.ts`: staff queue, decision history, and decision actions.
- `migrations/20260916_courier_onboarding.sql`: additive schema, constraints, indexes, and audit storage.
- `src/lib/couriers.ts`: typed client functions and safe response handling.
- `src/pages/CourierPortalPage.tsx`: sign-in entry, application status, profile and service editing.
- `src/components/couriers/CourierApplicationForm.tsx`: application input only.
- `src/components/couriers/CourierServiceForm.tsx`: service/coverage/hour/rate input only.
- `src/components/operations/CourierApprovalsPanel.tsx`: staff application queue and decisions.
- `src/styles/couriers.css`: scoped responsive layouts using existing tokens and shared buttons.
- `tests/courier-policy-regression.mjs`, `tests/courier-services-regression.mjs`, `tests/courier-api-regression.mjs`, `tests/courier-database-regression.mjs`: behavioral and integration coverage.

Modify narrowly:

- `src/App.tsx`: lazy `/couriers` route.
- `src/pages/OperationsPortalPage.tsx` and `src/components/operations/OperationsWorkspace.tsx`: permission-aware courier approvals section.
- `vite.config.ts`: add both endpoint names to the existing `ssrLoadModule` handler allowlist.
- `package.json`: courier regression command and release-gate inclusion.
- Existing account/footer navigation component, located by searching its current route links: add a descriptive courier entry without rebuilding the shell.

## Task 1: Application contract and policy

**Interfaces:**

```ts
type CourierStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'suspended';
type CourierAction = 'submit' | 'approve' | 'reject' | 'suspend' | 'reinstate';
type CourierApplicationInput = {
  businessName: string; contactName: string; email: string; phone: string;
  description: string;
};
type CourierApplication = CourierApplicationInput & {
  id: string; status: CourierStatus; version: number;
  decisionReason: string | null; updatedAt: string;
};
type CourierActor = { kind: 'owner'; customerId: string } |
  { kind: 'staff'; employeeId: string; permissions: Record<string, boolean> };
// policy.ts exports normalizeApplication, canReviewCouriers, nextApplicationStatus.
```

- [ ] Write tests using the repository's TypeScript transpilation/import pattern. Include these assertions before implementation:

```js
assert.equal(canReviewCouriers({permissions:{reports:true}}), false);
assert.equal(canReviewCouriers({permissions:{couriers_manage:true}}), true);
assert.equal(canReviewCouriers({permissions:{couriers_manage:false}}), false);
assert.equal(nextApplicationStatus('draft','submit'), 'submitted');
assert.equal(nextApplicationStatus('rejected','submit'), 'submitted');
assert.equal(nextApplicationStatus('submitted','approve'), 'approved');
assert.equal(nextApplicationStatus('approved','suspend'), 'suspended');
assert.throws(()=>nextApplicationStatus('draft','approve'));
assert.throws(()=>nextApplicationStatus('suspended','submit'));
assert.throws(()=>normalizeApplication({businessName:'x'}));
```

- [ ] Run `node tests/courier-policy-regression.mjs`; confirm failure from missing behavior.
- [ ] Implement normalization with bounded trimmed strings: business/contact names 120 characters, email 254, phone 32, description 2000. Reject unexpected mutable authority fields (`status`, `ownerCustomerId`, `permissions`, `version`) in application input. Validate a usable email and phone without silently guessing country codes. Model typed safe error codes rather than returning exception text.
- [ ] Implement the explicit transition table: draft/rejected→submitted; submitted→approved/rejected; approved→suspended; suspended→approved through reinstate. Repository authorization, not this pure transition table, decides who can perform each action.
- [ ] Rerun the test and TypeScript. Commit only the task's files after reviewing its diff.

## Task 2: Durable applications, ownership, and audit

**Interfaces:** repository exports `createApplication(customerId, input, idempotencyKey)`, `getOwnedApplication(customerId)`, `saveApplication(customerId, id, expectedVersion, input)`, `submitApplication(customerId, id, expectedVersion, idempotencyKey)`, `listApplications(staffActor, cursor)`, and `decideApplication(staffActor, id, expectedVersion, action, reason, idempotencyKey)`.

- [ ] Add database tests against a disposable PostgreSQL database. Apply migration twice. Use independent transactions for concurrent decisions.

```js
const app = await repo.createApplication(ownerA, validApplication, key);
assert.equal((await repo.createApplication(ownerA, validApplication, key)).id, app.id);
await assert.rejects(()=>repo.saveApplication(ownerB, app.id, app.version, validApplication));
await repo.submitApplication(ownerA, app.id, app.version, submitKey);
const decisions = await Promise.allSettled([
  repo.decideApplication(reviewer, app.id, 2, 'approve', 'Reviewed', approveKey),
  repo.decideApplication(reviewer, app.id, 2, 'reject', 'Missing details', rejectKey)
]);
assert.equal(decisions.filter(x=>x.status==='fulfilled').length, 1);
```

- [ ] Run `node tests/courier-database-regression.mjs`; assert the database is test-scoped, fail clearly if no test database is supplied, and observe the missing-schema/behavior failure. Never count a skipped database test as passed.
- [ ] Add organizations/applications, owner memberships, decision events, and mutation idempotency storage. Use UUID keys, customer ownership foreign keys after checking the actual customer schema, status constraints, positive version counters, and a unique owner association for the initial single-organization owner flow.
- [ ] Implement transactional compare-and-set updates with audit insertion in the same transaction. An expected version mismatch returns conflict with no event. A reused key with the same request hash returns the prior result; a different hash returns conflict. Audit stores actor identity, old/new status, reason, timestamps, request ID, and version, never credentials.
- [ ] Bound staff pages to 50 records and use a stable cursor. Restrict owner reads/updates by membership in SQL, not only by a preceding UI check. Draft/rejected profile edits increment version; submitted and approved identity edits require returning to review rather than silently altering approved identity.
- [ ] Verify transaction rollback, duplicate payload conflict, revoked ownership, and concurrent first application creation. Commit the migration and repository only with passing integration evidence.

## Task 3: Service configuration and versioned rates

**Interfaces:** `normalizeCourierService(input, references): CourierServiceInput`, `saveService(ownerId, organizationId, serviceId, expectedVersion, input, idempotencyKey)`, and `publishService(ownerId, serviceId, expectedVersion, idempotencyKey)`.

```ts
type CourierServiceInput = {
  name: string; currency: string; timezone: string;
  originAreaIds: string[]; destinationAreaIds: string[]; categoryIds: string[];
  mode: 'branch_to_address' | 'branch_to_collection_point';
  collectionPointIds: string[];
  minBusinessDays: number; maxBusinessDays: number;
  cutoffLocal: string; dailyCapacity: number; available: boolean;
  maxWeightGrams: number; maxLengthMm: number; maxWidthMm: number; maxHeightMm: number;
  hours: Array<{weekday:number; opens:string; closes:string}>;
  closures: string[];
  rates: Array<{categoryId:string; originAreaId:string; destinationAreaId:string;
    minWeightGrams:number; maxWeightGrams:number; priceMinor:number}>;
};
```

- [ ] Add failing service validation tests: negative/fractional money; overlapping weight brackets for the same category/area combination; unknown IDs; empty coverage; unsupported currency; invalid timezone; maximum below minimum shipping days; malformed hours; duplicate weekdays; no collection point for collection mode; zero capacity while published/available; payload containing authority fields.

```js
assert.throws(()=>normalizeCourierService({...validService, rates:[{...validRate,priceMinor:-1}]}, references));
assert.throws(()=>normalizeCourierService({...validService, rates:[validRate,validRate]}, references));
assert.throws(()=>normalizeCourierService({...validService, timezone:'invalid'}, references));
assert.equal(normalizeCourierService(validService,references).rates[0].priceMinor, validRate.priceMinor);
```

- [ ] Run `node tests/courier-services-regression.mjs` red, then implement strict validation. Use half-open weight bands `[min,max)` with a documented maximum boundary. Reject overlap rather than picking whichever rule is first. Cap arrays and total body size; no arbitrary formulas.
- [ ] Add durable service/version records and governed area/collection-point reference tables. Catalogue categories come from the existing configured catalogue provider. Missing reference data produces an explicit setup-required state; never seed invented areas or categories. Initial references must be imported through a reviewed migration from supplied business data before publishing.
- [ ] Permit draft services for pending applicants; publishing requires an approved organization and complete valid reference data. Public queries join current organization approval and service availability. Suspension immediately removes discovery eligibility without deleting records. Each edit creates a new rate snapshot; future quotes reference immutable versions.
- [ ] Add database tests for foreign-owner edits, pending publication, suspension filtering, immutable history, and simultaneous edits. Run both service and database tests, then commit task files.

## Task 4: Authenticated HTTP endpoints

**Interfaces:** `GET /api/couriers` returns the caller's organization and services; `POST /api/couriers` accepts a discriminated action (`create_application`, `save_application`, `submit_application`, `save_service`, `publish_service`, `pause_service`). `GET /api/courier-approvals` returns the staff queue; POST accepts an explicit decision. No public projection includes application contacts or owner IDs.

- [ ] Build handler tests with injectable session/repository boundaries and real HTTP-shaped bodies. Assert unauthenticated 401, unauthorized 403, malformed 400, oversized 413, stale version 409, disabled feature 503, rate limit 429, and unavailable database 503. Assert a thrown SQL/provider error is absent from responses.

```js
assert.equal((await callOwnerEndpoint({session:null,body:{action:'submit_application'}})).status,401);
assert.equal((await callApprovalEndpoint({staff:{permissions:{reports:true}},body:decision})).status,403);
assert.equal((await callOwnerEndpoint({session:ownerSession,body:{...command,ownerCustomerId:otherOwner}})).status,400);
assert.equal((await callApprovalEndpoint({staff:reviewerSession,body:{...decision,expectedVersion:0}})).status,409);
```

- [ ] Run `node tests/courier-api-regression.mjs` and observe failures before adding handlers.
- [ ] Resolve customer sessions exactly against unrevoked, unexpired `customer_sessions` token hashes, following `api/commerce.ts`. Resolve staff through `readStaffSession` and require explicit `couriers_manage === true`. Do not grant permission from role strings or broad `reports` access. Until that permission is supplied by the existing staff identity source, approval is unavailable; do not alter POS permissions in this task.
- [ ] Implement same-origin mutation validation, JSON-only bodies, 64 KiB maximum payload, UUID idempotency keys, actor-scoped durable rate limits, no-store headers, safe code/message envelopes, and correlation IDs. Origin configuration must be server-controlled, not trusted from arbitrary request data.
- [ ] Add both endpoints to Vite's existing API allowlist. Feature gate `SMARTCOMMERCE_COURIERS_ENABLED` defaults off. Paid-booking capability remains false even when onboarding is enabled.
- [ ] Verify endpoint tests plus existing session/security regressions. Commit only these endpoint changes.

## Task 5: Courier registration and service portal

**Interfaces:** client exports `getCourierWorkspace()`, `createCourierApplication(input,key)`, `saveCourierApplication(id,version,input,key)`, `submitCourierApplication(id,version,key)`, `saveCourierService(command,key)`, `publishCourierService(id,version,key)`, `pauseCourierService(id,version,key)`. Each rejects non-JSON/non-success responses; none report success optimistically.

- [ ] Load the applicable UI skill and existing `PRODUCT.md`/`DESIGN.md` before UI implementation. Preserve shared typography, button components, responsive shell, and visible user-facing language.
- [ ] Write client behavioral tests that feed 401/409/503, malformed JSON, and success responses and verify the returned DTO/error. Keep these in `tests/courier-api-regression.mjs` or a focused client test.
- [ ] Add `/couriers` as a lazy route. Signed-out users see the existing sign-in route with a return intent. Signed-in users see application entry, pending review, rejection reason/resubmission, approval, or suspension as actually returned by the server.
- [ ] Implement a bounded application form with labeled inputs, field errors, unsaved-change feedback, and disabled duplicate submission. Reuse the same idempotency key on an uncertain retry; create a new key only when the logical mutation changes.
- [ ] Add service forms with canonical area/category selection, hours/closures, pickup/drop-off mode, shipping limits, capacity, and rate rows. Show unavailable references as setup required. Present currency and minor-unit conversion explicitly; validate on the server again. Keep draft and published status distinct.
- [ ] Test flows using isolated test records only: unauthenticated entry, draft save/reload, submit, rejected correction, pending service draft, approved publish, conflict reload, disabled backend. At 320/390/768/1024/1440px check labels, errors, rate rows, buttons, keyboard focus, and no clipped actions. No fake application success when storage is unavailable.
- [ ] Commit the tested portal changes and navigation entry.

## Task 6: Staff approval interface

**Interfaces:** client exports `getCourierApprovalQueue(cursor?)` and `decideCourierApplication(id,version,action,reason,key)`. `CourierApprovalsPanel` consumes the current staff identity and fetches only through these endpoints.

- [ ] Add tests for queue pagination, no permission, stale selection, duplicate decision retry, rejection requiring a reason, and approval persisting after reload. Example: an unauthorized owner cannot approve the same application through a direct HTTP request even if the panel is hidden.
- [ ] Add a permission-aware section to `OperationsWorkspace`. Do not weaken the existing operations login or create a preview-only staff identity. With POS login unavailable, show the existing unavailable state and test the permission boundary with isolated signed test sessions.
- [ ] Implement application summary, submitted details, decision history, reason field, and explicit approve/reject/suspend/reinstate actions permitted by the current state. Show the server-confirmed result only. Keep rejection/suspension reasons clear to owners while excluding internal security notes.
- [ ] Run permission tests, staff-session regressions, and mobile/desktop UI verification. Commit only the approval panel changes.

## Task 7: Release verification and handoff

- [ ] Add `test:couriers` to `package.json`, running policy, service, and API/client tests. Add it to the existing release gate without removing or weakening checks. Database verification remains an explicit mandatory pre-release command requiring a test connection.
- [ ] Run `npm run test:couriers`, `node tests/courier-database-regression.mjs`, both TypeScript project checks, and relevant existing security regressions. Run `npm run build`; report inherited generated-artifact failures separately. Build to a separate temporary output if necessary to verify compilation without deleting the user's existing artifacts.
- [ ] Review the diff for tenant isolation, error leakage, migration rollback behavior, unbounded queries, missing feature gates, and accidental POS edits. Confirm no credentials, mock production data, or public private-document storage were added.
- [ ] Document migration/application commands, enablement flag, required staff permission, governed reference-data setup, unavailable dependencies, tests actually run, and rollback by disabling the feature. Existing applications remain durable when disabled.
- [ ] Report increment 1 completion separately from the marketplace program. Paid bookings, customer checkout selection, tracking/proof, and settlements are not complete until their own increments are implemented and verified.

## Plan review

This increment covers application identity, approval, service coverage/hours/category/rates, ownership, audit, UI, and durable validation. It intentionally does not call the POS, accept payment, pretend a quote exists, or mark a delivery completed. The remaining program requirements are allocated to increment 2 (quote/checkout/booking/payment) and increment 3 (shipment/proof/dispute/settlement). Required external configuration is visible and fail-closed, not filled with fabricated data.
