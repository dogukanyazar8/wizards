import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobileLinkingOptions,
  resolveMobileNavigationIntent,
  resolveMobileRoutePathIntent,
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
    assert.deepEqual(
      resolveMobileNavigationIntent("whispr://server/server-1/settings/roles", { webUrl }),
      {
        name: "ServerRoles",
        params: { serverId: "server-1" },
        type: "route",
      },
    );
  });

  /**
   * 11c: `whispr://user/<id>` opens the full profile page. The optional
   * `serverId` rides along because it is what turns the role chips on.
   */
  it("resolves the user profile route with and without a server context", () => {
    assert.deepEqual(resolveMobileNavigationIntent("whispr://user/user-2", { webUrl }), {
      name: "UserProfile",
      params: { userId: "user-2" },
      type: "route",
    });
    assert.deepEqual(
      resolveMobileNavigationIntent("whispr://user/user-2?serverId=server-1", { webUrl }),
      {
        name: "UserProfile",
        params: { serverId: "server-1", userId: "user-2" },
        type: "route",
      },
    );
    assert.deepEqual(resolveMobileRoutePathIntent("/user/user-2"), {
      name: "UserProfile",
      params: { userId: "user-2" },
      type: "route",
    });
    // A trailing segment is not a profile path and must not resolve.
    assert.equal(resolveMobileNavigationIntent("whispr://user/user-2/edit", { webUrl }), null);
  });

  /**
   * 10a: the backend writes `/channels/<serverId>/<channelId>` into the MENTION
   * notification's `actionUrl`; tapping the row feeds that exact path to
   * `resolveMobileRoutePathIntent`, so the channel has to open from it.
   */
  it("opens the channel behind a mention notification action URL", () => {
    assert.deepEqual(resolveMobileRoutePathIntent("/channels/server-1/channel-1"), {
      name: "ChannelChat",
      params: { channelId: "channel-1", serverId: "server-1" },
      type: "route",
    });
  });

  /**
   * F7: the moderation deep link has to clear all four stops — the safe-path
   * allowlist in the parser, the intent resolver, the linking config and the
   * route intent union. Dropping any one of them makes the link fail silently.
   */
  it("resolves the moderation queue and case routes", () => {
    assert.deepEqual(resolveMobileNavigationIntent("whispr://admin/case/case-1", { webUrl }), {
      name: "AdminIncidentDetail",
      params: { caseId: "case-1" },
      type: "route",
    });
    assert.deepEqual(resolveMobileNavigationIntent("whispr://admin/cases", { webUrl }), {
      name: "AdminIncidents",
      params: undefined,
      type: "route",
    });
    // The MODERATION notification writes the web console's own path into
    // `actionUrl`; tapping that row has to land on the same case file.
    assert.deepEqual(resolveMobileRoutePathIntent("/admin/moderation/case-1"), {
      name: "AdminIncidentDetail",
      params: { caseId: "case-1" },
      type: "route",
    });
    assert.deepEqual(resolveMobileRoutePathIntent("/admin/moderation"), {
      name: "AdminIncidents",
      params: undefined,
      type: "route",
    });
  });

  it("rejects sensitive and unsupported route URLs", () => {
    assert.equal(
      resolveMobileNavigationIntent("whispr://channels/@me?token=secret", { webUrl }),
      null,
    );
    // `/admin` is a routable prefix now, but the bare path is still not a screen.
    assert.equal(resolveMobileNavigationIntent("whispr://admin", { webUrl }), null);
    assert.equal(
      resolveMobileNavigationIntent("whispr://admin/case/case-1/evidence", { webUrl }),
      null,
    );
    assert.equal(resolveMobileNavigationIntent("whispr://voice", { webUrl }), null);
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
    // The cold-start stack is built from the path, so MainTabs has to be named
    // as the initial route or back would quit the app from a linked detail
    // screen instead of landing on the tabs.
    assert.equal(linking.config?.initialRouteName, "MainTabs");
    assert.equal(
      (linking.config?.screens.MainTabs as { readonly initialRouteName?: string }).initialRouteName,
      "overview",
    );
    // Stop three: without the path in `config.screens` a cold-start link would
    // resolve to an intent React Navigation then cannot build a stack for.
    assert.equal(linking.config?.screens.AdminIncidentDetail, "admin/case/:caseId");
    assert.equal(linking.config?.screens.AdminIncidents, "admin/cases");

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
