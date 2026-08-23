# SmartCommerce delivery notification operations

## Purpose
Delivery updates originate only from authoritative delivery lifecycle events. Customer-facing lifecycle updates create durable outbox records. In-app notifications are immediately available. External channels are enabled only when a real provider is configured.

## Supported outbound adapters
- Email: Resend REST API.
- SMS: Twilio Programmable Messaging.
- WhatsApp: Twilio WhatsApp Business Platform using an approved Content SID/template for proactive notifications.

## Required environment variables
### Shared retry worker
- `CRON_SECRET` — bearer secret for `/api/delivery-notification-worker`.

### Email / Resend
- `SMARTCOMMERCE_EMAIL_NOTIFICATIONS_ENABLED=true`
- `RESEND_API_KEY`
- `SMARTCOMMERCE_NOTIFICATION_EMAIL_FROM` — verified sender/domain, for example `Total Tools <orders@example.com>`.
- `RESEND_WEBHOOK_SECRET` — webhook signing secret for `/api/resend-delivery-status`.

Email is sent only when the SmartCommerce customer account has a verified email address.

### SMS / Twilio
- `SMARTCOMMERCE_SMS_NOTIFICATIONS_ENABLED=true`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- Either `SMARTCOMMERCE_TWILIO_MESSAGING_SERVICE_SID` or `SMARTCOMMERCE_TWILIO_SMS_FROM`.
- `SMARTCOMMERCE_TWILIO_STATUS_CALLBACK_URL` — exact public HTTPS URL for `/api/twilio-delivery-status`.

### WhatsApp / Twilio
- `SMARTCOMMERCE_WHATSAPP_NOTIFICATIONS_ENABLED=true`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `SMARTCOMMERCE_TWILIO_WHATSAPP_FROM`
- `SMARTCOMMERCE_TWILIO_WHATSAPP_CONTENT_SID` — approved template accepting variable 1 = order reference and variable 2 = delivery update.
- `SMARTCOMMERCE_TWILIO_STATUS_CALLBACK_URL`

## Integrity and retry rules
1. Outbox rows are unique by lifecycle event + channel.
2. Worker claims are atomic and stale claims can be recovered after five minutes.
3. Provider-accepted sends store the provider message ID before later delivery receipts are reconciled.
4. Explicit 429/5xx provider failures use bounded exponential retry.
5. Ambiguous or unconfigured sends are marked `uncertain` rather than blindly retried, reducing duplicate SMS/WhatsApp risk.
6. Twilio status callbacks are validated with `X-Twilio-Signature` before reconciliation.
7. Resend callbacks are verified with the Svix signing headers and webhook secret before reconciliation.
8. No provider credential is exposed to the browser.

## Vercel scheduling
Normal delivery status updates attempt external sends immediately. `/api/delivery-notification-worker` exists for retry processing and accepts only `Authorization: Bearer <CRON_SECRET>`.

Do not add a frequent Vercel Cron without confirming the project plan. Some Vercel plans restrict cron frequency; an invalid frequency can block deployments. Configure an appropriate schedule operationally after the hosting plan is confirmed.

## Staff guidance
- Customer-facing update: safe for notifications and tracking timeline.
- Internal note: staff-only; never included in outbound notifications.
- Do not close an order as Delivered/Collected without the required structured proof method and recipient/collector information.

## Bookkeeping / management
Notification provider costs are operational communication expenses, separate from courier provider cost and delivery revenue/markup. Review delivery-notification provider invoices independently from the delivery margin ledger.
