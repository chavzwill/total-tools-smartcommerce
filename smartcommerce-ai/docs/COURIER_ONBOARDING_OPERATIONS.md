# Courier onboarding operations

This increment provides courier applications, service/rate configuration, dedicated courier sessions, private verification, driver invitations, revocable pickup QR passes, branch-scoped order lookup/handover, and manual payout records. It does not collect customer payments, create authoritative bookings/dispatch assignments, perform bank transfers, or send orders to the POS. The feature is disabled by default.

## Configuration

- Use the existing server-only `SMARTCOMMERCE_DATABASE_URL` (or `DATABASE_URL`) account database.
- Review and explicitly apply `migrations/20260916_courier_onboarding.sql` to that database. Existing `customer_accounts` and `customer_sessions` must already exist. The migration preserves a text or UUID customer ID type and refuses unsupported types; it is replayable and inserts no production sample data.
- Set `SMARTCOMMERCE_PUBLIC_ORIGIN` to the exact trusted website origin in production. Mutations fail closed when it is absent. Development permits same-origin localhost only.
- Set `SMARTCOMMERCE_COURIERS_ENABLED=true` only after migration and permissions are verified. This enables onboarding, not paid booking.
- Reviewer sessions must carry `permissions.couriers_manage === true` from the existing staff identity issuer. General reports access, role names, and customer sign-in do not grant approval permission. The existing staff issuer depends on POS authentication. This implementation neither changes POS permissions nor provides a bypass if it is unavailable.
- Existing durable rate-limit infrastructure must be installed. Missing storage produces an unavailable response; no fallback memory store is used.
- Apply `migrations/20260917_courier_identity_payments.sql` after the onboarding migration. Both are required before enabling the feature. It adds verification gating to approval and eligibility.
- Configure a server-only, randomly generated 32-byte base64 `SMARTCOMMERCE_COURIER_DATA_KEY`. It encrypts private documents and bank details with authenticated encryption and derives opaque pickup/invitation credentials. Back it up securely. Key rotation requires an explicit re-encryption migration and pass revocation; changing it in place makes old encrypted records unreadable.
- Courier authentication uses the existing SmartCommerce identity/password primitives through `/api/courier-account`, with a separate `sc_courier_session` cookie and durable session table. Shopper sessions are rejected by courier APIs. Password changes invalidate courier sessions through a credential stamp. Login pages are separate; this does not create a second password database for the same person.
- Staff document review requires `couriers_verify`, payment review requires `couriers_payments`, and pickup requires `couriers_pickup`, each explicitly `true` in the signed staff session. Populate `courier_staff_branches` through a reviewed administrative migration with authoritative staff/branch assignments. A general branch list in a staff session is not treated as pickup authority.
- Driver invitations must match the authenticated account email, and that email must be verified through the existing account-verification process. Owners cannot verify driver identities themselves.
- Documents accept bounded PDF/JPEG/PNG content with matching file signatures and are delivered as authenticated downloads. Signature checking is not malware scanning. Set the organization's retention/review process before collecting real identity documents. No public document URLs are produced.

## Pickup and payout dependencies

Each driver has one current pass, expiring after 24 hours. A replacement revokes the earlier pass. Scanning opens the staff pickup screen and reads current driver verification, company approval, and the branch-scoped assigned orders. Staff explicitly confirm all listed items; an idempotent receipt records the handover. A QR alone never grants warehouse access.

`courier_pickups` must be populated by a trusted order/dispatch integration using authoritative order numbers, item quantities, destinations, branch IDs and driver assignments. No browser endpoint creates these records, and this increment does not connect the paused POS adapter. Until that integration exists, scans truthfully show no assigned orders; do not manually seed production examples.

`courier_earnings` is reserved for authoritative paid bookings with accepted delivery evidence. No browser endpoint invents earnings or marks customer orders paid. A payout request reserves existing payable entries, snapshots verified bank details and requires staff approval. Staff then arrange the transfer outside SmartCommerce and record its reference. Ambiguous transfers go to `needs_review`; approval is never reported as a completed transfer. The payout amount is computed from the ledger, not accepted from the browser. Without the booking/delivery adapter there are no production earnings to pay.

The local UI harness at `tests/ui/courier.html` contains labeled test-only data and is not imported into the production build. It verifies component behavior, not live external integrations.

## Reference data

`courier_references` holds approved origin/destination areas, collection points, catalogue category identifiers, and supported currency codes. Operations supplies these through a reviewed data migration. Category IDs must be imported from the authoritative configured catalogue and kept consistent with it. Area identifiers must be stable and map to documented geography. Names are for display only.

Columns are `kind`, `id`, `name`, and `active`; permitted kinds are `area`, `category`, `collection_point`, and `currency`. No entries are automatically invented. Until the required areas, categories, and currencies exist, the courier can maintain an application but cannot save a valid service. Collection-point delivery additionally requires governed collection points.

Rates use integer minor units; weights use grams; dimensions use millimetres. Weight bands are lower-inclusive/upper-exclusive. To include the maximum permitted whole-gram weight, a final band's upper bound may equal the service maximum plus one. The UI must explain this boundary rather than silently rounding. Prices can be explicitly zero; missing price is invalid. Each service edit returns to draft and creates a version; publication must be an explicit action after approval.

Service settings are versioned in `courier_service_versions`; application and service actions are recorded in `courier_events`. Existing published services are excluded immediately when the organization is suspended. Approval does not enable checkout booking in this increment.

## Verification

Run `npm run test:couriers` and both TypeScript projects. The release gate includes courier policy, service validation, and API/client tests.

For database tests, use only a disposable PostgreSQL database named `courier_test` on localhost. Set `COURIER_TEST_DATABASE_URL` to that test connection and `PSQL_PATH` to the local psql executable, then run `npm run test:couriers-database`. These tests insert test accounts and reference records exclusively into that named local database. The test scripts reject remote hosts and other database names; never use a production connection.

Database coverage includes migration replay, foreign-key identity, ownership, duplicate command replay, conflicting payloads, concurrent review decisions, audit atomicity, service version history, suspension filtering, and the actual server repository queries. The repository integration test swaps only the database transport from Neon HTTP to local psql; production SQL and validation remain under test.

Production readiness additionally requires real account sessions, actual reviewer permission issuance, governed reference data, secure database credentials, and deployed API routing. A passing local fixture test is not evidence that those external dependencies are configured.

## Rollback and support

Disable `SMARTCOMMERCE_COURIERS_ENABLED` to stop new API use while retaining durable records. Do not drop tables or delete application history as a rollback. Existing storefront workflows remain separate.

Use correlation IDs returned by the APIs to investigate failures. Never expose raw database exceptions, credentials, or private application details in public errors or logs. A 409 requires refreshing the current record; an uncertain retry must reuse its original idempotency key and unchanged payload.

Later increments implement validated delivery quotes, customer courier selection and payment reconciliation, then shipment status, private proof uploads, disputes, and settlement records. Do not advertise these as active until implemented and verified.
