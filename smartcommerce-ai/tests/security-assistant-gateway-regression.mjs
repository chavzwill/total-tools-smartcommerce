import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../api/platform/[...path].ts", import.meta.url), "utf8");

const required = [
  ["assistant remains an explicitly allowlisted public POST", 'method === "POST" && path === "/api/platform/assistant"'],
  ["assistant path receives a dedicated branch", 'const assistantPublicPost = method === "POST" && path === "/api/platform/assistant"'],
  ["assistant has a stricter request-body ceiling", "const ASSISTANT_MAX_BODY_BYTES = 16 * 1024"],
  ["assistant has a finite durable request limit", "const ASSISTANT_RATE_LIMIT = 30"],
  ["assistant rate window is bounded", "const ASSISTANT_RATE_WINDOW_SECONDS = 300"],
  ["assistant browser requests are same-origin checked", "if (!sameOrigin(request))"],
  ["origin rejection is audited", 'eventType: "platform_assistant_origin_rejected"'],
  ["origin rejection is blocked", 'code: "ORIGIN_REJECTED"'],
  ["assistant uses durable rate limiting", "await enforceDurableRateLimit({"],
  ["assistant limiter is scoped separately", 'action: "platform_assistant_ip"'],
  ["assistant rate limiting keys on request IP", "subject: requestIp(request)"],
  ["assistant limiter uses its dedicated limit", "limit: ASSISTANT_RATE_LIMIT"],
  ["assistant limiter uses its dedicated window", "windowSeconds: ASSISTANT_RATE_WINDOW_SECONDS"],
  ["rate limiting returns Retry-After", 'response.setHeader("Retry-After", String(retryAfter))'],
  ["rate limiting is audited", 'eventType: "platform_assistant_rate_limited"'],
  ["rate limiting returns HTTP 429", "return sendJson(response, 429"],
  ["assistant body uses the stricter limit", "assistantPublicPost ? ASSISTANT_MAX_BODY_BYTES : MAX_BODY_BYTES"],
  ["protected platform operations remain fail closed", 'code: "PLATFORM_GATEWAY_NOT_CONFIGURED"'],
  ["protected platform operations still require authorization", 'code: "PLATFORM_AUTH_REQUIRED"'],
  ["gateway still strips caller authorization", 'normalized === "authorization"'],
  ["gateway still strips caller business identity", 'normalized === "x-business-account-id"'],
  ["gateway still strips caller provider identity", 'normalized === "x-provider-id"'],
  ["platform responses stay non-cacheable", 'response.setHeader("Cache-Control", "no-store")'],
];

for (const [description, fragment] of required) {
  assert.ok(gateway.includes(fragment), `Missing assistant gateway invariant: ${description}`);
}

const assistantAllowlistMatches = gateway.match(/method === "POST" && path === "\/api\/platform\/assistant"/g) || [];
assert.ok(assistantAllowlistMatches.length >= 2, "Assistant public POST should be both allowlisted and explicitly identified for controls");

assert.ok(
  gateway.indexOf("if (!sameOrigin(request))") < gateway.indexOf("const platformRequest = await toRequest("),
  "Assistant origin enforcement must happen before dispatch to the platform service",
);
assert.ok(
  gateway.indexOf('action: "platform_assistant_ip"') < gateway.indexOf("const platformRequest = await toRequest("),
  "Assistant durable rate limiting must happen before dispatch to the platform service",
);

console.log(`Assistant gateway security regression gate passed (${required.length + 2} invariants).`);
