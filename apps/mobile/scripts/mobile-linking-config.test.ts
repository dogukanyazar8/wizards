import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobileLinkingOptions,
  resolveMobileNavigationIntent,
} from "../src/navigation/mobile-linking";

const webUrl = "https://whispr.team";
const handoffToken = "abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-"; // gitleaks:allow -- deterministic invalid fixture

describe("mobile linking configuration", () => {
  it("resolves validated channel, DM, and settings routes", () => {
    assert.deepEqual(
      resolveMobileNavigationIntent("whispr://channels/server-1/channel-1", { webUrl }),
      {
        name: "ChannelChat",
        params: { channelId: "channel-1", serverId: "server-1" },
        type: "route",
      },
    );
    assert.deepEqual(
      resolveMobileNavigationIntent("whispr://channels/@me/conversation-1", { webUrl }),
      {
        name: "DirectMessage",
        params: { conversationId: "conversation-1" },
        type: "route",
      },
    );
    assert.deepEqual(resolveMobileNavigationIntent("whispr://settings", { webUrl }), {
      name: "MainTabs",
      params: { screen: "settings" },
      type: "route",
    });
    assert.deepEqual(resolveMobileNavigationIntent("whispr://settings/voice", { webUrl }), {
      name: "SettingsDetail",
      params: { section: "voice" },
      type: "route",
    });
  });

  it("rejects sensitive and unsupported route URLs", () => {
    assert.equal(
      resolveMobileNavigationIntent("whispr://channels/@me?token=secret", { webUrl }),
      null,
    );
    assert.equal(resolveMobileNavigationIntent("whispr://admin", { webUrl }), null);
  });

  it("keeps auth handoffs and invites as typed commands", () => {
    assert.deepEqual(
      resolveMobileNavigationIntent(
        `whispr://oauth/${handoffToken}?callbackUrl=%2Fchannels%2F%40me`,
        { webUrl },
      ),
      {
        callbackPath: "/channels/@me",
        token: handoffToken,
        type: "auth-handoff",
      },
    );
    assert.deepEqual(
      resolveMobileNavigationIntent("whispr://invite/ABC_def-123?mobile=1", { webUrl }),
      {
        autoAccept: true,
        code: "ABC_def-123",
        type: "invite",
      },
    );
  });

  it("validates cold-start and foreground links before dispatch", async () => {
    const commands: unknown[] = [];
    let foregroundListener: ((event: { readonly url: string }) => void) | undefined;
    let removed = false;
    const linking = createMobileLinkingOptions({
      linking: {
        addEventListener: (_type, listener) => {
          foregroundListener = listener;
          return {
            remove: () => {
              removed = true;
            },
          };
        },
        getInitialURL: async () => "whispr://channels/server-1/channel-1",
      },
      onCommand: (command) => commands.push(command),
      webUrl,
    });

    assert.deepEqual(linking.prefixes, ["whispr://", webUrl]);
    assert.equal(await linking.getInitialURL?.(), "whispr://channels/server-1/channel-1");

    const routedUrls: string[] = [];
    const unsubscribe = linking.subscribe?.((url) => routedUrls.push(url));
    foregroundListener?.({ url: "whispr://channels/@me?token=secret" });
    foregroundListener?.({ url: "whispr://invite/ABC_def-123" });
    foregroundListener?.({ url: "whispr://settings" });

    assert.deepEqual(routedUrls, ["whispr://settings"]);
    assert.deepEqual(commands, [
      {
        autoAccept: false,
        code: "ABC_def-123",
        type: "invite",
      },
    ]);

    unsubscribe?.();
    assert.equal(removed, true);
  });
});
