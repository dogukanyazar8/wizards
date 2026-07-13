import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MobileBootstrapPayloadSchema } from "@wizards/types";
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
    permissions: ["notifications", "microphone", "camera", "photoLibrary", "screenCapture"],
  },
  features: {
    attachments: {
      label: "Attachments",
      reason:
        "Mobile file selection is available, but native upload transport still requires the mobile upload provider contract.",
      status: "requires-server-contract",
    },
    invites: {
      label: "Invites",
      reason: "Authenticated mobile create/join and canonical invite sharing are available.",
      status: "available",
    },
    messageSearch: {
      label: "Message search",
      reason: "Authenticated mobile search endpoints are available.",
      status: "available",
    },
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
      reason: "Native permission is required before registration.",
      status: "requires-native-permission",
    },
    voice: {
      label: "Voice",
      reason: "Native permission onboarding pending.",
      status: "requires-native-permission",
    },
  },
  home: {
    directMessages: {
      recent: [
        {
          iconUrl: null,
          id: "conversation-1",
          lastMessageAt: "2026-06-26T11:30:00.000Z",
          muted: false,
          name: null,
          participantCount: 2,
          participants: [
            {
              avatarUrl: null,
              displayName: "Alice",
              id: "user-2",
              status: "online",
              username: "alice",
            },
          ],
          type: "DM",
          unreadCount: 1,
        },
      ],
      totalCount: 1,
      unreadCount: 1,
    },
    servers: {
      recent: [
        {
          channelCount: 4,
          iconUrl: null,
          id: "server-1",
          joinedAt: "2026-06-25T10:00:00.000Z",
          memberCount: 8,
          name: "Whispr UAT",
          shortName: "WU",
        },
      ],
      totalCount: 1,
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
    assert.equal(summary.enabledFeatureCount, 4);
    assert.equal(summary.pendingContractCount, 3);
    assert.equal(summary.disabledFeatureCount, 0);
    assert.equal(summary.workspaceCount, 1);
    assert.equal(summary.directMessageCount, 1);
    assert.equal(summary.unreadDirectMessageCount, 1);
  });

  it("keeps newer feature flags backward-compatible with older bootstrap payloads", () => {
    const legacyPayload = {
      ...validPayload,
      features: {
        messages: validPayload.features.messages,
        invites: {
          label: "Invites",
          reason: "Older server contract.",
          status: "requires-server-contract",
        },
        nativeAuthTokenExchange: validPayload.features.nativeAuthTokenExchange,
        pushNotifications: validPayload.features.pushNotifications,
        voice: validPayload.features.voice,
      },
    };

    const parsed = MobileBootstrapPayloadSchema.parse(legacyPayload);

    assert.equal(parsed.features.attachments.status, "requires-server-contract");
    assert.equal(parsed.features.invites.status, "requires-server-contract");
    assert.equal(parsed.features.messageSearch.status, "requires-server-contract");
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
