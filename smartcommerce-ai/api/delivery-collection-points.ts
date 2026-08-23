import { collectionPointsForService } from "../src/server/courierCollectionPoints.js";

function send(response: any, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

export default async function handler(request: any, response: any) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } });
  }

  const serviceId = String(request.query?.serviceId || "").trim().slice(0, 100);
  if (!serviceId) return send(response, 400, { error: { code: "SERVICE_REQUIRED", message: "A courier service is required." } });

  const points = collectionPointsForService(serviceId);
  return send(response, 200, {
    serviceId,
    points,
    sourceStatus: "published_current",
    verifiedAt: "2026-08-23",
  });
}
