import { parseCookie, readStaffSession, STAFF_COOKIE_NAME, canStaff } from "../src/server/staffSession.js";
import { listDeliveryLifecycles, updateDeliveryLifecycle, type DeliveryLifecycleStatus } from "../src/server/deliveryLifecycleStore.js";
import { enqueueLatestDeliveryEventNotification } from "../src/server/deliveryNotificationOutbox.js";
import { enforceDurableRateLimit, requestIp } from "../src/server/securityInfrastructure.js";

const MAX_BODY_BYTES = 20_000;
const VALID = new Set<DeliveryLifecycleStatus>(["order_received","preparing","ready_for_collection","dispatched","out_for_delivery","delivered","collected","exception"]);

function firstHeader(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}
function sameOrigin(request: any) {
  const origin = firstHeader(request.headers?.origin);
  if (!origin) return true;
  const host = firstHeader(request.headers?.host);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function readBody(request: AsyncIterable<unknown>) {
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of request) {
    if (chunk == null) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function clean(value: unknown, max = 500) { return String(value || "").trim().slice(0, max); }

export default async function handler(request: any, response: any) {
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "PATCH"].includes(method)) { response.setHeader("Allow", "GET, PATCH"); return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or PATCH is required." } }); }
  if (!sameOrigin(request)) return send(response, 403, { error: { code: "ORIGIN_REJECTED", message: "This request was rejected." } });

  try {
    const token = parseCookie(firstHeader(request.headers?.cookie))[STAFF_COOKIE_NAME];
    const staff = readStaffSession(token);
    if (!staff) return send(response, 401, { error: { code: "STAFF_AUTH_REQUIRED", message: "Staff sign-in is required." } });
    if (!canStaff(staff, "delivery_review")) return send(response, 403, { error: { code: "DELIVERY_ACCESS_DENIED", message: "Your staff role cannot manage delivery operations." } });
    await enforceDurableRateLimit({ request, action: "delivery_lifecycle_staff", subject: staff.employeeId || requestIp(request), limit: 180, windowSeconds: 600 });

    if (method === "GET") {
      const status = clean(request.query?.status || "all", 40);
      const deliveries = await listDeliveryLifecycles(status);
      return send(response, 200, { deliveries });
    }

    const input = await readBody(request);
    const orderId = clean(input.orderId, 180);
    const status = clean(input.status, 40) as DeliveryLifecycleStatus;
    if (!orderId || !VALID.has(status)) return send(response, 400, { error: { code: "INVALID_DELIVERY_UPDATE", message: "A valid order and delivery status are required." } });
    const delivery = await updateDeliveryLifecycle({
      orderId,
      status,
      actorId: staff.employeeId,
      publicMessage: clean(input.publicMessage, 500),
      internalNote: clean(input.internalNote, 1000),
      provider: clean(input.provider, 180),
      serviceLabel: clean(input.serviceLabel, 180),
      trackingReference: clean(input.trackingReference, 120),
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor).toISOString() : null,
      exceptionMessage: clean(input.exceptionMessage, 500),
      proofRecipientName: clean(input.proofRecipientName, 120),
      proofReference: clean(input.proofReference, 180),
      proofNotes: clean(input.proofNotes, 500),
    });
    let notificationsQueued = 0;
    if (clean(input.publicMessage, 500)) {
      try {
        const queued = await enqueueLatestDeliveryEventNotification(orderId);
        notificationsQueued = queued.length;
      } catch (notificationError) {
        console.error("delivery_notification_enqueue_failed", { orderId, code: notificationError instanceof Error ? notificationError.message : "unknown" });
      }
    }
    return send(response, 200, { delivery, notificationsQueued });
  } catch (error: any) {
    if (error instanceof SyntaxError) return send(response, 400, { error: { code: "INVALID_JSON", message: "The request body is invalid." } });
    if (error?.message === "DELIVERY_ORDER_NOT_FOUND") return send(response, 404, { error: { code: "DELIVERY_ORDER_NOT_FOUND", message: "That order does not have a delivery lifecycle." } });
    if (error?.message === "DELIVERY_STATUS_TRANSITION_INVALID") return send(response, 409, { error: { code: "DELIVERY_STATUS_TRANSITION_INVALID", message: "That status change is not valid from the order's current delivery state." } });
    if (error?.message === "DELIVERY_PROOF_RECIPIENT_REQUIRED") return send(response, 400, { error: { code: "DELIVERY_PROOF_REQUIRED", message: "Record who received or collected the order before completing it." } });
    if (error?.message === "RATE_LIMITED") return send(response, 429, { error: { code: "RATE_LIMITED", message: "Too many delivery updates. Please wait and try again." } });
    if (Number(error?.status) === 413) return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "The delivery update is too large." } });
    console.error("delivery_lifecycle_staff_error", { code: error instanceof Error ? error.message : "unknown" });
    return send(response, 503, { error: { code: "DELIVERY_LIFECYCLE_UNAVAILABLE", message: "Delivery operations are temporarily unavailable." } });
  }
}
