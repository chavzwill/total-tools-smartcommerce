# POS courier decision receiver v1

Receiving-side implementation only. No POS sender, real handshake, production migration,
or operational courier authorization is claimed. All existing POS-only database triggers
and application guards remain. A synchronized approval never permits pickup or delivery.

## Endpoint and authentication

`POST /api/integrations/pos/v1/courier-decisions`, JSON, maximum 16 KiB.
Disabled unless `SMARTCOMMERCE_POS_DRIVER_SYNC_ENABLED=true` and a separate server-only
`SMARTCOMMERCE_POS_DRIVER_SYNC_SECRET` of at least 32 characters is configured.
Do not reuse the public catalogue or mobile credentials. Apply
`20261027_pos_driver_decisions.sql` after courier identity migrations before enabling.
The existing POS commerce event route and its secret are independent.

Headers: `x-pos-timestamp` is integer Unix seconds, within five minutes of server time;
`x-pos-signature` is hexadecimal HMAC-SHA256 over the UTF-8 bytes
`timestamp + "." + exact raw request body`, optionally prefixed `sha256=`.
Raw body parsing is disabled at the route. The sender must sign the exact bytes sent.
HTTPS is required at deployment; never send the signing secret in the request body.

Exact JSON shape (all fields required, unknown fields rejected):

```json
{
  "eventId": "pos-courier-decision-unique-id",
  "source": "total_tools_pos",
  "entityType": "courier_driver",
  "eventType": "courier_driver.decision",
  "entityId": "immutable-pos-driver-id",
  "entityVersion": 1,
  "occurredAt": "2026-10-27T12:00:00Z",
  "correlationId": "pos-review-request-id",
  "payload": {
    "driverId": "00000000-0000-4000-8000-000000000001",
    "organizationId": "00000000-0000-4000-8000-000000000002",
    "accountId": "existing-smartcommerce-account-id",
    "posOrganizationId": "immutable-pos-organization-id",
    "organizationStatus": "approved",
    "driverStatus": "approved",
    "actorId": "authenticated-pos-staff-id",
    "reason": "Identity and membership reviewed",
    "validUntil": "2026-10-27T12:15:00Z"
  }
}
```

Organization states: `approved`, `suspended`, `rejected`. Driver states: `approved`,
`suspended`, `revoked`. IDs, actor and correlation are trimmed nonempty strings of
at most 200 characters; reason at most 1000. Local driver/organization IDs are lowercase
UUIDs. Versions are positive safe integers, monotonic per POS driver. No client-supplied
permissions, job IDs, destination, private identity documents or bank data are accepted.

`validUntil` must be in the future and at most 15 minutes after `occurredAt`;
`occurredAt` cannot exceed server time by more than one minute. Renewals require a newer
version. An exact expired event cannot renew authority; send a newly reviewed snapshot.
The projection reports expiry on read. Suspension/rejection/revocation override approval.
The server validates current local membership at ingestion and again on projection reads.
The receiver never creates drivers, changes membership, approves legacy applications,
or changes local driver active flags. Membership provisioning remains a separate trusted
POS integration requirement. POS/local identity remapping requires a reviewed migration.

## Transaction and retry semantics

The database serializes admission, checks event ID/content collision and current driver
version, updates the projection and appends an audit record atomically. Hashes use
PostgreSQL canonical JSONB; transport property ordering does not affect them.

| Status | HTTP | Sender behavior |
|---|---:|---|
| `applied` | 202 | Acknowledge receiving-side projection only |
| `replayed` | 200 | Exact replay or equal-version identical content; no update |
| `stale` | 200 | Older version ignored; do not lower the sender version |
| `conflict` | 409 | Stop automatic retry; investigate ID/version/content collision |
| `blocked` | 409 | Repair missing/mismatched membership, retry exact event while valid |
| signature rejected | 401 | Repair signing/clock; no writes occur |
| invalid payload | 400 | Repair schema; no writes occur |
| unavailable | 503 | Retry same event with a fresh transport timestamp/signature |

Equal-version semantic content includes all fields except eventId and correlationId.
A changed timestamp, expiry, decision, actor or reason requires a new version.
Every authenticated valid admission attempt records actor, reason, version, correlation
and disposition. Secrets/signatures are never recorded. Database functions and tables
have no PUBLIC grants and require the trusted server database role. PGlite tests verify
SQL behavior, not hosted multi-connection concurrency.

When the receiver feature flag is enabled, native `/driver/profile` includes
`posDecision: {state, version, validUntil, canUpdate:false}` or null. It always retains
`verificationPending:true` and `canUpdate:false`. No app button consumes this as an
operational permission.

## Handshake and action release gate

Before activation, test in disposable hosted PostgreSQL and the real POS sandbox:
correct/wrong signature, body mutation, missing membership, two drivers in one organization,
exact replay, conflicting event ID, stale version, simultaneous updates, suspension,
expiry and membership reassignment. Verify the separate POS signing secret and rotation
procedure. Existing courier authority regression suites must continue passing.

Acceptance, pickup, delivery status, proof and payout remain unavailable. They need
separate reviewed command/assignment contracts and transactional eligibility checks;
this endpoint cannot be used as an override. No receiving POS repository was modified.

## Checkout reservation dependency

`api/commerce.ts` creates a price snapshot in `checkout_quotes`; it never reserves POS
inventory. `smartcommerce_payment_claim` requires a trusted `smartcommerce_payment_orders`
row with an unexpired fulfillment reference (and a matching shipping hold for delivery).
The current POS adapter provides no product-stock reserve/release/commit contract.
A sender/producer cannot be safely implemented by copying catalogue availability.

Before implementing the producer, the POS must expose authenticated idempotent
reserve/read/release/commit operations with immutable reservation ID, quote/item and price
binding, branch, quantities, expiry, currency, total and provider mode. Define stock/price
conflict responses, expiry during payment, timeout reconciliation and payment settlement
handoff. Match the current customer-owned server quote and amount transactionally; never
accept a reservation assertion or total from the native app. Do not seed payment rows to
enable the button. Live checkout stays disabled until this end-to-end contract is verified.

Run `npm --prefix mobile test` for the behavior suite. It uses one worker and a
60-second fixture-hook budget for disposable PostgreSQL/WASM initialization; test
assertion deadlines remain unchanged. No network database or real POS is used by it.
