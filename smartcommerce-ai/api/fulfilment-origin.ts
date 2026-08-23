import { getFulfilmentOrigin, setFulfilmentOrigin } from "../src/server/fulfilmentOriginStore.js";
import { canStaff, parseCookie, readStaffSession, STAFF_COOKIE_NAME } from "../src/server/staffSession.js";
import { recordSecurityEvent } from "../src/server/securityInfrastructure.js";

const MAX_BODY_BYTES = 12_000;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function readJsonBody<T>(request: AsyncIterable<unknown>): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function sessionFromRequest(request: any) {
  const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
  return readStaffSession(token);
}

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const staff = sessionFromRequest(request);
    if (!staff || !canStaff(staff, "delivery_review")) {
      return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Authorized logistics staff access is required." } });
    }

    if (method === "GET") {
      return send(response, 200, { origin: await getFulfilmentOrigin(), canUpdate: canStaff(staff, "security_manage") || canStaff(staff, "transfers_approve") });
    }

    if (method !== "PUT") {
      response.setHeader("Allow", "GET, PUT");
      return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or PUT is required." } });
    }

    if (!canStaff(staff, "security_manage") && !canStaff(staff, "transfers_approve")) {
      return send(response, 403, { error: { code: "FULFILMENT_ORIGIN_UPDATE_FORBIDDEN", message: "Your staff role cannot change the ecommerce dispatch origin." } });
    }

    const input = await readJsonBody<{ branchId?: string; branchName?: string; town?: string; parish?: string; addressLine1?: string }>(request);
    const origin = await setFulfilmentOrigin({
      branchId: input.branchId,
      branchName: input.branchName,
      town: String(input.town || ""),
      parish: String(input.parish || ""),
      addressLine1: input.addressLine1,
      updatedBy: staff.employeeId,
    });

    await recordSecurityEvent({
      request,
      eventType: "fulfilment_origin_updated",
      eventStatus: "success",
      riskLevel: "info",
      metadata: { branchId: origin.branchId, branchName: origin.branchName, town: origin.town, parish: origin.parish, updatedBy: staff.employeeId },
    });

    return send(response, 200, { origin, canUpdate: true });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (error?.message === "FULFILMENT_ORIGIN_INCOMPLETE") return send(response, 400, { error: { code: "FULFILMENT_ORIGIN_INCOMPLETE", message: "Town and parish are required for the dispatch origin." } });
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    console.error("fulfilment_origin_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "FULFILMENT_ORIGIN_UNAVAILABLE", message: "The fulfilment origin setting is temporarily unavailable." } });
  }
}
