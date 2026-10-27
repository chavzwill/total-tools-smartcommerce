# Mobile API contract v1

Base: configured HTTPS origin + `/api/mobile/v1`. The namespace is new; existing
website routes are not automatically available to native clients. No generic proxy.

Requests use `X-Smartcommerce-App: customer|courier` and, when authenticated,
`Authorization: Bearer <opaque access token>`. Never send browser session cookies.
Responses are JSON and no-store. Errors are `{error:{code,message,retryable}}` with
appropriate 400/401/403/404/409/413/429/503 status; raw database/provider errors remain private.
Session response: `{accessToken,refreshToken,accessExpiresAt,refreshExpiresAt,account:{id,fullName},audience}`.

| Routes | Method / input | Authentication | Implementation task |
|---|---|---|---|
| `/auth/login` | POST email, password, audience, deviceId, optional MFA code | Public, rate limited | 2 |
| `/auth/refresh` | POST refreshToken, audience | Refresh credential | 2 |
| `/auth/logout` | POST refreshToken, audience | Refresh credential; revoke its session family even if rotated | 2 |
| `/auth/logout-all` | POST empty object | Matching mobile audience | 2 |
| `/auth/me` | GET | Matching mobile audience | 2 |
| `/auth/signup`, `/auth/recovery` | POST existing account-policy fields | Public, rate limited | 3 |
| `/catalogue` | GET branchId, query, cursor | Public | 4 |
| `/products/:id`, `/parts` | GET branch/model context | Public | 4 |
| `/cart`, `/cart/items`, `/cart/items/:id` | GET / POST productId, quantity, branchId / PATCH quantity / DELETE | Customer | 5 |
| `/quotes`, `/checkout` | POST server quote inputs / quoteId, fulfillment, idempotencyKey | Customer | 5 |
| `/orders`, `/orders/:id` | GET cursor / order identity | Owning customer | 5 |
| `/driver/profile`, `/driver/application` | GET / POST application policy fields | Courier account | 6–7 |
| `/driver/offers`, `/driver/offers/:id/respond` | GET / POST action, expectedVersion, idempotencyKey, reason | Eligible driver | 7 |
| `/driver/jobs`, `/driver/jobs/:id` | GET | Assigned eligible driver | 8 |
| `/driver/jobs/:id/commands` | POST reviewed action, expectedVersion, idempotencyKey, payload | Assigned eligible driver | 8 |
| `/driver/jobs/:id/proof-upload`, `/driver/jobs/:id/proof` | POST MIME/length/key / uploadId, version, key | Assigned eligible driver | 9 |
| `/devices/push` | POST/DELETE token, app, deviceId | Matching audience | 10 |
| `/driver/earnings` | GET | Owning eligible driver | 10 |
| `/assistant`, `/rentals`, `/repairs`, `/commercial` | Explicit existing service actions | Customer plus service permissions | 11 |

This table is a build contract, not a claim that all routes are implemented. Exact
domain payloads are frozen with each task's service adapter and tests. Unsupported
capabilities return an explicit unavailable response. POS review/pickup/status write
contracts remain gated until their authenticated exchange is verified.

## Authentication checkpoint

Login, refresh, logout, logout-all and me have server handlers and an additive SQL
migration in `smartcommerce-ai/migrations/20261027_mobile_sessions.sql`. They are disabled
unless `SMARTCOMMERCE_MOBILE_AUTH_ENABLED=true`. Do not enable before applying and
verifying both migrations (sessions, then `20261027_mobile_mfa.sql`) in a disposable environment, then the approved target environment.
No production migration or feature activation has been performed by this checkpoint.

Access credentials expire after 15 minutes; refresh families expire absolutely after
30 days. Refresh rotates both credentials; replay revokes the entire family, including
after an ambiguous network failure. In that case the user must sign in again. Logout
accepts current or previously consumed refresh proof and revokes only that family.
Native logout-all revokes mobile families for both app audiences and browser/courier
cookie sessions. Browser sign-out-other-devices also revokes mobile families when
mobile authentication is enabled, preserving the initiating browser session. Password changes
invalidate all mobile families through the stored password fingerprint comparison.

Accounts with active authenticators receive `403 MFA_REQUIRED` until a valid six-digit
TOTP code is supplied with the password. The server verifies the existing encrypted
secret, then atomically consumes a monotonic authenticator counter while issuing the
session. Replay is rejected. Sessions carry a factor-set stamp, so factor changes or
password changes invalidate access and refresh. Recovery-code and native passkey
completion remain unsupported; those accounts must use the existing website security
flows. No account receives a password-only session to bypass an active factor.

SQL behavior tests execute the real migration and service queries in disposable local
PGlite databases. They do not access production; hosted PostgreSQL concurrency and
deployment acceptance are still required before activation.

## Native connection checkpoint

Each app has `src/connection.ts`, exporting a lazy `getConnection()` factory. Set
`EXPO_PUBLIC_API_ORIGIN` to the HTTPS origin for the intended environment. Missing or
insecure origins are rejected. The factory wires Expo SecureStore (unlocked, this-device
keychain access) to the shared session manager; it provides no localStorage fallback.
Call `connection.session.restore()` during auth-gate startup and use
`connection.session.login(...)` / `.logout()` for account actions. Protected service
calls use `connection.api.request(...)` and obtain access credentials from the manager.

Login, refresh and credential-proven logout use anonymous transport so restoration
cannot recursively attempt to refresh itself. MFA_REQUIRED is the only additional
allowlisted challenge code preserved from 403 errors; server error text is not displayed.
The shared native auth gate now consumes these modules on customer Account/Cart and
Courier screens. Session subscriptions immediately clear all mounted protected routes
on sign-out or unauthorized responses; protected content is keyed by account identity.

Writes are never retried automatically by transport. Domain callers retain the same
idempotency key when retrying an ambiguous action; 409 demands authorized state refresh.
Push and payment-return links trigger authorized reads, never financial mutations.

## Development

Run `npm ci` inside `mobile/`, then `npm run start:customer` or `npm run start:courier`.
Each app takes `EXPO_PUBLIC_API_ORIGIN` (origin only, HTTPS). No client secret belongs
in EXPO_PUBLIC values. EAS project IDs and signing are deliberately unconfigured until
real company-owned projects are connected. Android package and iOS bundle identifiers
are proposed `com.totaltools.smartcommerce.customer` / `.courier` and must be checked
against company registrations before store release.

## Functional screen checkpoint — 2026-10-27

- Customer: public catalogue search and product description, account sign-in/TOTP,
  persistent cart add/remove/quantity changes and server price quotes.
- Catalogue projects only public fields; configured business/provider context is injected
  server-side. No caller tenant headers, negotiated prices or internal metadata are forwarded.
- `/cart` explicitly adapts existing commerce actions and native customer identity; existing
  cookie origin controls remain. Quotes revalidate price, not inventory quantities.
- `/checkout` uses the verified native customer callback and existing payment policies.
  Browser origin protection remains for browser checkout. No client amount is accepted.
  Payment launch is disabled until the server returns available:true, which requires a
  trusted fulfillment reservation. Cart quotes do not produce that reservation; its
  producer remains a release blocker. Do not insert synthetic payment-order rows.
- Pending payment quote IDs are securely stored by app/account before the start request,
  survive app restarts, and are reconciled from server state; paid acknowledgments clear
  the pointer. The stored quote ID never proves payment or grants another account access.
- Courier: password/TOTP sign-in, owner application draft/submission and own assigned-job
  views. Linked individual drivers are identified by account_id; job reads require a
  matching driver_id and organization_id. No organization-wide driver access is granted.
- Legacy local approval flags are not treated as POS verification. Acceptance, pickup,
  status changes, proof and payout actions remain blocked pending reviewed POS contracts.
- 50 tests, mobile/server TypeScript, both iOS/Android/web exports and the existing web
  release build passed. Local browser checks covered sign-in, account navigation,
  catalogue fixture search/detail, and 320/390px reflow. Fixture data was test-only.
- Physical-device keychain/MFA/payment acceptance, hosted multi-connection SQL concurrency,
  signed builds, store publishing, production migrations and activation remain unverified.
  No real payment, dispatch mutation, deployment or production migration was performed.

## POS decision receiver checkpoint — 2026-10-27

Signed courier decisions now have a separate, disabled-by-default receiver at
`/api/integrations/pos/v1/courier-decisions`, an additive migration, transactional replay/
version/conflict checks, immutable POS/local identity binding and an expiring read projection.
See [POS driver contract](POS_DRIVER_CONTRACT.md) for the exact schema and handshake gate.
No POS sender or operational courier permission is enabled. Existing courier guards remain.
The connected POS workspace was unavailable during implementation (bridge returned 429),
so upstream sender/reservation support could not be verified or changed.
Verification for this checkpoint: all 57 mobile behavior tests, mobile/server TypeScript,
existing POS/courier authority regressions and the clean web release build pass. New SQL
runs in disposable PGlite only; hosted concurrency and the real sender handshake remain
unverified. App source screens are unchanged from the preceding export checkpoint.
