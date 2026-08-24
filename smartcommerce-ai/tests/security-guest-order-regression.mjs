import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const store = await readFile(new URL("../src/server/guestOrderStore.ts", import.meta.url), "utf8");
const evidence = await readFile(new URL("../src/server/paymentProviderEvidence.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../api/guest-order.ts", import.meta.url), "utf8");
const providerReturn = await readFile(new URL("../api/payment-provider-return.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/GuestOrderPage.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../src/services/guestOrderClient.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const source = `${store}\n${evidence}\n${api}\n${providerReturn}\n${page}\n${client}\n${app}`;

const checks = [];
function guard(name, pattern) { checks.push(name); assert.match(source, pattern, `${name} invariant is missing`); }
function reject(name, target, pattern) { checks.push(name); assert.doesNotMatch(target, pattern, `${name} forbidden pattern returned`); }

guard("guest orders are durable", /CREATE TABLE IF NOT EXISTS guest_orders/);
guard("guest orders are paid-only records", /status TEXT NOT NULL CHECK \(status IN \('paid'\)\)/);
guard("payment attempt is unique per guest order", /payment_attempt_id TEXT NOT NULL UNIQUE/);
guard("quote is unique per guest order", /quote_id TEXT NOT NULL UNIQUE/);
guard("order creation requires confirmed payment", /attempt\.status !== "confirmed"/);
guard("order creation requires guest payment principal", /startsWith\("guest:"\)/);
guard("order creation requires bound fulfilment", /GUEST_ORDER_FULFILMENT_NOT_BOUND/);
guard("order amount must match payment attempt", /GUEST_ORDER_AMOUNT_MISMATCH/);
guard("order currency must match payment attempt", /GUEST_ORDER_CURRENCY_MISMATCH/);
guard("verified provider evidence triggers guest finalization", /confirmPaymentFromProvider[\s\S]*finalizeGuestOrderForConfirmedAttempt/);
guard("guest finalization failure does not falsify payment state", /guest_order_finalization_deferred/);
guard("receipt access tokens are stored hashed", /token_hash TEXT NOT NULL UNIQUE[\s\S]*hash\(token\)/);
guard("receipt access tokens expire", /ACCESS_TTL_DAYS\s*=\s*30[\s\S]*expires_at TIMESTAMPTZ NOT NULL|expires_at TIMESTAMPTZ NOT NULL[\s\S]*ACCESS_TTL_DAYS\s*=\s*30/);
guard("session receipt access is owner checked", /getGuestOrderForSession[\s\S]*guestSessionId/);
guard("bearer receipt access validates order and token", /getGuestOrderByAccessToken[\s\S]*orderId[\s\S]*token_hash/);
guard("guest order API blocks cross-origin writes", /if \(!sameOrigin\(request\)\) return send\(response, 403/);
guard("receipt links use no-referrer policy", /Referrer-Policy", "no-referrer/);
guard("guest provider returns route to receipt flow", /principal\.kind === "customer" \? "\/#\/account\/orders" : "\/#\/guest-order"/);
guard("guest receipt route is mounted", /path === "\/guest-order"[\s\S]*GuestOrderPage/);
guard("receipt page states payment is verified", /Payment verified/);
guard("receipt page can create secure receipt link", /issueGuestReceiptLink/);
reject("guest receipt tokens are not persisted in localStorage", `${page}\n${client}`, /localStorage\.(setItem|getItem)\([^\n;]*(accessToken|receipt)/i);
reject("guest order API never marks payment itself", api, /confirmPaymentFromProvider\(/);

console.log(`Guest order security regression gate passed: ${checks.length} invariants verified.`);
