import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { AdminRole } from "@wizards/db";
import { ApiError, jsonError } from "@/lib/api";
import { getAdminDashboardRoute } from "./route-logic";

function request(days = "30") {
  return new Request(`https://whispr.test/api/v1/admin/dashboard?days=${days}`);
}

function routeDependencies(overrides: Partial<Parameters<typeof getAdminDashboardRoute>[1]> = {}) {
  return {
    authenticate: async () => ({
      email: "admin@whispr.test",
      id: "admin-1",
      role: "OWNER" as const,
      username: "admin",
    }),
    enforceApiRateLimit: async () => undefined,
    getAdminDashboardSnapshot: async (days: number, _role: AdminRole) => ({
      generatedAt: "2026-07-09T00:00:00.000Z",
      range: { days },
    }),
    jsonError: (error: unknown) => {
      if (error instanceof ApiError) {
        return Response.json({ code: error.code, error: error.message }, { status: error.status });
      }
      return Response.json({ error: "Internal server error" }, { status: 500 });
    },
    normalizeDashboardDays: () => 14,
    ...overrides,
  };
}

describe("admin dashboard API route", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("requires an admin, applies the admin dashboard rate limit, and returns the snapshot", async () => {
    const calls: string[] = [];
    const response = await getAdminDashboardRoute(
      request("90"),
      routeDependencies({
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        getAdminDashboardSnapshot: async (days, role) => {
          calls.push(`snapshot:${days}:${role}`);
          return {
            generatedAt: "2026-07-09T00:00:00.000Z",
            range: { days },
          };
        },
        normalizeDashboardDays: (value) => {
          calls.push(`normalize:${value}`);
          return 90;
        },
        authenticate: async () => {
          calls.push("auth");
          return {
            email: "admin@whispr.test",
            id: "admin-1",
            role: "OWNER" as const,
            username: "admin",
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      dashboard: {
        generatedAt: "2026-07-09T00:00:00.000Z",
        range: { days: 90 },
      },
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:admin-1:admin:dashboard",
      "normalize:90",
      "snapshot:90:OWNER",
    ]);
  });

  it("returns the shared 403 envelope when admin authorization fails", async () => {
    const response = await getAdminDashboardRoute(
      request(),
      routeDependencies({
        authenticate: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "ADMIN_ACCESS_REQUIRED",
      error: "Admin access required",
    });
  });

  it("returns the shared 429 envelope when the admin dashboard limit is exhausted", async () => {
    const response = await getAdminDashboardRoute(
      request(),
      routeDependencies({
        enforceApiRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
  });

  it("uses the shared unexpected-error envelope", async () => {
    const errorLog = mock.method(console, "error", () => undefined);

    const response = await getAdminDashboardRoute(
      request(),
      routeDependencies({
        getAdminDashboardSnapshot: async () => {
          throw new Error("database password leaked");
        },
        jsonError,
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Internal server error",
    });
    assert.equal(errorLog.mock.callCount(), 1);
  });
});
