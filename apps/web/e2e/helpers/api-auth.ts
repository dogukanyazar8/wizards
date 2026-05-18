import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { E2EUserKey } from "./test-data";

async function assertSuccessfulE2EApiResponse(
  response: APIResponse,
  operation: string,
) {
  if (response.ok()) {
    return;
  }

  const body = await response.text();
  throw new Error(`${operation} failed with ${response.status()}: ${body}`);
}

export async function apiLoginAs(
  request: APIRequestContext,
  userKey: E2EUserKey,
): Promise<void> {
  const response = await request.post("/api/e2e/auth/session", {
    data: { userKey },
  });

  await assertSuccessfulE2EApiResponse(response, `API login as ${userKey}`);
}

export async function apiLogout(request: APIRequestContext): Promise<void> {
  const response = await request.delete("/api/e2e/auth/session");
  await assertSuccessfulE2EApiResponse(response, "API logout");
}
