import {
  getHealthPayload,
  getReadinessPayload,
  getReadinessStatusCode,
  HEALTH_RESPONSE_HEADERS,
} from "@/lib/health";

export async function GET(request: Request) {
  const wantsReadiness = new URL(request.url).searchParams.get("ready") === "1";

  if (!wantsReadiness) {
    return Response.json(getHealthPayload(), {
      headers: HEALTH_RESPONSE_HEADERS,
    });
  }

  const readiness = await getReadinessPayload();

  return Response.json(readiness, {
    headers: HEALTH_RESPONSE_HEADERS,
    status: getReadinessStatusCode(readiness),
  });
}
