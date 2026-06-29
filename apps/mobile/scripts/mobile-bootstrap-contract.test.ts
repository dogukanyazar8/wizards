import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchMobileBootstrap,
  MOBILE_BOOTSTRAP_ENDPOINT,
  summarizeMobileBootstrap,
} from "../src/bootstrap/mobile-bootstrap";
import type { MobileApiClient } from "../src/api/mobile-api-client";

const validPayload = {
  app: {
    buildId: "test-build",
    name: "Whispr",
    releaseChannel: "uat",
    serverTime: "2026-06-26T12:00:00.000Z",
    version: "0.8.15",
  },
  contracts: {
    deepLinks: ["auth-handoff", "invite", "route"],
    permissions: ["notifications", "microphone", "camera", "photoLibrary"],
  },
  features: {
    messages: {
      label: "Messages",
      status: "available",
    },
    nativeAuthTokenExchange: {
      label: "Native auth handoff",
      reason: "One-time server exchange is available.",
      status: "available",
    },
    pushNotifications: {
      label: "Push notifications",
      reason: "Encrypted storage pending.",
      status: "requires-server-contract",
    },
    voice: {
      label: "Voice",
      reason: "Native permission onboarding pending.",
      status: "requires-native-permission",
    },
  },
  user: {
    avatarUrl: null,
    displayName: "CodeX",
    id: "user-1",
    locale: "tr",
    status: "online",
    username: "codex",
  },
};

describe("mobile bootstrap contract", () => {
  it("loads the authenticated bootstrap endpoint and summarizes pending work", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return validPayload as TResponse;
      },
    };

    const payload = await fetchMobileBootstrap(client);
    const summary = summarizeMobileBootstrap(payload);

    assert.deepEqual(requests, [MOBILE_BOOTSTRAP_ENDPOINT]);
    assert.equal(payload.user.username, "codex");
    assert.equal(summary.enabledFeatureCount, 2);
    assert.equal(summary.pendingContractCount, 2);
    assert.equal(summary.disabledFeatureCount, 0);
  });

  it("rejects malformed bootstrap payloads instead of trusting partial data", async () => {
    const client: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          ...validPayload,
          features: {
            ...validPayload.features,
            pushNotifications: {
              label: "Push notifications",
              status: "enabled-without-storage",
            },
          },
        } as TResponse;
      },
    };

    await assert.rejects(() => fetchMobileBootstrap(client), /Invalid enum value/);
  });
});
