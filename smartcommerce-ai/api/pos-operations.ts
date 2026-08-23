import { createHardenedServerFetch, validateServerIntegrationBaseUrl } from "../src/server/hardenedOutboundFetch.js";
import { firstHeader, recordSecurityEvent } from "../src/server/securityInfrastructure.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";

const RESOURCE_MAP = {
  work_orders: { path: "/api/work-orders", permission: "work_orders" },
  active_tasks: { path: "/api/work-orders/active-tasks", permission: "work_orders" },
  technician_skills: { path: "/api/work-orders/skills", permission: "work_orders" },
  technician_schedule: { path: "/api/work-orders/schedule", permission: "work_orders", allowedQuery: ["date"] },
  technicians: { path: "/api/employees", permission: "employees" },
  inventory: { path: "/api/products", permission: "inventory", allowedQuery: ["search", "category_id", "branch_id", "sku", "barcode", "page", "limit"] },
  suppliers: { path: "/api/suppliers", permission: "suppliers" },
  purchase_requests: { path: "/api/purchase-requests", permission: "purchase_requests", allowedQuery: ["status", "branch_id", "limit"] },
  purchase_orders: { path: "/api/purchase-orders", permission: "purchasing", allowedQuery: ["status", "supplier_id", "branch_id", "limit"] },
  branch_transfers: { path: "/api/transfers", permission: "transfers", allowedQuery: ["status", "from_branch_id", "to_branch_id", "limit"] },
  quotations: { path: "/api/quotations", permission: "quotations", allowedQuery: ["status", "customer_id", "branch_id", "limit"] },
  transactions: { path: "/api/transactions", permission: "transactions", allowedQuery: ["search", "customer_id", "branch_id", "start_date", "end_date", "limit"] },
  cash_drawers: { path: "/api/drawers", permission: "drawers", allowedQuery: ["branch_id", "employee_id", "status", "limit"] },
  customers: { path: "/api/customers", permission: "customers", allowedQuery: ["search", "limit"] },
  branches: { path: "/api/branches", permission: "dashboard" },
  reports: { path: "/api/reports", permission: "reports", allowedQuery: ["type", "branch_id", "start_date", "end_date"] },
} as const;

type ResourceName = keyof typeof RESOURCE_MAP;

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function configuredPos() {
  const raw = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_URL?.trim();
  if (!raw) throw new Error("POS_NOT_CONFIGURED");
  return validateServerIntegrationBaseUrl(raw).toString().replace(/\/$/, "");
}

function queryValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value == null ? undefined : String(value);
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } });
  }

  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  const staff = readStaffSession(token);
  if (!staff) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });

  const resource = queryValue(request.query?.resource) as ResourceName | undefined;
  if (!resource || !(resource in RESOURCE_MAP)) {
    return send(response, 400, { error: { code: "INVALID_RESOURCE", message: "A supported POS operations resource is required." } });
  }

  const config = RESOURCE_MAP[resource];
  if (!canStaff(staff, config.permission)) {
    await recordSecurityEvent({ request, eventType: "staff_operation_forbidden", eventStatus: "blocked", riskLevel: "high", subject: staff.employeeId, metadata: { resource, permission: config.permission } }).catch(() => undefined);
    return send(response, 403, { error: { code: "STAFF_PERMISSION_REQUIRED", message: `Missing permission: ${config.permission}.` } });
  }

  try {
    const baseUrl = configuredPos();
    const url = new URL(`${baseUrl}${config.path}`);
    const allowedQuery = "allowedQuery" in config ? config.allowedQuery : [];
    for (const key of allowedQuery) {
      const value = queryValue(request.query?.[key]);
      if (value !== undefined && value !== "") url.searchParams.set(key, value.slice(0, 300));
    }

    const apiKey = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY?.trim();
    if (!apiKey) throw new Error("POS_API_KEY_NOT_CONFIGURED");
    const apiKeyHeader = process.env.SMARTCOMMERCE_TOTAL_TOOLS_POS_API_KEY_HEADER?.trim() || "X-API-Key";
    const requestFetch = createHardenedServerFetch({ timeoutMs: 7000, maxResponseBytes: 2_000_000 });
    const upstream = await requestFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        [apiKeyHeader]: apiKey,
        "X-Request-Id": crypto.randomUUID(),
      },
    });
    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return send(response, upstream.status >= 500 ? 502 : upstream.status, {
        error: {
          code: `POS_UPSTREAM_${upstream.status}`,
          message: "The POS could not return this operational resource.",
          retryable: upstream.status >= 500,
        },
      });
    }

    return send(response, 200, {
      success: true,
      data: payload,
      meta: {
        resource,
        provider: "total-tools-pos",
        employeeId: staff.employeeId,
        branchId: staff.defaultBranchId || null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "POS_OPERATIONS_ERROR";
    console.error("pos_operations_gateway_error", { code, resource });
    return send(response, 503, {
      error: {
        code: code === "POS_NOT_CONFIGURED" || code === "POS_API_KEY_NOT_CONFIGURED" ? code : "POS_OPERATIONS_UNAVAILABLE",
        message: "POS operations are temporarily unavailable.",
        retryable: true,
      },
    });
  }
}
