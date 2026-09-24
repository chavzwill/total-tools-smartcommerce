# Delivery status and proof: local implementation

The delivery module extends trusted `courier_pickups` assignments. It does not create orders, collect payments, release earnings, contact the POS, or infer assignment/customer ownership from an order number.

## Contracts

- Apply onboarding, identity/payments and `20260918_courier_delivery.sql` in that order. These migrations remain local and undeployed. The identity/payments migration also now checks the expected driver version before removal.
- The trusted dispatch source must provide the driver, organization, branch, real order reference, parcel items and destination. It must set `customer_account_id` from authenticated order ownership. Null customer ownership is deliberately invisible to customers. Guest tracking is not enabled.
- Only the assigned active driver may report progress, after a recorded warehouse/branch collection. Driver identity and both business verification documents must still be verified; the company must remain approved. Staff and company owners can read permitted shipments but cannot impersonate a driver update.
- Normal sequence: collected, in transit, out for delivery, delivered. Delay and failed-attempt events preserve the current stage. Failed attempt requires out for delivery. Returns, reassignment and cancellation workflows are not implemented by this module.
- Every write includes expectedVersion and an idempotency UUID. Row locks serialize concurrent reports; a repeated successful command returns its receipt. Reusing a key for different contents fails. Authorization is rechecked before replay.
- Delivered requires a recipient name and JPEG/PNG photo (2 MiB maximum). The server checks MIME signatures and bounds, encrypts the payload with the existing courier AES-GCM key, and saves proof, state, event and receipt atomically. This records the driver's submitted evidence; it does not claim independent recipient verification or automatically release earnings. Signature checks are not an image malware scanner.
- Customer reads require the standard customer session. Courier reads/writes require the separate courier session. Staff reads require couriers_pickup and an assigned branch. Audience is selected by the endpoint, never browser input.
- List responses exclude proof bytes and recipient name. Proof retrieval rechecks access, records a private audit event, decrypts on the server and uses no-store responses. No public proof URL is created.
- Event receipt time is server-owned; a driver's optional report time is stored separately and bounded by collection time and a five-minute future tolerance. Version order determines history order. Read pages contain up to 50 shipments and the latest 100 events per shipment.

## Endpoints

GET/POST `/api/courier-deliveries`, `/api/customer-deliveries`, `/api/staff-deliveries`. GET returns a cursor-paginated list; POST accepts read_proof, with update_status limited to the courier endpoint. All use the existing courier feature flag, rate limits, same-origin POST validation and sanitized failures. Missing database configuration, migrations or encryption configuration fails closed.

## Verification

Regression coverage uses disposable local PostgreSQL for transitions, actor isolation, live verification, concurrent writes, idempotency, proof/state atomicity, audited access and actual repository encryption/decryption. Separate tests cover command/body validation, endpoint audience and session boundaries, and client error handling.

Production dispatch ingestion and checkout payment/order integration remain required before real customer deliveries can appear. No production sample orders or earnings are seeded.
