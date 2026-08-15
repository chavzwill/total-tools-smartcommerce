# SmartCommerce Customer Authentication

## Status

The customer account foundation provides real signup, login, logout, persistent server-side sessions, email verification, and password-recovery flows. It replaces the previous demo account state.

The customer database is the dedicated SmartCommerce Neon Postgres project. Email delivery remains fail-closed until the mail provider configuration is present.

## Runtime configuration

Set the server-only Neon connection string in Vercel for Preview and Production:

```text
SMARTCOMMERCE_DATABASE_URL=
```

`DATABASE_URL` is also accepted as a fallback.

For verification and password-recovery email delivery, configure:

```text
SMARTCOMMERCE_APP_URL=https://total-tools-smartcommerce.vercel.app
SMARTCOMMERCE_EMAIL_FROM=SmartCommerce <account@your-verified-domain.example>
RESEND_API_KEY=
```

The sender must use a domain verified with the configured email provider. Do not expose database or email API credentials through `VITE_*` variables and do not commit them to the repository. Redeploy the relevant Vercel environment after adding or changing server environment variables.

## Security controls implemented

- Passwords are never stored in plaintext.
- Passwords are hashed with Node `scrypt` and a per-account random salt.
- Session tokens are 256-bit random opaque values.
- Only SHA-256 hashes of session tokens are persisted.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
- Login rotates any existing session presented by the browser.
- Logout revokes the server-side session before clearing the cookie.
- Sessions expire after 30 days.
- Email-verification and password-reset tokens are random opaque values; only their hashes are stored.
- Verification links expire after 24 hours.
- Password-reset links expire after 30 minutes.
- Issuing a new token invalidates earlier unused tokens for the same purpose.
- Successful password reset revokes all active customer sessions.
- Password-reset requests use the same public response whether or not an account exists.
- State-changing account requests enforce same-origin browser requests.
- Login, signup, verification, and recovery actions have best-effort per-instance burst limiting.
- Account responses use `Cache-Control: no-store`.
- Request bodies and account input lengths are bounded.
- Login failures use a generic invalid-credentials response.
- Database/provider errors are not returned directly to customers.
- Security emails use a configured canonical HTTPS application URL rather than the incoming Host header.

## Database schema

The dedicated SmartCommerce Neon database contains:

- `customer_accounts`
- `customer_sessions`
- `customer_security_tokens`

Schema changes must use the database migration workflow rather than runtime DDL.

## Verification/recovery acceptance gate

Before merging email verification and password recovery into public production traffic, verify:

1. An authenticated unverified customer can request a verification email.
2. The verification link marks only that account verified.
3. The same verification token cannot be used twice.
4. An expired verification token is rejected.
5. Forgot-password gives the same response for existing and non-existing email addresses.
6. A valid reset link changes the password.
7. The old password no longer works after reset.
8. Every pre-reset session is revoked.
9. The reset token cannot be used twice.
10. No raw verification/reset token is stored in the database or logs.
11. Mail-provider failure does not expose provider credentials or account existence.

## Still to implement

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

## Next security phase

After verification/recovery acceptance testing, add shared/distributed abuse protection and customer-provider identity mapping, then persistent cart/wishlist and account histories.
