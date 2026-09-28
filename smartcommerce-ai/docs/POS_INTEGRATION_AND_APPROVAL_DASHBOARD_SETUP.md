# SmartCommerce <-> POS Integration and Approval Dashboard Setup

## Purpose

This is the implementation runbook for the team receiving SmartCommerce.

It is written so a developer or coding AI can configure the receiving POS, connect it safely to SmartCommerce, expose the endpoints SmartCommerce expects, and build the POS-owned approval workspaces that SmartCommerce deliberately does not own.

**Do not treat this as optional integration documentation.** SmartCommerce is designed around a strict authority boundary:

- the **POS is authoritative** for operational catalogue identity, SKU/barcode, price/tax, branch stock, promotions, rental/repair operational state, staff approvals, payment/credit decisions, courier verification and payout decisions;
- **SmartCommerce is authoritative** for the customer-facing website experience, sessions/carts, website editorial fields, customer submissions and allowed website-originated requests;
- synchronization must use stable identities, versions, idempotency, replay protection and audit evidence.

As of the September 27, 2026 handoff:

- SmartCommerce canonical release: `main`, handoff tag `smartcommerce-v1.0-handoff`.
- The accepted SmartCommerce handoff commit is documented in `HANDOFF_RELEASE_2026-09-27.md`.
- The Total Tools POS current `master` includes the durable POS->SmartCommerce sync outbox merged in POS PR #95.
- SmartCommerce blocks POS-owned staff decisions locally. Those guards **must remain in place until the authenticated POS decision-ingestion path described below is implemented and tested**.

---

# 1. Target topology

```text
Customers / Couriers / Staff
            |
            v
      SmartCommerce
            |
            | HTTPS server-to-server
            |
     +------+---------------------------+
     |                                  |
     | SmartCommerce -> POS             | POS -> SmartCommerce
     |                                  |
     | GET catalogue / operations       | signed versioned events
     | POST website orders              | catalogue/stock/repair/rental events
     | staff login verification         | approval decisions (required extension)
     | repair/customer reads            |
     v                                  v
                    POS
          operational source of truth
```

Do not connect the two applications by sharing a database.

Do not let either browser application hold POS integration secrets.

Do not give SmartCommerce a database login to the POS.

Do not let the POS write directly into SmartCommerce tables.

All cross-system communication should go through authenticated, versioned HTTP contracts.

---

# 2. Required configuration

## 2.1 SmartCommerce server environment

The receiving team must configure these on the SmartCommerce server/runtime.

| Variable | Required for | Rules |
| --- | --- | --- |
| `SMARTCOMMERCE_TOTAL_TOOLS_POS_URL` | SmartCommerce -> POS reads and order delivery | HTTPS POS origin only; no embedded username/password |
| `SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY` | SmartCommerce -> POS machine authentication | server-only |
| `SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY_HEADER` | optional custom key header | defaults to `X-API-Key` |
| `SMARTCOMMERCE_TOTAL_TOOLS_POS_CURRENCY` | POS catalogue normalization | defaults to `JMD` |
| `SMARTCOMMERCE_POS_SYNC_SECRET` | POS -> SmartCommerce HMAC event signing | same secret configured in POS; minimum 32 characters |
| `SMARTCOMMERCE_POS_DELIVERY_SECRET` | trusted scheduler for website-order delivery worker | independent secret; minimum 32 characters |
| `SMARTCOMMERCE_PLATFORM_INTERNAL_TOKEN` | protected SmartCommerce platform/export endpoints | bearer token, server-only |
| `SMARTCOMMERCE_BUSINESS_ACCOUNT_ID` | platform context/export manifest | required for protected platform integration |
| `SMARTCOMMERCE_PROVIDER_ID` | provider identity | use a stable value such as `total-tools-pos` |
| `SMARTCOMMERCE_DATABASE_URL` / `DATABASE_URL` | durable SmartCommerce state | production database connection |
| `SMARTCOMMERCE_COURIER_DATA_KEY` | encrypted courier private documents/bank data | 32-byte key encoded as expected by runtime; server-only |
| `SMARTCOMMERCE_STAFF_SESSION_SECRET` | SmartCommerce-issued staff sessions after POS login | server-only |

Never put values for any of these variables in Git.

## 2.2 POS server environment

The POS needs the following integration configuration.

| Variable | Purpose |
| --- | --- |
| `SMARTCOMMERCE_SYNC_URL` | exact SmartCommerce event endpoint, normally `https://<smartcommerce-host>/api/integrations/pos/v1/events` |
| `SMARTCOMMERCE_POS_SYNC_SECRET` | same HMAC signing secret as SmartCommerce |
| POS API-key storage | create a machine credential for SmartCommerce with only the scopes it requires |

The current POS sync publisher refuses non-HTTPS SmartCommerce endpoints and will not publish when the endpoint or signing secret is missing.

---

# 3. Authentication model

Use **three different trust boundaries**. Do not collapse them into one credential.

## 3.1 SmartCommerce -> POS machine API key

SmartCommerce calls the POS with:

```http
X-API-Key: <server-only POS integration key>
```

The POS API-key middleware must:

1. store only a hash of the key;
2. support revocation and rotation;
3. rate-limit valid and invalid credentials separately;
4. authorize by explicit scopes;
5. reject API keys from employee-only/admin-only routes.

Minimum scopes for live website order delivery:

- `orders:read`
- `orders:write`

Catalogue reads require:

- `products:read`

Additional customer/repair integrations may require:

- `customers:read`
- `repairs:read`

Only grant scopes actually used.

## 3.2 POS -> SmartCommerce signed event authentication

Every POS event sent to SmartCommerce uses HMAC-SHA256.

Required headers:

```http
Content-Type: application/json
X-POS-Timestamp: <unix-seconds>
X-POS-Signature: sha256=<hex-hmac>
```

The signature is:

```text
HMAC_SHA256(
  SMARTCOMMERCE_POS_SYNC_SECRET,
  X-POS-Timestamp + "." + raw_request_body
)
```

SmartCommerce currently accepts a maximum signature age of 300 seconds.

Do not parse and reserialize JSON between signing and sending. Sign the exact raw body that is transmitted.

## 3.3 Staff authentication

SmartCommerce staff login is **verified by the POS**.

SmartCommerce sends staff credentials server-to-server to:

```http
POST /api/employees/login
```

The POS response must provide a valid employee identity and should include:

- `id`
- `username`
- `first_name`
- `last_name`
- `role`
- `security_group_id`
- `security_group_name`
- `default_branch_id`
- `default_branch_name`
- `branches[]`
- `permissions{}`

SmartCommerce then issues its own short-lived signed staff session. POS passwords/PINs are not stored in SmartCommerce.

---

# 4. POS endpoints SmartCommerce expects

The receiving POS should expose the following contracts.

## 4.1 Core catalogue/read endpoints

These are used by the current Total Tools read adapter.

| Method | Endpoint | Scope | Required behavior |
| --- | --- | --- | --- |
| GET | `/api/products` | `products:read` | search/filter products; must never expose internal cost to public/website callers |
| GET | `/api/products/:id` | `products:read` | stable product lookup |
| GET | `/api/categories` | `products:read` | category listing |
| GET | `/api/branches` | appropriate read scope | active branches and branch metadata |

`GET /api/products` should support these query parameters where applicable:

- `search`
- `category_id`
- `branch_id`
- `sku`
- `barcode`
- `page`
- `limit`

Product responses should expose stable IDs and customer-safe fields such as:

- product ID
- SKU
- barcode
- product name
- brand
- category ID
- description
- price
- tax rate/taxability
- active status
- online availability
- image URL/path
- branch availability if requested

Never expose:

- cost price
- margin
- internal notes
- supplier-sensitive terms
- hidden stock controls
- employee/private audit data

## 4.2 Rich commerce-sync reads on the current POS

The current POS also provides a richer SmartCommerce contract:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/commerce-sync/health` | integration health / contract version |
| GET | `/api/commerce-sync/catalog` | catalogue snapshot with categories, brands, products, branch inventory and variations |
| GET | `/api/commerce-sync/promotions` | promotion rules/scopes/codes |
| GET | `/api/commerce-sync/availability/:sku` | canonical product + branch availability |
| GET | `/api/commerce-sync/inventory-changes?since=<ISO>` | incremental branch inventory changes |

These endpoints should remain read-only.

The catalogue response must not leak cost fields.

Availability should return at minimum:

- branch ID
- branch name
- currency
- stock quantity
- sellable online quantity
- minimum stock where intentionally exposed to the trusted service
- authoritative branch price
- updated timestamp

## 4.3 SmartCommerce website-order contract

### Reconciliation

```http
GET /api/smartcommerce-orders/:externalOrderId
X-API-Key: ...
```

Required scope: `orders:read`.

Return:

- `404` only when the external order definitely does not exist;
- `200` with the existing transaction when found.

### Create

```http
POST /api/smartcommerce-orders
X-API-Key: ...
Content-Type: application/json
```

Required scope: `orders:write`.

Required request fields:

```json
{
  "external_order_id": "stable-smartcommerce-order-id",
  "branch_id": 1,
  "items": [
    { "product_id": 123, "quantity": 2 }
  ],
  "payment_method": "online",
  "external_payment_reference": "verified-payment-reference"
}
```

Optional supported fields include:

- `external_quote_id`
- `external_customer_id`
- numeric `customer_id`
- `employee_id`
- `notes`
- `delivery_amount`
- `service_amount`
- `handling_amount`
- approved tax-exemption fields
- approved `approval_code`

The POS must:

1. make `external_order_id` unique;
2. return the existing order for an idempotent replay;
3. calculate price/tax from current POS authority rather than browser-supplied values;
4. validate branch stock;
5. reserve/decrement stock transactionally;
6. reject insufficient stock;
7. never create two orders for the same SmartCommerce order identity.

SmartCommerce always reconciles by external order ID before creating.

---

# 5. Other POS endpoints used by SmartCommerce

## 5.1 Customer repair history

SmartCommerce links a verified customer account to POS service history using:

```http
GET /api/customers?search=<email-or-phone>&active=1
GET /api/work-orders?customer_id=<pos-customer-id>&limit=200
```

Technician evidence also reads:

```http
GET /api/work-orders?limit=200
GET /api/work-orders/:id
```

The receiving POS should return stable customer/work-order identities.

Ambiguous customer matching must not be guessed. SmartCommerce deliberately surfaces an account-link review condition instead.

## 5.2 Staff operations read gateway

SmartCommerce currently permits authenticated staff **reads** for these POS resources:

- `/api/work-orders`
- `/api/employees`
- `/api/products` (used as inventory source)
- `/api/suppliers`
- `/api/purchase-requests`
- `/api/purchase-orders`
- `/api/transfers`
- `/api/quotations`
- `/api/transactions`
- `/api/drawers`
- `/api/reports`
- `/api/rentals`
- `/api/customers`
- `/api/branches`

SmartCommerce's generic operations proxy is intentionally read-only for POST/PUT/PATCH/DELETE.

**Do not relax that read-only gate.** Operational writes and approvals belong in the POS UI.

---

# 6. POS -> SmartCommerce event synchronization

Current SmartCommerce inbound endpoint:

```http
POST /api/integrations/pos/v1/events
```

Maximum body size: 512 KiB.

Current accepted entity types:

- `brand`
- `category`
- `product`
- `product_variation`
- `media`
- `price`
- `availability`
- `promotion`
- `customer`
- `repair`
- `rental`
- `request`

The current POS outbox emits versioned events for the operational entities it owns, including category, product, price, media, product variation, availability, customer, promotion, rental and repair changes.

## 6.1 Event envelope

Every event must have this exact logical shape:

```json
{
  "eventId": "stable-event-id",
  "eventType": "product.upserted",
  "entityType": "product",
  "entityId": "123",
  "entityVersion": 7,
  "occurredAt": "2026-09-27T18:00:00.000Z",
  "source": "total_tools_pos",
  "correlationId": "stable-correlation-id",
  "payload": {}
}
```

Rules:

- `eventId` is stable across retries.
- `entityId` is the authoritative POS identity, never a mutable display name.
- `entityVersion` must increase monotonically for that entity.
- `eventType` must begin with `entityType + "."`.
- `source` must be exactly `total_tools_pos`.
- same event + same payload = replay;
- older version = stale;
- same version + different payload = conflict;
- dependency violations = blocked;
- no last-write-wins fallback.

SmartCommerce responses:

| HTTP | Meaning |
| --- | --- |
| 202 | newly applied |
| 200 | safe replay/stale acknowledgement |
| 409 | conflict or blocked dependency; human/system review required |
| 401 | invalid/expired signature |
| 400 | invalid envelope |
| 413 | payload too large |
| 503 | temporary processing/configuration failure; retry safely |

## 6.2 POS outbox requirements

The POS must persist events before attempting delivery.

Minimum outbox fields:

- event ID
- event type
- entity type
- entity ID
- entity version
- occurrence time
- correlation ID
- immutable payload JSON
- status
- attempt count
- next attempt time
- last HTTP status
- last safe error code
- delivered time

Do not publish directly from an HTTP request without durable outbox persistence.

Retry network failures, 408/429/5xx conditions with bounded exponential backoff.

Move 409 and deterministic 4xx contract/auth failures to a visible `needs_review` queue.

---

# 7. Initial reconciliation before continuous sync

Do not turn on continuous publication against a populated production catalogue without reconciliation.

Classify every existing entity as one of:

- matched confidently;
- possible match;
- website only;
- POS only;
- conflict.

Stable identity must use IDs/SKUs/barcodes/mappings, not fuzzy display names alone.

No destructive merge/delete should happen automatically.

Recommended dependency order for initial publication:

```text
Brand
  -> Category hierarchy
  -> Product
  -> Product variation
  -> Media
  -> Price
  -> Availability
  -> Promotion relationships
```

---

# 8. POS approval center: required dashboards

SmartCommerce intentionally does **not** own the following staff decisions.

The receiving POS should add a top-level staff workspace such as:

```text
Approvals
  - Courier Companies
  - Courier Documents
  - Courier Bank Verification
  - Courier Payouts
  - Commercial Accounts
  - Commercial Financial Overrides
  - Repair Authorizations
  - Technician Compensation
  - Integration Capabilities
  - Operational Approvals
```

Each queue must support:

- filtering by branch/status/age/risk where applicable;
- immutable record identity;
- expected/current version;
- assigned reviewer where desired;
- submitted timestamp;
- last changed timestamp;
- reason/notes;
- actor identity;
- audit history;
- explicit approve/reject/etc. actions;
- optimistic-concurrency rejection when the displayed version is stale.

Do not use a generic "change status" control.

Use domain-specific actions and validate legal transitions server-side.

---

# 9. Courier approval dashboards

Courier approval is the highest-priority POS-owned decision domain because SmartCommerce actively fail-closes courier operational access until POS authority exists.

## 9.1 Courier company registration queue

SmartCommerce organization states:

```text
draft -> submitted
submitted -> approved | rejected
approved -> suspended
suspended -> approved   (reinstate)
```

POS dashboard should show:

- organization ID
- business name
- owner/customer ID
- contact name
- email
- phone
- description
- application version
- submitted/updated timestamps
- document verification summary
- reason/history

Actions:

- Approve
- Reject
- Suspend
- Reinstate

Requirements:

- reason mandatory for reject/suspend and recommended for every staff decision;
- expected version mandatory;
- record reviewer employee ID and timestamp;
- approval must not succeed until required identity/business documents are verified.

## 9.2 Courier identity/business document queue

Document kinds currently supported:

- `identity`
- `business`

Document states:

```text
pending -> verified | rejected
verified/rejected -> revoked   (when revocation is justified)
```

POS UI should show metadata first:

- document ID
- account ID
- applicant name
- kind
- MIME type
- status
- version
- review reason

Private document bytes must be fetched only by an authorized reviewer and must not be placed in ordinary application logs.

Actions:

- Verify
- Reject
- Revoke

Required permission concept: `couriers_verify`.

## 9.3 Courier bank-verification queue

Bank states:

```text
pending -> verified | rejected
```

POS UI should show:

- organization ID
- business name
- masked account
- currency
- current bank version
- status
- reason
- updated timestamp

Sensitive full bank data must be shown only to an authorized payments reviewer.

Required permission concept: `couriers_payments`.

A changed bank account creates a new version and must return to pending verification.

## 9.4 Courier payout queue

Payout lifecycle:

```text
pending_review -> approved | rejected
approved       -> transfer_pending | cancelled
transfer_pending -> paid | needs_review
needs_review   -> paid | cancelled
```

When marking `paid`, require a transfer reference.

Before moving `approved -> transfer_pending`, verify that the exact bank version snapshotted on the payout is still the verified version.

Dashboard fields:

- payout ID
- organization ID / business name
- amount (integer minor units)
- currency
- bank version
- payout version
- current status
- transfer reference
- created timestamp
- associated earning IDs/count
- delivery/payment evidence summary

Never let a browser supply or alter payout amount.

The amount comes from eligible payable earnings.

---

# 10. Commercial account approval dashboards

SmartCommerce accepts commercial applications, but verification and financial privileges must remain governed.

## 10.1 Commercial organization verification queue

SmartCommerce submissions include:

- commercial account ID
- claimed account type
- legal/display name
- registration identifier
- tax identifier
- work email
- official-domain context where available
- risk flags
- applicant customer ID
- submitted timestamp

Common application states include submitted/under-review style states; the POS should own the final verification result.

The POS should manage:

- organization verification;
- verified provider/customer/account mapping;
- privilege enable/lock state;
- verification reference and reviewer evidence.

Do not enable commercial privileges simply because an account was created.

SmartCommerce privileged access requires all of the following to be true:

1. active commercial membership;
2. member authority status verified;
3. organization verification status verified;
4. organization privilege status enabled;
5. provider mapping verified.

## 10.2 Commercial financial controls

POS should own review/configuration of:

- credit enabled/disabled;
- credit limit in integer minor units;
- credit currency;
- payment terms;
- tax-exempt entitlement and validity dates;
- purchase-order entitlement;
- review reference;
- reviewed timestamp.

SmartCommerce treats unapproved financial controls as unavailable.

## 10.3 Financial override queue

SmartCommerce may submit manual-review requests of these types:

- `credit_limit_exceed`
- `temporary_credit_increase`
- `tax_exemption_exception`
- `purchase_order_exception`
- `payment_terms_exception`

Initial state:

```text
pending_review
```

The POS approval center should expose Approve/Reject with:

- request ID
- commercial account
- authenticated requester customer ID
- requested amount/currency where relevant
- requested terms
- reason
- existing financial controls
- reviewer reason
- decision reference
- timestamp

An approval must produce a narrowly scoped, auditable decision. Do not silently rewrite permanent limits when the request is intended to be a one-time exception.

---

# 11. Repair-authorization dashboard

Repair authorization states in SmartCommerce:

```text
pending -> approved | declined
pending -> superseded   (when a newer estimate/change order replaces it)
pending -> cancelled
```

SmartCommerce can create:

- initial estimate authorizations;
- change-order authorizations;
- customer approval links.

A customer may approve/decline their own authorization through customer-facing SmartCommerce.

**Manual staff recording of a customer's decision is POS-owned.**

POS repair dashboard should show:

- work order ID/number
- authorization ID
- version
- type: `initial_estimate` or `change_order`
- labor amount
- consumables amount
- parts amount
- total amount
- deposit amount
- scope
- reason
- requested by / requested at
- current status
- prior/superseded authorization reference
- existing decision channel and timestamp

Staff actions:

- Record Approved
- Record Declined

Require:

- current version/pending status;
- actor employee ID;
- decision channel;
- optional/required note according to policy;
- timestamp;
- durable audit event.

Do not let a staff action overwrite an already customer-decided or superseded authorization.

---

# 12. Technician compensation approval dashboard

SmartCommerce can calculate/store review-period evidence, but these actions are POS-owned:

- `approve_period`
- `finalize_period`

Suggested lifecycle:

```text
draft/review -> approved -> finalized
                      \-> adjusted (only through explicit adjustment workflow)
```

Dashboard should show:

- employee
- period start/end
- rate version
- compensation-plan ID/version
- evidence snapshot
- calculated result
- reviewer
- reviewed timestamp
- finalizer
- finalized timestamp

Approval and finalization must be separate permissions.

Recommended permission split:

- supervisor/reviewer can approve;
- payroll/admin can finalize.

Finalized periods should be immutable. Corrections should use an explicit adjustment record, never silent edits.

---

# 13. Integration-capability approvals

SmartCommerce's adaptive-integration API currently blocks capability:

- approve;
- reject;
- revoke.

These decisions should live in a POS/admin integration-control dashboard.

Each record should include:

- capability ID/name;
- requested permission/scope;
- provider/connection;
- requested by;
- evidence/validation status;
- requested timestamp;
- reviewer;
- reason;
- decision timestamp;
- current version.

Do not make "connection exists" equivalent to "capability approved".

---

# 14. Operational approvals stay in the POS

SmartCommerce exposes a read-only staff operations view, but it intentionally blocks generic writes.

Keep these decisions/actions in the POS:

- purchase-request approval/conversion;
- purchase-order approval/receiving;
- branch-transfer approval/pickup/dropoff/receive;
- quotation approval/conversion;
- transaction refund/financial operations;
- cash-drawer management;
- work-order assessment/payment/signoff/task/time operations;
- supplier changes;
- rental item/lifecycle management;
- customer master-data changes.

The POS permission system should continue to enforce its existing domain permissions such as:

- `pr_approve`
- `pr_convert`
- `purchasing_approve`
- `purchasing_receive`
- `transfers_approve`
- `transfers_pickup`
- `transfers_dropoff`
- `quotations_approve`
- `quotations_convert`
- work-order permissions
- transaction/refund permissions
- inventory/supplier/customer permissions

SmartCommerce should consume the resulting authoritative state through reads/events.

---

# 15. Approval decision synchronization back to SmartCommerce

## Current status

The ordinary POS commerce event endpoint exists and is production-hardened.

However, the current SmartCommerce release **does not yet accept all approval-domain entity types** such as courier organization/document/bank/payout or commercial-verification decisions.

Therefore:

**Do not remove SmartCommerce's fail-closed approval guards until this extension is implemented and acceptance-tested.**

## Preferred implementation

Extend the existing signed versioned event channel instead of creating a second authentication system.

Add explicit decision entity types to the SmartCommerce event contract, for example:

- `courier_organization`
- `courier_identity_document`
- `courier_bank_account`
- `courier_payout`
- `commercial_verification`
- `commercial_financial_control`
- `commercial_financial_override`
- `repair_authorization`
- `technician_compensation_period`
- `integration_capability`

Then publish events such as:

```text
courier_organization.approved
courier_organization.rejected
courier_organization.suspended
courier_organization.reinstated

courier_identity_document.verified
courier_identity_document.rejected
courier_identity_document.revoked

courier_bank_account.verified
courier_bank_account.rejected

courier_payout.approved
courier_payout.rejected
courier_payout.transfer_pending
courier_payout.paid
courier_payout.needs_review
courier_payout.cancelled

commercial_verification.approved
commercial_verification.rejected

commercial_financial_override.approved
commercial_financial_override.rejected

repair_authorization.approved
repair_authorization.declined

technician_compensation_period.approved
technician_compensation_period.finalized

integration_capability.approved
integration_capability.rejected
integration_capability.revoked
```

## Required decision payload fields

Every approval decision payload should contain at minimum:

```json
{
  "status": "approved",
  "expectedPreviousVersion": 3,
  "actor": {
    "employeeId": "42"
  },
  "reason": "Reviewed required evidence",
  "decisionReference": "POS-APR-000123",
  "decidedAt": "2026-09-27T18:00:00.000Z"
}
```

Domain-specific data may be added, but do not send secrets or decrypted private document/bank contents.

SmartCommerce ingestion must:

1. authenticate the HMAC;
2. validate event ID/version/entity;
3. check legal state transition;
4. verify expected/current version;
5. write decision + audit evidence atomically;
6. treat exact retries as replay;
7. reject stale/conflicting decisions;
8. never infer approval from absence of rejection;
9. never bypass the domain database guards with a generic SQL/admin override.

Only after that path is proven should the current `COURIER_POS_AUTHORITY_REQUIRED`, `COURIER_POS_VERIFICATION_PENDING` and `STAFF_POS_AUTHORITY_REQUIRED` guards be replaced with the reviewed POS decision-application contract.

---

# 16. POS approval-center UX standard

John's POS should not bury these queues in raw admin tables.

Recommended layout:

## Approval Center home

Cards/counters:

- Courier applications awaiting review
- Identity/business documents awaiting verification
- Bank accounts awaiting verification
- Payouts awaiting review/action
- Commercial applications awaiting verification
- Commercial overrides awaiting review
- Repair authorizations awaiting staff recording
- Technician pay periods awaiting approval/finalization
- Integration capabilities awaiting review
- Operational approvals awaiting action

Each card should display:

- count;
- oldest age;
- high-risk/exception count;
- branch where relevant.

## Queue row

Use a consistent row/card structure:

```text
[Status]  Entity / Applicant / Reference
          Submitted - Branch - Amount (when relevant)
          Risk/exception indicators
          Last change / version
                                      [Review]
```

## Review drawer/page

Sections:

1. Request summary
2. Identity/entity details
3. Evidence
4. Current authoritative state
5. History/audit trail
6. Decision controls

Decision controls should require a reason where the domain requires one.

Disable a decision button when the loaded version is stale.

After submission:

- show the new POS authoritative status;
- record actor/reason/timestamp;
- enqueue the SmartCommerce decision event;
- show sync state separately: `pending`, `delivered`, `needs_review`.

Never tell staff "SmartCommerce updated" until the outbox event is acknowledged.

---

# 17. Approval audit requirements

Every POS approval decision should produce an immutable audit record containing:

- event/decision ID;
- domain/entity type;
- entity ID;
- before version/state;
- after version/state;
- actor employee ID;
- actor security group/role snapshot where useful;
- branch where applicable;
- reason;
- decision reference;
- timestamp;
- correlation ID;
- SmartCommerce delivery status.

Do not audit decrypted bank/document contents.

---

# 18. Failure handling

## SmartCommerce unreachable

POS decision is still authoritative.

Persist decision locally and keep the SmartCommerce event pending in the outbox.

Retry later using the same event ID/version.

## SmartCommerce returns 409

Move the event to `needs_review`.

Do not invent a newer version and retry blindly.

Show the mismatch to an authorized operator.

## Lost HTTP response

Reconcile/retry using the same event identity.

## Duplicate event

SmartCommerce should return replay semantics, not reapply the decision.

## Stale dashboard tab

Server rejects the decision because expected version no longer matches.

The UI must refresh the record before another action.

---

# 19. Scheduler/background delivery

Two independent durable delivery loops exist conceptually:

## POS -> SmartCommerce event outbox

Current POS publisher can be invoked after successful POS mutations and on a periodic interval.

Keep a periodic drain even if post-mutation delivery exists, because process/network failures can occur after the local transaction commits.

## SmartCommerce -> POS website-order outbox

SmartCommerce's trusted scheduler calls:

```http
POST /api/pos-order-delivery
Authorization: Bearer <SMARTCOMMERCE_POS_DELIVERY_SECRET>
```

Each invocation processes bounded work.

Do not expose this scheduler secret to a browser.

---

# 20. Setup sequence for John's team / AI

Follow this order.

## Phase A - establish safe connectivity

- [ ] Confirm the POS public/server integration origin is HTTPS.
- [ ] Create a dedicated SmartCommerce POS API key.
- [ ] Grant only required scopes.
- [ ] Configure SmartCommerce POS URL/key.
- [ ] Configure matching POS/SmartCommerce HMAC secret.
- [ ] Configure POS `SMARTCOMMERCE_SYNC_URL`.
- [ ] Verify clocks/NTP on both servers.
- [ ] Verify SmartCommerce database migrations are applied.

## Phase B - verify read contracts

- [ ] `GET /api/products`
- [ ] `GET /api/products/:id`
- [ ] `GET /api/categories`
- [ ] `GET /api/branches`
- [ ] `GET /api/commerce-sync/health`
- [ ] `GET /api/commerce-sync/catalog`
- [ ] `GET /api/commerce-sync/promotions`
- [ ] `GET /api/commerce-sync/availability/:sku`
- [ ] customer search/work-order history where enabled
- [ ] confirm no cost/private-data leakage

## Phase C - verify POS -> SmartCommerce event sync

- [ ] mutation creates durable POS outbox event;
- [ ] signed event is accepted;
- [ ] duplicate event replays safely;
- [ ] stale version does not regress state;
- [ ] same-version/different-payload conflict fails closed;
- [ ] network failure leaves event pending/retryable;
- [ ] 409 enters needs-review.

## Phase D - verify website orders

- [ ] SmartCommerce reconciles unknown external order to 404;
- [ ] create website order;
- [ ] replay returns same POS order;
- [ ] concurrent duplicate create produces one transaction;
- [ ] insufficient branch stock rejects;
- [ ] lost create response reconciles by external order ID;
- [ ] delivery/service/handling totals persist;
- [ ] price mismatch becomes SmartCommerce needs-review rather than duplicate recreation.

## Phase E - build POS Approval Center

- [ ] Courier Companies
- [ ] Courier Documents
- [ ] Courier Banks
- [ ] Courier Payouts
- [ ] Commercial Verification
- [ ] Commercial Financial Controls/Overrides
- [ ] Repair Authorizations
- [ ] Technician Compensation
- [ ] Integration Capabilities
- [ ] Operational approval links/queues

## Phase F - implement decision ingestion

- [ ] extend SmartCommerce signed event entity allowlist;
- [ ] implement legal domain transitions;
- [ ] add audit records;
- [ ] add idempotency/replay/stale/conflict tests;
- [ ] add database concurrency tests;
- [ ] add POS-side outbox events;
- [ ] test end-to-end with non-production records;
- [ ] only then replace/remove the current fail-closed approval guards.

## Phase G - production acceptance

- [ ] verify production secrets are company-controlled;
- [ ] verify backups/rollback;
- [ ] verify monitoring/alerts for failed sync;
- [ ] verify `needs_review` queues are visible to operators;
- [ ] verify no default/test credentials;
- [ ] verify no browser has integration keys;
- [ ] verify branch/role permissions;
- [ ] verify audit retention;
- [ ] verify clock synchronization;
- [ ] run controlled live acceptance before broad enablement.

---

# 21. Acceptance tests that must exist

At minimum, keep automated tests for:

## Authentication/security

- invalid API key;
- revoked API key;
- missing scope;
- HMAC invalid;
- HMAC expired;
- body modified after signing;
- oversized payload;
- employee endpoint attempted with API key;
- cross-branch unauthorized access.

## Sync integrity

- replay;
- stale event;
- same-version conflict;
- out-of-order dependency;
- network retry;
- retry backoff;
- event identity immutability;
- version monotonicity.

## Orders

- duplicate submission;
- concurrent duplicate submission;
- stock race;
- lost response;
- reconciliation;
- total mismatch;
- invalid branch;
- invalid product;
- credit-account blocked/disabled.

## Approvals

For every domain:

- unauthorized reviewer;
- invalid transition;
- missing reason when required;
- stale expected version;
- duplicate decision event;
- decision retry;
- conflict response;
- audit record;
- POS commits but SmartCommerce offline;
- later outbox delivery succeeds;
- private/sensitive data is not logged.

---

# 22. What must NOT be changed

Do not:

- make SmartCommerce the staff approval authority;
- add hidden local "approve anyway" controls;
- remove POS-authority database guards before decision sync exists;
- share databases;
- use product/category names as synchronized identity;
- allow last-write-wins conflict resolution;
- create a new website order ID when retrying;
- send POS cost fields to the website;
- mark an event delivered based only on an attempted HTTP request;
- store raw secrets in audit tables;
- let browser code call the POS using the server API key;
- let an AI infer approval from incomplete evidence.

---

# 23. Source files to inspect before changing contracts

SmartCommerce:

- `docs/POS_COMMERCE_SYNC_ARCHITECTURE.md`
- `docs/POS_ORDER_DELIVERY.md`
- `docs/POS_APPROVAL_AUTHORITY.md`
- `api/integrations/pos/v1/[...path].ts`
- `api/pos-order-delivery.ts`
- `api/staff-session.ts`
- `api/operations/[...path].ts`
- `src/integrations/totalToolsPosReadAdapter.ts`
- `src/integrations/totalToolsPlatformRuntime.ts`
- `src/server/couriers/authority.ts`
- `src/server/staffApprovalAuthority.ts`
- `migrations/20260915_pos_commerce_sync.sql`
- `migrations/20260916_pos_order_delivery.sql`
- `migrations/20260926_courier_pos_authority.sql`

Current Total Tools POS reference implementation:

- `routes/commerce-sync.js`
- `routes/smartcommerce-orders.js`
- `lib/apiKeyAuth.js`
- `lib/smartcommerceSyncSchema.js`
- `lib/smartcommerceSyncPublisher.js`

Do not copy old feature branches over current POS master. Port only missing behavior onto the current hardened POS line.

---

# 24. Definition of complete

The integration is complete only when all of the following are true:

1. SmartCommerce reads authoritative POS catalogue/branch state.
2. Website orders reach the POS idempotently and reconcile after uncertainty.
3. POS operational changes publish durably to SmartCommerce.
4. Staff approval dashboards exist in the POS.
5. Every POS-owned decision has a legal server-side transition and audit record.
6. Approval decisions return to SmartCommerce through the signed, versioned, replay-safe integration.
7. SmartCommerce no longer needs to show "approval synchronization pending" for the connected domain.
8. Fail-closed guards are replaced only by reviewed authenticated decision ingestion, not deleted.
9. Both sides expose visible failed/needs-review queues.
10. Security, replay, concurrency, failure and production smoke tests pass on the exact release commits.

Until item 6 exists for a domain, the correct behavior is to remain blocked/fail-closed rather than simulate approval.
