import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  registerAdminReleaseArtifact,
  type AdminReleaseArtifactInput,
  type AdminReleaseArtifactServiceDependencies,
} from "./admin-release-artifact-service";

const input: AdminReleaseArtifactInput = {
  kind: "APK",
  platform: "ANDROID",
  sha256: "a".repeat(64),
  signingCertSha256: Array(32).fill("AB").join(":"),
  sizeBytes: 50_541_363,
  url: "https://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr-8200.apk",
  versionCode: 8_200,
};

function dependencies(
  overrides: Partial<AdminReleaseArtifactServiceDependencies> = {},
): AdminReleaseArtifactServiceDependencies {
  return {
    createArtifact: async (releaseId, _channel, value, publishedAt) => ({
      ...value,
      id: "artifact-1",
      publishedAt,
      releaseId,
    }),
    findArtifact: async () => null,
    findLatestVersionCode: async () => null,
    findRelease: async () => ({
      channel: "UAT",
      id: "release-1",
      publishedAt: new Date("2026-07-30T08:00:00.000Z"),
    }),
    now: () => new Date("2026-07-30T10:00:00.000Z"),
    ...overrides,
  };
}

describe("admin release artifact service", () => {
  it("registers immutable verified metadata for a published internal release", async () => {
    const observedChannels: string[] = [];
    const result = await registerAdminReleaseArtifact(
      "release-1",
      input,
      dependencies({
        createArtifact: async (releaseId, channel, value, publishedAt) => {
          observedChannels.push(`create:${channel}`);
          return {
            ...value,
            id: "artifact-1",
            publishedAt,
            releaseId,
          };
        },
        findArtifact: async (channel) => {
          observedChannels.push(`find:${channel}`);
          return null;
        },
      }),
    );

    assert.equal(result.artifact.id, "artifact-1");
    assert.equal(result.artifact.versionCode, 8_200);
    assert.deepEqual(observedChannels, ["find:UAT", "create:UAT"]);
  });

  it("rejects unpublished, duplicate, non-HTTPS, and mutable artifact records", async () => {
    const cases = [
      dependencies({
        findRelease: async () => ({
          channel: "UAT",
          id: "release-1",
          publishedAt: null,
        }),
      }),
      dependencies({ findArtifact: async () => ({ id: "existing" }) }),
    ];
    for (const value of cases) {
      await assert.rejects(registerAdminReleaseArtifact("release-1", input, value));
    }
    for (const url of [
      "http://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr.apk",
      "https://updates.whispr.team/mobile/uat/latest/whispr.apk",
    ]) {
      await assert.rejects(
        registerAdminReleaseArtifact("release-1", { ...input, url }, dependencies()),
        (error: unknown) => error instanceof ApiError,
      );
    }
  });

  it("rejects APK registration for the production release channel", async () => {
    await assert.rejects(
      registerAdminReleaseArtifact(
        "release-1",
        input,
        dependencies({
          findRelease: async () => ({
            channel: "STABLE",
            id: "release-1",
            publishedAt: new Date(),
          }),
        }),
      ),
      (error: unknown) => error instanceof ApiError && error.code === "PRODUCTION_APK_FORBIDDEN",
    );
  });

  it("rejects a non-monotonic artifact versionCode within the channel", async () => {
    await assert.rejects(
      registerAdminReleaseArtifact(
        "release-1",
        { ...input, versionCode: 8_199 },
        dependencies({ findLatestVersionCode: async () => 8_200 }),
      ),
      (error: unknown) =>
        error instanceof ApiError && error.code === "ARTIFACT_VERSION_NOT_MONOTONIC",
    );
  });
});
