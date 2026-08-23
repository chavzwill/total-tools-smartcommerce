import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../../src/server/hardenedOutboundFetch.js";
import { firstHeader, recordSecurityEvent } from "../../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../../src/server/staffSession.js";

const MAX_BODY_BYTES = 128 * 1024;

type PermissionRequirement = string | string[];
type ResourceRule = { upstream: string; read: PermissionRequirement; write?: PermissionRequirement };

const RESOURCE_RULES: Record<string, ResourceRule> = {
  "work-orders": { upstream: "work-orders", read: "work_orders", write: "work_orders" },
  employees: { upstream: "employees", read: "employees", write: "employees_edit" },
  inventory: { upstream: "products", read: ["inventory", "pos"], write: "inventory_edit" },
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
  customers: { upstream: "customers", read: ["customers", "pos"], write: "customers_edit" },
  branches: { upstream: "branches", read: "pos" },
};

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
  if (segments[0] === "purchase-requests") {
    if (/\/approve(?:\/|$)/.test(joined) || /\/status(?:\/|$)/.test(joined)) return "pr_approve";
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
  return Array.isArray(requirement)
    ? requirement.some((permission) => canStaff(staff, permission))
    : canStaff(staff, requirement);
}

function parseJsonBody(body: Buffer | undefined, contentType: string | undefined) {
  if (!body?.length || !contentType?.toLowerCase().includes("application/json")) return null;
  try { return JSON.parse(body.toString("utf8")) as Record<string, unknown>; } catch { return null; }
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  const segments = requestedSegments(request);
  const resource = segments[0] || "";
  const rule = RESOURCE_RULES[resource];

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

    if (resource === "transactions" && method === "POST" && segments.length === 1 && Number(jsonBody?.discount_amount || 0) > 0 && !canStaff(staff, "pos_discounts")) {
      await recordSecurityEvent({ request, eventType: "staff_pos_discount_permission_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId, metadata: { discountAmount: Number(jsonBody?.discount_amount || 0) } }).catch(() => undefined);
      return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow POS discounts.", details: { permission: "pos_discounts" } } });
    }
    if (resource === "transactions" && method === "POST" && segments[1] === "hold" && Number(jsonBody?.discount_amount || 0) > 0 && !canStaff(staff, "pos_discounts")) {
      await recordSecurityEvent({ request, eventType: "staff_pos_hold_discount_permission_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId, metadata: { discountAmount: Number(jsonBody?.discount_amount || 0) } }).catch(() => undefined);
      return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow POS discounts.", details: { permission: "pos_discounts" } } });
    }
    if (resource === "quotations" && method === "PATCH" && segments[2] === "status") {
      const nextStatus = String(jsonBody?.status || "");
      const required = nextStatus === "accepted" || nextStatus === "declined" ? "quotations_approve" : "quotations_create";
      if (!canStaff(staff, required)) {
        await recordSecurityEvent({ request, eventType: "staff_quotation_status_permission_denied", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId, metadata: { status: nextStatus, permission: required } }).catch(() => undefined);
        return send(response, 403, { success: false, error: { code: "STAFF_PERMISSION_DENIED", message: "Your security group does not allow this quotation status change.", details: { permission: required } } });
      }
    }

    const baseUrl = configuredPos();
    const upstreamSegments = [rule.upstream, ...segments.slice(1)].map((segment) => encodeURIComponent(segment));
    const incoming = new URL(String(request.url || "/"), "https://smartcommerce.local");
    const upstreamUrl = new URL(`${baseUrl}/api/${upstreamSegments.join("/")}`);
    incoming.searchParams.forEach((value, key) => { if (key !== "path") upstreamUrl.searchParams.append(key, value); });

    const headers: Record<string, string> = { Accept: "application/json" };
    if (contentType) headers["Content-Type"] = contentType;
    const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
    if (apiKey) headers["X-API-Key"] = apiKey;
    headers["X-SmartCommerce-Actor-Id"] = staff.employeeId;
    if (staff.defaultBranchId) headers["X-SmartCommerce-Branch-Id"] = staff.defaultBranchId;

    const requestFetch = createHardenedServerFetch({ timeoutMs: 9000, maxResponseBytes: 2_000_000 });
    const upstream = await requestFetch(upstreamUrl, { method, headers, body });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    response.statusCode = upstream.status;
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(bytes);
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    if (status === 413) return send(response, 413, { success: false, error: { code: "REQUEST_TOO_LARGE", message: "The operations request is too large." } });
    const code = error instanceof Error ? error.message : "OPERATIONS_GATEWAY_ERROR";
    console.error("staff_operations_gateway_error", { code, resource, method });
    return send(response, 503, { success: false, error: { code: code === "POS_NOT_CONFIGURED" ? code : "OPERATIONS_GATEWAY_UNAVAILABLE", message: "The Total Tools operations service is temporarily unavailable.", retryable: true } });
  }
}
