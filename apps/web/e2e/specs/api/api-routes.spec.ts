import { expect, test } from "../../fixtures/test";
import { apiLoginAs, e2eRequestHeaders } from "../../helpers/api-auth";
import {
  addE2EServerMember,
  createIsolatedServerForMembershipTest,
  getE2EDMConversationId,
  getE2EServerRoute,
  getE2EUserId,
  getServerMemberId,
  setE2EServerMemberNickname,
} from "../../helpers/db";
import { e2eUserPassword } from "../../helpers/test-data";

test.describe("API v1 route smoke", () => {
  test("serves the public app version route without caching", async ({ request }) => {
    const response = await request.get("/api/v1/app/version");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const body = await response.json();
    expect(body).toMatchObject({
      appName: "Whispr",
    });
    expect(typeof body.version).toBe("string");
    expect(Array.isArray(body.notes)).toBe(true);
  });

  test("rejects protected routes without a session", async ({ request }) => {
    const response = await request.get("/api/v1/servers");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  test("allows authenticated users to read their server list", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.get("/api/v1/servers");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.servers)).toBe(true);
    expect(body.servers.length).toBeGreaterThan(0);
  });

  test("rejects admin routes for regular users", async ({ request }) => {
    await apiLoginAs(request, "charlie");

    const response = await request.get("/api/v1/admin/dashboard");

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADMIN_ACCESS_REQUIRED",
    });
  });

  test("blocks cross-origin mutating API requests at middleware", async ({ request }) => {
    const response = await request.post("/api/v1/servers", {
      data: { name: "Blocked Cross Origin" },
      headers: {
        Origin: "https://evil.example.com",
      },
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "CSRF_BLOCKED",
    });
  });

  test("rejects non-JSON request bodies on mutating JSON routes", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.post("/api/v1/servers", {
      data: '{"name":"Plain text body"}',
      headers: {
        ...e2eRequestHeaders,
        "Content-Type": "text/plain",
      },
    });

    expect(response.status()).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  test("rejects oversized JSON request bodies on mutating routes", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const oversizedBody = JSON.stringify({
      name: "Oversized",
      padding: "x".repeat(1_048_577),
    });

    const response = await request.post("/api/v1/servers", {
      data: oversizedBody,
      headers: {
        ...e2eRequestHeaders,
        "Content-Type": "application/json",
      },
    });

    expect(response.status()).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: "Request body too large",
    });
  });

  test("rejects invalid JSON payloads through route-level validation", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.post("/api/v1/servers", {
      data: {
        name: "",
      },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  test("issues account deletion re-auth tokens for valid passwords", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.post("/api/v1/auth/reauth", {
      data: {
        password: e2eUserPassword,
        purpose: "account-delete",
      },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
    });
    expect(typeof body.reauthToken).toBe("string");
    expect(typeof body.expiresAt).toBe("string");
  });

  test("rejects account deletion re-auth for wrong passwords", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.post("/api/v1/auth/reauth", {
      data: {
        password: `${e2eUserPassword}-wrong`,
        purpose: "account-delete",
      },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "REAUTH_FAILED",
    });
  });

  test("requires recent re-auth before account deletion", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.delete("/api/v1/users/me", {
      data: {
        confirmation: "DELETE MY ACCOUNT",
      },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "REAUTH_REQUIRED",
    });
  });
});

test.describe("API v1 permission boundaries", () => {
  test("does not expose server detail to non-members", async ({ request }) => {
    const { serverId } = await createIsolatedServerForMembershipTest("alice");
    await apiLoginAs(request, "bob");

    const response = await request.get(`/api/v1/servers/${serverId}`);

    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Server not found",
    });
  });

  test("does not expose server-scoped user profiles to non-members", async ({ request }) => {
    const [{ serverId }, aliceId] = await Promise.all([
      createIsolatedServerForMembershipTest("alice"),
      getE2EUserId("alice"),
    ]);
    await apiLoginAs(request, "bob");

    const response = await request.get(`/api/v1/users/${aliceId}/profile?serverId=${serverId}`);

    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Server profile not found",
    });
  });

  test("returns server-scoped nicknames when both users are server members", async ({
    request,
  }) => {
    const nickname = `Captain Alice ${Date.now()}`;
    const [{ serverId }, aliceId] = await Promise.all([
      createIsolatedServerForMembershipTest("alice"),
      getE2EUserId("alice"),
    ]);
    await Promise.all([
      addE2EServerMember(serverId, "bob"),
      setE2EServerMemberNickname(serverId, "alice", nickname),
    ]);
    await apiLoginAs(request, "bob");

    const response = await request.get(`/api/v1/users/${aliceId}/profile?serverId=${serverId}`);

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: aliceId,
      serverNickname: nickname,
    });
  });

  test("does not expose DM conversations to non-participants", async ({ request }) => {
    const conversationId = await getE2EDMConversationId();
    await apiLoginAs(request, "charlie");

    const response = await request.get(`/api/v1/dm/${conversationId}`);

    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("allows members to list voice states for their server", async ({ request }) => {
    const { serverId } = await getE2EServerRoute();
    await apiLoginAs(request, "bob");

    const response = await request.get(`/api/v1/voice/states?serverId=${serverId}`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.states)).toBe(true);
  });

  test("rejects voice state access for servers outside membership", async ({ request }) => {
    const { serverId } = await createIsolatedServerForMembershipTest("alice");
    await apiLoginAs(request, "bob");

    const response = await request.get(`/api/v1/voice/states?serverId=${serverId}`);

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("prevents regular members from kicking other members", async ({ request }) => {
    const { serverId } = await getE2EServerRoute();
    const bobMemberId = await getServerMemberId(serverId, "bob");
    await apiLoginAs(request, "charlie");

    const response = await request.delete(`/api/v1/servers/${serverId}/members/${bobMemberId}`, {
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
