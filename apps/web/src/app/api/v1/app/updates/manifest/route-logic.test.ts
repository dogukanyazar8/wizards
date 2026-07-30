import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OtaManifestPart } from "@/lib/app/ota-manifest-service";

const routes = import("./route-logic");

const manifestPart: OtaManifestPart = {
  body: JSON.stringify({
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
  }),
  kind: "manifest",
  signature: "bWFuaWZlc3Q=",
  signingKeyId: "whispr-mobile-ota-uat-2026-01",
};

function request(overrides: Record<string, string> = {}) {
  return new Request("https://whispr.test/api/v1/app/updates/manifest", {
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      "expo-channel-name": "uat",
      "expo-expect-signature": 'sig, keyid="whispr-mobile-ota-uat-2026-01", alg="rsa-v1_5-sha256"',
      "expo-installation-id": "install-a",
      "expo-platform": "android",
      "expo-protocol-version": "1",
      "expo-runtime-version": "fingerprint-uat-1",
      "user-agent": "expo-updates/57",
      ...overrides,
    },
  });
}

function dependencies(
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["otaManifestRoute"]>[1] {
  return {
    enforceRateLimit: async () => undefined,
    resolveManifest: async () => manifestPart,
    ...overrides,
  } as Parameters<Awaited<typeof routes>["otaManifestRoute"]>[1];
}

describe("OTA manifest route", () => {
  it("requires the Expo protocol, platform, runtime, and channel headers", async () => {
    const { otaManifestRoute } = await routes;

    for (const header of [
      "expo-protocol-version",
      "expo-platform",
      "expo-runtime-version",
      "expo-channel-name",
    ]) {
      const missing = request();
      missing.headers.delete(header);
      const response = await otaManifestRoute(missing, dependencies());
      assert.equal(response.status, 400, header);
    }
  });

  it("returns a signed no-store Expo multipart response", async () => {
    const { otaManifestRoute } = await routes;
    const response = await otaManifestRoute(request(), dependencies());
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("expo-protocol-version"), "1");
    assert.equal(response.headers.get("expo-sfv-version"), "0");
    assert.equal(response.headers.get("cache-control"), "private, max-age=0");
    assert.match(response.headers.get("content-type") ?? "", /^multipart\/mixed;/);
    assert.match(body, /name="manifest"/);
    assert.match(body, /expo-signature:/i);
  });

  it("rate limits by a hashed network identity without requiring a session", async () => {
    const { otaManifestRoute } = await routes;
    const calls: Array<{ action: string; key: string }> = [];

    const response = await otaManifestRoute(
      request(),
      dependencies({
        enforceRateLimit: async (key: string, action: string) => {
          calls.push({ action, key });
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(calls[0]?.action, "app:updates:manifest");
    assert.doesNotMatch(calls[0]?.key ?? "", /203\.0\.113\.10/);
    assert.match(calls[0]?.key ?? "", /^ota:[A-Za-z0-9_-]{43}$/);
  });

  it("uses 204 when no signing metadata exists for the channel", async () => {
    const { otaManifestRoute } = await routes;
    const response = await otaManifestRoute(
      request(),
      dependencies({ resolveManifest: async () => null }),
    );

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("content-type"), null);
    assert.equal(await response.text(), "");
  });

  it("does not expose repository failures", async () => {
    const { otaManifestRoute } = await routes;
    const response = await otaManifestRoute(
      request(),
      dependencies({
        resolveManifest: async () => {
          throw new Error("postgresql://secret@db/whispr");
        },
      }),
    );
    const payload = (await response.json()) as { error: string };

    assert.equal(response.status, 500);
    assert.equal(payload.error, "Internal server error");
    assert.doesNotMatch(JSON.stringify(payload), /secret|postgres/i);
  });
});
