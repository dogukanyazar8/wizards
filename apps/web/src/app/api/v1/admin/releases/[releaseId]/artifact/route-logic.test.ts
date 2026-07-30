import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";
import type { AdminReleaseArtifactInput } from "@/lib/releases/admin-release-artifact-service";

const routes = import("./route-logic");
const admin: AdminAccessUser = {
  email: "admin@whispr.test",
  id: "admin-1",
  role: "ADMIN",
  username: "admin",
};
const input: AdminReleaseArtifactInput = {
  kind: "APK",
  platform: "ANDROID",
  sha256: "a".repeat(64),
  signingCertSha256: Array(32).fill("AB").join(":"),
  sizeBytes: 50_541_363,
  url: "https://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr-8200.apk",
  versionCode: 8_200,
};
const context = { params: Promise.resolve({ releaseId: "release-1" }) };

function post(body: unknown = input) {
  return new Request("https://whispr.test/api/v1/admin/releases/release-1/artifact", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

type Dependencies = Parameters<Awaited<typeof routes>["adminReleaseArtifactRegisterRoute"]>[2];

function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateWrite: async () => admin,
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    register: async () => ({
      artifact: {
        ...input,
        id: "artifact-1",
        publishedAt: new Date("2026-07-30T10:00:00.000Z"),
        releaseId: "release-1",
      },
    }),
    writeAuditLog: async () => undefined,
    ...overrides,
  } as Dependencies;
}

describe("admin release artifact route", () => {
  it("requires release.write before registration", async () => {
    const { adminReleaseArtifactRegisterRoute } = await routes;
    const response = await adminReleaseArtifactRegisterRoute(
      post(),
      context,
      dependencies({
        authenticateWrite: async () => {
          throw new ApiError("Forbidden", 403, "ADMIN_ACCESS_REQUIRED");
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("uses the artifact rate action and audits only public metadata", async () => {
    const { adminReleaseArtifactRegisterRoute } = await routes;
    const actions: string[] = [];
    const audit: Array<Record<string, unknown>> = [];
    const response = await adminReleaseArtifactRegisterRoute(
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
    assert.deepEqual(actions, ["admin:release:artifact"]);
    assert.equal(audit[0]?.action, "admin.release.artifact.register");
    assert.doesNotMatch(JSON.stringify(audit), /private|secret/i);
  });
});
