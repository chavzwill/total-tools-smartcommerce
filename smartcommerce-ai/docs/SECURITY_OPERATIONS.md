# SmartCommerce Security Operations

## Security-event retention

SmartCommerce retains security events for incident investigation and fraud analysis.

- Integrity-chained events (`chain_id` present) are never automatically deleted. Removing one would intentionally break the cryptographic audit chain. Archival or deletion of chained history requires an explicit chain-version rotation and a separately preserved/verifiable archive.
- Legacy unchained security events are retained for 400 days by default and may then be removed by the scheduled security monitor.
- The legacy retention period can be increased with `SMARTCOMMERCE_SECURITY_EVENT_RETENTION_DAYS`. The runtime clamps this value to 90–3650 days.
- This policy does not authorize deletion required to be preserved by law, contract, litigation hold, insurance, payment-provider rules, or an active incident investigation.

## Scheduled integrity monitoring

`/api/security-monitor` is a server-only scheduled endpoint. Vercel invokes it once daily through the cron entry in `vercel.json`. The endpoint requires `CRON_SECRET` and rejects requests that do not present the matching bearer credential.

Each run:

1. verifies the HMAC security-event integrity chain;
2. looks for newly recorded `critical` security events;
3. sends an external alert when integrity is invalid/unavailable or new critical events exist;
4. advances the critical-event alert cursor only after successful delivery; and
5. prunes only legacy unchained events older than the configured retention period.

The monitor deliberately does not expose security-event metadata, customer identifiers, IP addresses, user-agent values, or hashes in its external alert payload. Critical-event alerts contain only event IDs, event types, statuses, timestamps, and aggregate count.

## External alert delivery

Configure a server-only HTTPS webhook URL in `SMARTCOMMERCE_SECURITY_ALERT_WEBHOOK_URL`. An optional bearer credential may be supplied through `SMARTCOMMERCE_SECURITY_ALERT_WEBHOOK_TOKEN`.

The receiver may be a dedicated incident-management endpoint, SIEM ingestion endpoint, Slack/Teams relay, email relay, or another controlled security notification service. The URL and token must never be exposed as `VITE_` variables or committed to Git.

Alert delivery uses a short timeout. Failure to reach the external receiver does not mutate or discard the underlying security events. The critical-event cursor advances only after successful delivery so a later monitor run can retry undelivered critical alerts.

## Required production configuration

- `SMARTCOMMERCE_AUDIT_INTEGRITY_KEY` — HMAC audit-chain key, at least 32 characters.
- `CRON_SECRET` — random server-only credential used to authenticate scheduled monitor invocations.
- `SMARTCOMMERCE_SECURITY_ALERT_WEBHOOK_URL` — HTTPS external alert receiver.
- `SMARTCOMMERCE_SECURITY_ALERT_WEBHOOK_TOKEN` — optional receiver bearer token.
- `SMARTCOMMERCE_SECURITY_EVENT_RETENTION_DAYS` — optional legacy unchained-event retention override; default 400 days.

After configuration, production verification should confirm a valid integrity result, successful scheduled invocation, successful test alert delivery, and correct retry behavior when the alert receiver is intentionally unavailable.
