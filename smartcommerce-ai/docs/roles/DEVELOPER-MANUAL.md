# Developer Manual

## Purpose

Define the non-negotiable implementation rules for SmartCommerce financial functionality.

## Architecture boundary

SmartCommerce orchestrates payments; approved payment providers/acquirers process sensitive card/wallet authorization. Do not expand PCI scope unnecessarily.

## Provider adapter contract

Each live provider integration should expose equivalent operations behind an internal interface, conceptually:

- create payment attempt/session;
- verify/fetch transaction;
- parse and verify webhook/event;
- normalize provider status;
- refund/full or partial where supported;
- fetch settlement/payout information where available;
- expose provider transaction and batch identifiers.

Provider-specific statuses must never leak into core order logic without normalization.

## Canonical states

Payment:
`created | awaiting_payment | authorized | paid | failed | cancelled | expired | partially_refunded | refunded | disputed`

Settlement:
`not_expected | pending | settled | partially_settled | mismatch | reversed`

Order fulfillment logic should depend on explicit business rules and verified payment state, not frontend redirects.

## Source-of-truth rules

- Browser/client success callbacks are UX signals only.
- Signed provider webhook plus provider verification API are authoritative evidence.
- Amount, currency, merchant identity, internal order reference, and processor transaction identity must be checked server-side.
- Never trust client-provided `paid=true`, total, provider reference, or settlement status.

## Idempotency

Payment creation, event ingestion, fulfillment transitions, and refunds must be safe under retries. Provider webhook delivery is at-least-once in practice; duplicate events must not duplicate orders, receipts, stock commits, refunds, accounting posts, or notifications.

Persist provider event IDs or a deterministic deduplication key. Financial state transitions should be transactional wherever practical.

## Webhook ingestion

A webhook endpoint must:

1. receive raw payload in the form required for signature verification;
2. verify provider signature/authentication before parsing business meaning;
3. reject unsupported merchant/account context;
4. map the event to the internal payment attempt;
5. verify amount/currency/order reference where applicable;
6. enforce idempotency;
7. append an auditable event record;
8. update payment state only through allowed transitions;
9. trigger fulfillment/accounting side effects only once;
10. return the provider-required acknowledgement promptly.

Heavy reconciliation/notification work should be decoupled from webhook acknowledgement if needed.

## Payment record requirements

Do not overwrite important financial history. Maintain auditable fields/events for:
- internal IDs;
- order/invoice/customer references;
- gross/currency;
- method/provider;
- processor IDs;
- authorization IDs;
- state transitions;
- provider event IDs;
- refunds;
- fees and net settlement;
- settlement batch/reference;
- reconciliation state;
- actors/reasons for manual actions.

## Security

- Never store CVV.
- Do not log PAN/card tokens in plaintext unless explicitly safe/provider-approved; default to redaction.
- Keep provider secrets server-side only.
- Separate test/sandbox and live credentials.
- Validate webhook replay/timestamp controls when the provider supplies them.
- Restrict refund/configuration endpoints with role-based authorization.
- Financial audit logs must not be casually editable through ordinary admin UI.
- Avoid exposing provider secrets or raw sensitive payloads to browser telemetry.

## Money representation

Use integer minor units or an exact decimal money type according to currency rules. Never use binary floating-point arithmetic for totals, fees, refunds, or reconciliation.

Every financial amount carries an explicit currency. Never compare or aggregate JMD and USD without an intentional conversion/accounting process.

## Reconciliation

Model settlement separately from customer payment. The reconciliation engine should match processor transaction -> internal payment -> order/invoice -> provider settlement batch -> bank/accounting deposit.

Normal cases auto-reconcile. Exceptions need durable reason codes and human-resolution audit fields.

## Testing gate

A provider adapter is incomplete until automated/integration tests cover:
- successful payment;
- decline;
- cancellation/abandonment;
- duplicate webhook;
- out-of-order webhook;
- delayed webhook + verification fallback;
- invalid signature;
- wrong amount;
- wrong currency;
- unknown transaction;
- duplicate payment attempt;
- full refund;
- partial refund where supported;
- failed refund;
- dispute/chargeback event where supported;
- settlement match;
- missing/mismatched settlement;
- retry/idempotency behavior.

## Observability

Emit correlation IDs linking order, internal payment, provider transaction, webhook event, refund, and settlement batch. Dashboards/alerts should surface payment failures and reconciliation exceptions without logging sensitive payment data.

## Provider selection constraint

Do not build a production adapter until merchant onboarding confirms the exact product/API and capabilities available to Total Tools. Marketing claims about Apple Pay, Google Pay, or other wallets are not enough; verify the merchant account/acquirer configuration and supported Jamaican settlement path.

## Documentation rule

Every material payment change updates:
- `payments/PAYMENTS-ARCHITECTURE.md`;
- relevant role manual(s);
- `IMPLEMENTATION-DECISION-LOG.md`.

A payment feature without operational documentation is not production complete.
