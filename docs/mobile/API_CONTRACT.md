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
