import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";
import type { AdminOtaBundleInput } from "@/lib/releases/admin-ota-service";

const routes = import("./route-logic");
const admin: AdminAccessUser = {
  email: "admin@whispr.test",
  id: "admin-1",
  role: "ADMIN",
  username: "admin",
};
const manifestBody = JSON.stringify({
  assets: [],
  createdAt: "2026-07-30T09:00:00.000Z",
  extra: {},
  id: "550e8400-e29b-41d4-a716-446655440000",
  launchAsset: {
    contentType: "application/javascript",
    key: "bundle",
    url: "https://updates.whispr.team/mobile/ota/20260730-a1b2/index.js",
  },
  metadata: {},
  runtimeVersion: "fingerprint-uat-1",
});
const input: AdminOtaBundleInput = {
  bundleKey: "20260730-a1b2",
  channel: "UAT",
  enabled: true,
  id: "550e8400-e29b-41d4-a716-446655440000",
  manifestBody,
  manifestSha256: createHash("sha256").update(manifestBody).digest("hex"),
  manifestSignature: "bWFuaWZlc3Q=",
  noUpdateDirectiveBody: JSON.stringify({ type: "noUpdateAvailable" }),
  noUpdateDirectiveSignature: "bm8tdXBkYXRl",
  platform: "ANDROID",
  rollbackDirectiveBody: JSON.stringify({ type: "rollBackToEmbedded" }),
  rollbackDirectiveSignature: "cm9sbGJhY2s=",
  rolloutPercentage: 100,
  runtimeVersion: "fingerprint-uat-1",
  signingKeyId: "whispr-mobile-ota-uat-2026-01",
};
const context = { params: Promise.resolve({ releaseId: "release-1" }) };

function post(body: unknown = input) {
  return new Request("https://whispr.test/api/v1/admin/releases/release-1/ota", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

type Dependencies = Parameters<Awaited<typeof routes>["adminOtaRegisterRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateWrite: async () => admin,
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    register: async () => ({
      bundle: {
        bundleKey: input.bundleKey,
        enabled: true,
        id: input.id,
        publishedAt: new Date("2026-07-30T10:00:00.000Z"),
        releaseId: "release-1",
        rolloutPercentage: 100,
      },
    }),
    setEnabled: async (_releaseId, bundleId, enabled) => ({
      bundle: { enabled, id: bundleId, releaseId: "release-1" },
    }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin OTA route", () => {
  it("requires release.write before accepting publication metadata", async () => {
    const { adminOtaRegisterRoute } = await routes;
    let registered = false;
    const response = await adminOtaRegisterRoute(
      post(),
      context,
      dependencies({
        authenticateWrite: async () => {
          throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
        },
        register: async () => {
          registered = true;
          throw new Error("unreachable");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal(registered, false);
  });

  it("rate limits, registers, and audits the public metadata only", async () => {
    const { adminOtaRegisterRoute } = await routes;
    const actions: string[] = [];
    const audit: Array<Record<string, unknown>> = [];
    const response = await adminOtaRegisterRoute(
      post(),
      context,
      dependencies({
        enforceRateLimit: async (_userId, action) => {
          actions.push(action);
        },
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(actions, ["admin:release:write"]);
    assert.equal(audit[0]?.action, "admin.release.ota.register");
    assert.equal(audit[0]?.targetId, input.id);
    assert.doesNotMatch(JSON.stringify(audit[0]), /manifestBody|privateKey|signature/);
  });

  it("rejects private-key material as an unknown request field", async () => {
    const { adminOtaRegisterRoute } = await routes;
    const response = await adminOtaRegisterRoute(
      post({ ...input, privateKey: "-----BEGIN PRIVATE KEY-----" }),
      context,
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("audits kill-switch changes", async () => {
    const { adminOtaEnabledRoute } = await routes;
    const audit: Array<Record<string, unknown>> = [];
    const response = await adminOtaEnabledRoute(
      new Request("https://whispr.test/api/v1/admin/releases/release-1/ota", {
        body: JSON.stringify({ bundleId: input.id, enabled: false }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      context,
      dependencies({
        writeAuditLog: async (entry) => {
          audit.push(entry);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(audit[0]?.action, "admin.release.ota.disable");
  });
});
