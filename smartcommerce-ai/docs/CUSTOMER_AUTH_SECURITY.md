# SmartCommerce Customer Authentication

## Status

The customer account foundation provides real signup, login, logout, and persistent server-side sessions. It replaces the previous demo account state.

This feature must remain fail-closed until the dedicated SmartCommerce Neon Postgres database is configured.

## Runtime configuration

Set the server-only Neon connection string in Vercel for Preview and Production as appropriate:

```text
SMARTCOMMERCE_DATABASE_URL=
```

`DATABASE_URL` is also accepted as a fallback.

Do not expose the database URL through any `VITE_*` variable and do not commit it to the repository. After adding or changing the environment variable, redeploy the relevant Vercel environment so the function receives the new value.

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

The dedicated SmartCommerce Neon database contains:

- `customer_accounts`
- `customer_sessions`

Schema changes must use the database migration workflow rather than runtime DDL.

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

Do not merge/enable customer accounts for public traffic until all of the following have been verified against the configured persistent database:

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
