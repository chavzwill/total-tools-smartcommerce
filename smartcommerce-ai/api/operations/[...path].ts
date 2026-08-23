import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../../src/server/hardenedOutboundFetch.js";
import { abandonOperationsMutation, claimOperationsMutation, completeOperationsMutation, markOperationsMutationUncertain, validIdempotencyKey } from "../../src/server/operationsMutationIdempotency.js";
import { validateOperationsState } from "../../src/server/operationsStateGuards.js";
import { firstHeader, recordSecurityEvent } from "../../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../../src/server/staffSession.js";

const MAX_BODY_BYTES = 128 * 1024;

type PermissionRequirement = string | string[];
type ResourceRule = { upstream: string; read: PermissionRequirement; write?: PermissionRequirement };

const RESOURCE_RULES: Record<string, ResourceRule> = {
  "work-orders": { upstream: "work-orders", read: "work_orders", write: "work_orders" },
  employees: { upstream: "employees", read: "employees", write: "employees_edit" },
  inventory: { upstream: "products", read: ["inventory", "pos", "quotations", "transfers"], write: "inventory_edit" },
  warehouse: { upstream: "warehouse", read: ["warehouse", "cycle-counts", "inventory"], write: "warehouse" },
  suppliers: { upstream: "suppliers", read: "suppliers", write: "suppliers_edit" },
  "purchase-requests": { upstream: "purchase-requests", read: "purchase_requests", write: "pr_create" },
  "purchase-orders": { upstream: "purchase-orders", read: "purchasing", write: "purchasing_create" },
  transfers: { upstream: "transfers", read: "transfers", write: "transfers_create" },
  quotations: { upstream: "quotations", read: "quotations", write: "quotations_create" },
  transactions: { upstream: "transactions", read: ["transactions", "pos"], write: "pos" },
  drawers: { upstream: "drawers", read: ["drawers", "pos"], write: "drawers" },
  denominations: { upstream: "denominations", read: "pos", write: "settings" },
  reports: { upstream: "reports", read: "reports" },
  rentals: { upstream: "rentals", read: "rentals", write: "rentals_manage_items" },
  customers: { upstream: "customers", read: ["customers", "pos", "quotations"], write: "customers_edit" },
  branches: { upstream: "branches", read: ["pos", "quotations", "transfers", "purchasing"] },
};

const BRANCH_FIELDS = [
  "branch_id",
  "source_branch_id",
  "destination_branch_id",
  "from_branch_id",
  "to_branch_id",
  "pickup_branch_id",
  "dropoff_branch_id",
] as const;

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.end(JSON.stringify(payload));
}

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readBody(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk === undefined || chunk === null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("REQUEST_TOO_LARGE") as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function requestedSegments(request: any) {
  const raw = request.query?.path;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") return raw.split("/").filter(Boolean);
  const pathname = new URL(String(request.url || "/"), "https://smartcommerce.local").pathname;
  return pathname.replace(/^\/api\/operations\/?/, "").split("/").filter(Boolean);
}

function requiredPermission(method: string, rule: ResourceRule, segments: string[]): PermissionRequirement {
  if (method === "GET" || method === "HEAD") return rule.read;
  const joined = segments.join("/");
  if (segments[0] === "work-orders") {
    if (/\/confirm-parts(?:\/|$)/.test(joined) || /\/parts(?:\/|$)/.test(joined)) return "wo_assign_parts";
    if (/\/assessment-paid(?:\/|$)/.test(joined) || /\/deposit-paid(?:\/|$)/.test(joined) || /\/final-payment(?:\/|$)/.test(joined)) return ["wo_assess", "pos"];
    if (/\/estimate(?:\/|$)/.test(joined) || /\/assessment(?:\/|$)/.test(joined)) return "wo_assess";
    if (/\/signoff(?:\/|$)/.test(joined)) return "wo_signoff";
    if (/\/tasks(?:\/|$)/.test(joined) || /\/time(?:\/|$)/.test(joined)) return "wo_technician";
    if (method === "POST" && segments.length === 1) return "wo_intake";
  }
  if (segments[0] === "warehouse") {
    if (segments[1] === "cycle-counts") return "cycle-counts";
    return "warehouse";
  }
  if (segments[0] === "purchase-requests") {
    if (/\/status(?:\/|$)/.test(joined) && method === "PATCH") return ["pr_create", "pr_approve"];
    if (/\/convert(?:\/|$)/.test(joined)) return "pr_convert";
  }
  if (segments[0] === "purchase-orders") {
    if (/\/receive(?:\/|$)/.test(joined)) return "purchasing_receive";
    if (/\/status(?:\/|$)/.test(joined) && method === "PATCH") return ["purchasing_create", "purchasing_approve"];
  }
  if (segments[0] === "transfers") {
    if (/\/approve(?:\/|$)/.test(joined)) return "transfers_approve";
    if (/\/dispatch(?:\/|$)/.test(joined) || /\/pickup(?:\/|$)/.test(joined)) return "transfers_pickup";
    if (/\/dropoff|\/receive/.test(joined)) return "transfers_dropoff";
  }
  if (segments[0] === "quotations") {
    if (/\/status(?:\/|$)/.test(joined) && method === "PATCH") return ["quotations_create", "quotations_approve"];
    if (/\/approve(?:\/|$)/.test(joined)) return "quotations_approve";
    if (/\/convert(?:\/|$)/.test(joined)) return "quotations_convert";
  }
  if (segments[0] === "transactions") {
    if (/\/hold(?:\/|$)/.test(joined)) return "pos_hold";
    if (/\/return(?:\/|$)/.test(joined) && method === "POST") return "transactions_returns";
    if (/\/refund(?:\/|$)/.test(joined)) return "transactions_refund";
    if (/\/void(?:\/|$)/.test(joined) && method === "PATCH") return "pos";
    if (method === "POST" && segments.length === 1) return "pos";
  }
  if (segments[0] === "drawers") {
    if (segments[1] === "sessions") return "pos";
    return rule.write || "drawers";
  }
  return rule.write || rule.read;
}

function hasRequiredPermission(staff: NonNullable<ReturnType<typeof readStaffSession>>, requirement: PermissionRequirement) {
  return Array.isArray(requirement) ? requirement.some((permission) => canStaff(staff, permission)) : canStaff(staff, requirement);
}

function parseJsonBody(body: Buffer | undefined, contentType: string | undefined) {
  if (!body?.length || !contentType?.toLowerCase().includes("application/json")) return null;
  try { return JSON.parse(body.toString("utf8")) as Record<string, unknown>; } catch { return null; }
}

function isMutation(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function staffBranchScope(staff: NonNullable<ReturnType<typeof readStaffSession>>) {
  const scope = new Set<string>();
  for (const branch of Array.isArray(staff.branches) ? staff.branches : []) {
    const id = String(branch?.id || "").trim();
    if (id) scope.add(id);
  }
  if (staff.defaultBranchId) scope.add(String(staff.defaultBranchId));
  return scope;
}

function requestedBranchIds(incoming: URL, jsonBody: Record<string, unknown> | null) {
  const ids = new Set<string>();
  for (const field of BRANCH_FIELDS) {
    for (const value of incoming.searchParams.getAll(field)) {
      const id = String(value || "").trim();
      if (id) ids.add(id);
    }
    const raw = jsonBody?.[field];
    if (Array.isArray(raw)) {
      for (const value of raw) {
        const id = String(value || "").trim();
        if (id) ids.add(id);
      }
    } else {
      const id = String(raw || "").trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  const segments = requestedSegments(request);
  const resource = segments[0] || "";
  const rule = RESOURCE_RULES[resource];
  let mutationRecordKey = "";
  let upstreamMutationAttempted = false;
  if (!rule) return send(response, 404, { success: false, error: { code: "OPERATIONS_ROUTE_NOT_FOUND", message: "That operations resource is not exposed." } });
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) return send(response, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "That method is not allowed." } });
  if (!sameOrigin(request)) {
    await recordSecurityEvent({ request, eventType: "staff_operations_origin_rejected", eventStatus: "blocked", riskLevel: "high" }).catch(() => undefined);
    return send(response, 403, { success: false, error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });
  }
  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  const staff = readStaffSession(token);
  if (!staff) return send(response, 401, { success: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
  const permission = requiredPermission(method, rule, segments);
  if (!hasRequiredPermission(staff, permission)) {
    const permissionLabel = Array.isArray(permission) ? permission.join(" OR ") : permission;
    await recordSecurityEvent({ request, eventType: "staff_operations_permission_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId, metadata: { permission: permissionLabel, resource, method } }).catch(() => undefined);
    return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow this operation.", details: { permission: permissionLabel } } });
  }
  try {
    const contentType = firstHeader(request.headers?.["content-type"]);
    const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
    const jsonBody = parseJsonBody(body, contentType);
    const incoming = new URL(String(request.url || "/"), "https://smartcommerce.local");
    const requestedBranches = requestedBranchIds(incoming, jsonBody);
    if (requestedBranches.length) {
      const scope = staffBranchScope(staff);
      const denied = requestedBranches.filter((branchId) => !scope.has(branchId));
      if (denied.length) {
        await recordSecurityEvent({ request, eventType: "staff_operations_branch_scope_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId, metadata: { resource, method, requestedBranchCount: requestedBranches.length, deniedBranchCount: denied.length } }).catch(() => undefined);
        return send(response, 403, { success: false, error: { code: "STAFF_BRANCH_SCOPE_DENIED", message: "Your staff session does not allow access to one or more requested branches." } });
      }
    }

    if (resource === "transactions" && method === "POST" && segments.length === 1 && Number(jsonBody?.discount_amount || 0) > 0 && !canStaff(staff, "pos_discounts")) {
      return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow POS discounts.", details: { permission: "pos_discounts" } } });
    }
    if (resource === "transactions" && method === "POST" && segments[1] === "hold" && Number(jsonBody?.discount_amount || 0) > 0 && !canStaff(staff, "pos_discounts")) {
      return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow POS discounts.", details: { permission: "pos_discounts" } } });
    }
    if (resource === "quotations" && method === "PATCH" && segments[2] === "status") {
      const nextStatus = String(jsonBody?.status || "");
      const required = nextStatus === "accepted" || nextStatus === "declined" ? "quotations_approve" : "quotations_create";
      if (!canStaff(staff, required)) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow this quotation status change.", details: { permission: required } } });
    }
    if (resource === "purchase-orders" && method === "PATCH" && segments[2] === "status") {
      const nextStatus = String(jsonBody?.status || "");
      const required = nextStatus === "approved" ? "purchasing_approve" : "purchasing_create";
      if (!canStaff(staff, required)) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow this purchase-order status change.", details: { permission: required } } });
    }
    if (resource === "purchase-requests" && method === "PATCH" && segments[2] === "status") {
      const nextStatus = String(jsonBody?.status || "");
      const required = nextStatus === "approved" || nextStatus === "rejected" ? "pr_approve" : "pr_create";
      if (!canStaff(staff, required)) return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow this purchase-request status change.", details: { permission: required } } });
    }
    if (resource === "inventory" && method === "PATCH" && segments[2] === "stock") {
      const adjustment = Number(jsonBody?.adjustment);
      const reason = String(jsonBody?.reason || "").trim();
      if (!Number.isInteger(adjustment) || adjustment === 0 || !reason) {
        return send(response, 400, { success: false, error: { code: "INVALID_STOCK_ADJUSTMENT", message: "Stock adjustments require a non-zero whole-number quantity and an audit reason." } });
      }
    }

    if (isMutation(method)) {
      const key = validIdempotencyKey(firstHeader(request.headers?.["idempotency-key"]));
      if (!key) return send(response, 400, { success: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid Idempotency-Key is required for Operations changes." } });
      const claim = await claimOperationsMutation({ actorId: staff.employeeId, operation: `${method}:${segments.join("/")}`, idempotencyKey: key, method, pathname: String(request.url || `/api/operations/${segments.join("/")}`), body });
      if (claim.replay) {
        response.statusCode = claim.replay.status;
        response.setHeader("Content-Type", claim.replay.contentType);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Idempotency-Replayed", "true");
        return response.end(claim.replay.body);
      }
      if (claim.inProgress) return send(response, 409, { success: false, error: { code: "IDEMPOTENCY_REQUEST_IN_PROGRESS", message: "This operation is already processing or has an uncertain upstream outcome. Verify the authoritative POS state before retrying." } });
      mutationRecordKey = claim.recordKey;
    }

    const baseUrl = configuredPos();
    const upstreamSegments = [rule.upstream, ...segments.slice(1)].map((segment) => encodeURIComponent(segment));
    const upstreamUrl = new URL(`${baseUrl}/api/${upstreamSegments.join("/")}`);
    incoming.searchParams.forEach((value, key) => { if (key !== "path") upstreamUrl.searchParams.append(key, value); });
    const headers: Record<string, string> = { Accept: "application/json" };
    if (contentType) headers["Content-Type"] = contentType;
    const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
    if (apiKey) headers["X-API-Key"] = apiKey;
    headers["X-SmartCommerce-Actor-Id"] = staff.employeeId;
    if (staff.defaultBranchId) headers["X-SmartCommerce-Branch-Id"] = staff.defaultBranchId;
    const requestFetch = createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 2_000_000 });

    if (isMutation(method)) {
      const stateError = await validateOperationsState({ baseUrl, headers, requestFetch, resource, method, segments, jsonBody });
      if (stateError) {
        if (mutationRecordKey) await abandonOperationsMutation(mutationRecordKey).catch(() => undefined);
        mutationRecordKey = "";
        await recordSecurityEvent({ request, eventType: "staff_operations_state_transition_blocked", eventStatus: "blocked", riskLevel: "medium", subject: staff.employeeId, metadata: { resource, method, operation: segments.join("/"), code: stateError.code } }).catch(() => undefined);
        return send(response, 409, { success: false, error: stateError });
      }
    }

    if (resource === "inventory" && method === "PATCH" && segments[2] === "stock" && Number(jsonBody?.adjustment) < 0) {
      const productUrl = new URL(`${baseUrl}/api/products/${encodeURIComponent(segments[1])}`);
      const branchId = String(jsonBody?.branch_id || staff.defaultBranchId || "").trim();
      if (branchId) productUrl.searchParams.set("branch_id", branchId);
      const currentResponse = await requestFetch(productUrl, { method: "GET", headers: { ...headers, "Content-Type": "application/json" } });
      if (!currentResponse.ok) {
        if (mutationRecordKey) await abandonOperationsMutation(mutationRecordKey).catch(() => undefined);
        mutationRecordKey = "";
        return send(response, 409, { success: false, error: { code: "STOCK_STATE_UNAVAILABLE", message: "Current stock could not be verified. No adjustment was made." } });
      }
      const current = await currentResponse.json() as Record<string, unknown>;
      const currentQty = Number(branchId ? current.branch_stock_qty : current.stock_qty || 0);
      if (currentQty + Number(jsonBody?.adjustment) < 0) {
        if (mutationRecordKey) await abandonOperationsMutation(mutationRecordKey).catch(() => undefined);
        mutationRecordKey = "";
        return send(response, 409, { success: false, error: { code: "NEGATIVE_STOCK_BLOCKED", message: `This adjustment would reduce stock below zero. Current available stock is ${currentQty}.` } });
      }
    }

    if (isMutation(method)) upstreamMutationAttempted = true;
    const upstream = await requestFetch(upstreamUrl, { method, headers, body });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const responseContentType = upstream.headers.get("content-type") || "application/json";
    if (mutationRecordKey) await completeOperationsMutation(mutationRecordKey, upstream.status, responseContentType, bytes);
    response.statusCode = upstream.status;
    response.setHeader("Content-Type", responseContentType);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (mutationRecordKey) response.setHeader("X-Idempotency-Key-Accepted", "true");
    response.end(bytes);
  } catch (error) {
    if (mutationRecordKey) {
      if (upstreamMutationAttempted) await markOperationsMutationUncertain(mutationRecordKey, error instanceof Error ? error.message : "upstream_request_failed").catch(() => undefined);
      else await abandonOperationsMutation(mutationRecordKey).catch(() => undefined);
    }
    const status = Number((error as any)?.status || 500);
    if (status === 413) return send(response, 413, { success: false, error: { code: "REQUEST_TOO_LARGE", message: "The operations request is too large." } });
    const code = error instanceof Error ? error.message : "OPERATIONS_GATEWAY_ERROR";
    if (code === "OPERATIONS_IDEMPOTENCY_KEY_REUSED") return send(response, 409, { success: false, error: { code, message: "That idempotency key was already used for a different Operations request." } });
    if (code === "OPERATIONS_IDEMPOTENCY_DATABASE_NOT_CONFIGURED") return send(response, 503, { success: false, error: { code, message: "Duplicate-submit protection is not configured, so this write was blocked rather than sent unsafely.", retryable: true } });
    console.error("staff_operations_gateway_error", { code, resource, method, upstreamMutationAttempted });
    return send(response, 503, { success: false, error: { code: code === "POS_NOT_CONFIGURED" ? code : "OPERATIONS_GATEWAY_UNAVAILABLE", message: upstreamMutationAttempted ? "The POS outcome could not be confirmed. The operation is locked against automatic retry until the authoritative POS state is verified." : "The Total Tools operations service is temporarily unavailable.", retryable: !upstreamMutationAttempted } });
  }
}
