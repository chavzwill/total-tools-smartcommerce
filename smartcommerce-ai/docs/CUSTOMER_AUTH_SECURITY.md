# SmartCommerce Customer Authentication

## Status

The customer account foundation provides real signup, login, logout, and persistent server-side sessions. It replaces the previous demo account state.

The persistent production datastore is a dedicated SmartCommerce Neon Postgres project. The customer/account schema has been applied and verified on the production database branch.

## Runtime configuration

Set the pooled Neon Postgres connection string in Vercel for Preview and Production:

```text
SMARTCOMMERCE_DATABASE_URL=
```

`DATABASE_URL` is also accepted by the server runtime as a fallback.

Do not expose the database URL through any `VITE_*` variable or client-side code.

## Security controls implemented

- Passwords are never stored in plaintext.
- Passwords are hashed with Node `scrypt` and a per-account random salt.
- Session tokens are 256-bit random opaque values.
- Only SHA-256 hashes of session tokens are persisted.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
- Login rotates any existing session presented by the browser.
- Logout revokes the server-side session before clearing the cookie.
- Sessions expire after 30 days.
- State-changing account requests enforce same-origin browser requests.
- Login and signup have best-effort per-instance burst limiting.
- Account responses use `Cache-Control: no-store`.
- Request bodies and account input lengths are bounded.
- Login failures use a generic invalid-credentials response.
- Database/provider errors are not returned directly to customers.

## Database schema

The dedicated SmartCommerce database currently owns:

- `customer_accounts`
- `customer_sessions`

The production schema was introduced through the Neon migration workflow and verified before application to the main database branch.

## Verified database behavior

A disposable acceptance transaction verified:

- account creation
- session creation linked to the customer
- account/session retrieval through the relationship
- cascade cleanup of sessions when the test customer was removed
- zero leftover acceptance records

## Not implemented yet

The following are intentionally not represented as complete:

- email verification
- password reset/recovery
- MFA
- global/distributed rate limiting
- customer address book
- persistent cart/wishlist
- POS/CRM customer identity links
- order history
- quote history
- rental history
- repair history
- commercial account linkage
- account deletion/export/privacy workflow
- security-event dashboard

## Production acceptance gate

Do not merge/enable customer accounts for public traffic until all of the following have been verified through the deployed application using the configured Neon database:

1. Create account.
2. Refresh and remain signed in.
3. Sign out and confirm the session is invalidated server-side.
4. Sign back in.
5. Invalid password returns the same public error regardless of whether an email exists.
6. One customer cannot retrieve another customer's account data.
7. Session cookie is HttpOnly/Secure/SameSite in production.
8. Repeated login/signup attempts are throttled.
9. Database outage fails closed without creating local/ephemeral identity state.
10. No password, raw session token, or database credential appears in logs.

## Next security phase

Implement email verification and password recovery with short-lived, single-use hashed tokens, followed by shared/distributed abuse protection and customer-provider identity mapping.
