import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(
  new URL("../src/integrations/totalToolsPlatformRuntime.ts", import.meta.url),
  "utf8",
);
const platformGateway = await readFile(
  new URL("../api/platform/[...path].ts", import.meta.url),
  "utf8",
);
const assistantGateway = await readFile(
  new URL("../api/assistant.ts", import.meta.url),
  "utf8",
);
const advisorClient = await readFile(
  new URL("../src/lib/advisor.ts", import.meta.url),
  "utf8",
);

const invariants = [
  [
    "assistant readiness still requires server-trusted actor provenance",
    runtime.includes("const trustedCustomerId = context.actorId && input.customerId"),
  ],
  [
    "workflow handoff receives only the trusted customer identity",
    runtime.includes("customerId: trustedCustomerId"),
  ],
  [
    "legacy public platform gateway strips client-supplied actor identity",
    platformGateway.includes('normalized === "x-actor-id"') && platformGateway.includes("!privileged"),
  ],
  [
    "session-aware assistant gateway reads the HttpOnly SmartCommerce session cookie",
    assistantGateway.includes('const COOKIE_NAME = "sc_session"') && assistantGateway.includes("request.headers?.cookie"),
  ],
  [
    "assistant gateway validates the session against non-revoked unexpired server state",
    assistantGateway.includes("FROM customer_sessions") &&
      assistantGateway.includes("revoked_at IS NULL") &&
      assistantGateway.includes("expires_at > NOW()"),
  ],
  [
    "assistant gateway injects actor identity only from the validated session",
    assistantGateway.includes('headers.set("x-actor-id", customerId)') &&
      assistantGateway.includes("const customerId = await authenticatedCustomerId(request)"),
  ],
  [
    "browser-supplied customer identity is replaced by the authenticated session identity",
    assistantGateway.includes("...(customerId ? { customerId } : {})") &&
      assistantGateway.includes("delete (sanitized as Record<string, unknown>).customerId"),
  ],
  [
    "advisor traffic uses the session-aware assistant gateway",
    advisorClient.includes('api.post<AssistantResult>("/assistant", request)') &&
      !advisorClient.includes('api.post<AssistantResult>("/platform/assistant", request)'),
  ],
];

for (const [description, satisfied] of invariants) {
  assert.ok(satisfied, `Missing identity provenance invariant: ${description}`);
}

console.log(`Assistant identity provenance regression gate passed (${invariants.length} invariants).`);
