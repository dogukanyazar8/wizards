import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const appRoot = join(process.cwd(), "src", "app");

describe("mobile Phase 2 architecture", () => {
  it("moves message data ownership into a dedicated feature hook", () => {
    const productApp = readFileSync(join(appRoot, "mobile-product-app.tsx"), "utf8");
    const messagingHook = join(appRoot, "features", "use-mobile-messaging-feature.ts");
    const channelRouteState = join(appRoot, "features", "use-mobile-channel-route-state.ts");
    const dmRouteState = join(appRoot, "features", "use-mobile-dm-route-state.ts");

    assert.equal(existsSync(messagingHook), true, "Expected a dedicated messaging feature hook");
    assert.equal(
      existsSync(channelRouteState),
      true,
      "Expected a dedicated channel route state hook",
    );
    assert.equal(existsSync(dmRouteState), true, "Expected a dedicated DM route state hook");
    assert.match(productApp, /useMobileMessagingFeature/);

    const source = readFileSync(messagingHook, "utf8");
    const channelRouteSource = readFileSync(channelRouteState, "utf8");
    const dmRouteSource = readFileSync(dmRouteState, "utf8");
    assert.doesNotMatch(source, /useMobileChannelMessagesQuery/);
    assert.doesNotMatch(source, /useMobileDMMessagesQuery/);
    // The channel route builds the transcript query itself: live or anchored on
    // a search hit, one options builder either way.
    assert.match(channelRouteSource, /getMobileChannelMessagesQueryOptions/);
    assert.match(dmRouteSource, /useMobileDMMessagesQuery/);
    assert.match(source, /useMobileMessageSearchQuery/);
    assert.match(source, /useMobileChannelMessageMutation/);
    assert.match(source, /useMobileDMMessageMutation/);
  });

  it("keeps message navigation and visible-data refresh with the messaging feature", () => {
    const productApp = readFileSync(join(appRoot, "mobile-product-app.tsx"), "utf8");
    const messagingHook = readFileSync(
      join(appRoot, "features", "use-mobile-messaging-feature.ts"),
      "utf8",
    );

    assert.match(messagingHook, /const \[selectedDMConversationId/);
    assert.match(messagingHook, /const handleOpenWorkspaceChannel/);
    assert.match(messagingHook, /const refreshVisibleMobileData/);
    assert.doesNotMatch(productApp, /const \[selectedDMConversationId/);
    assert.doesNotMatch(productApp, /const handleOpenWorkspaceChannel/);
    assert.match(productApp, /const channelScreenProps = overviewScreenProps;/);
    assert.ok(
      productApp.trimEnd().split(/\r?\n/).length < 525,
      "Product app must stay focused (memoized tab screen-props carry explicit dependency arrays)",
    );
  });

  it("splits DM inbox and conversation surfaces around their owning features", () => {
    const dmScreen = join(appRoot, "screens", "dm-screen.tsx");
    const inbox = join(appRoot, "screens", "dm-inbox.tsx");
    const conversation = join(appRoot, "screens", "dm-conversation-screen.tsx");

    assert.equal(existsSync(inbox), true, "Expected a dedicated DM inbox surface");
    assert.equal(existsSync(conversation), true, "Expected a dedicated DM conversation surface");

    const source = readFileSync(dmScreen, "utf8");
    assert.match(source, /from "\.\/dm-inbox"/);
    assert.match(source, /from "\.\/dm-conversation-screen"/);
    // Budget covers the inbox/conversation split, the route gate that keeps the
    // pushed DirectMessage screen from falling back to the inbox, and the one
    // search band all three tabs share.
    assert.ok(source.split(/\r?\n/).length < 245, "DM screen shell must remain focused");
  });

  it("moves the workspace message surface behind a dedicated browser module", () => {
    const homeScreen = join(appRoot, "screens", "home-screen.tsx");
    const workspaceBrowser = join(appRoot, "screens", "workspace-browser.tsx");
    const channelSections = join(appRoot, "screens", "workspace-channel-section-list.tsx");

    assert.equal(existsSync(workspaceBrowser), true, "Expected a workspace browser surface");
    assert.equal(existsSync(channelSections), true, "Expected a workspace channel-list surface");

    const source = readFileSync(homeScreen, "utf8");
    assert.match(source, /from "\.\/workspace-browser"/);
    assert.match(source, /from "\.\/workspace-channel-section-list"/);
  });

  it("keeps voice invites and local realtime handling in their own feature hook", () => {
    const productApp = readFileSync(join(appRoot, "mobile-product-app.tsx"), "utf8");
    const voiceFeature = join(appRoot, "features", "use-mobile-voice-invite-feature.ts");

    assert.equal(existsSync(voiceFeature), true, "Expected a dedicated voice invite feature hook");
    assert.match(productApp, /useMobileVoiceInviteFeature/);

    const source = readFileSync(voiceFeature, "utf8");
    assert.match(source, /voice:invite:received/);
    assert.match(source, /voice:state:update/);
    assert.match(source, /subscribe\(handleLocalRealtimeEvent\)/);
  });

  it("opens message threads through a protected mobile stack route", () => {
    const navigator = readFileSync(
      join(process.cwd(), "src", "navigation", "mobile-navigator.tsx"),
      "utf8",
    );
    const messagePrimitives = readFileSync(
      join(appRoot, "components", "message-primitives.tsx"),
      "utf8",
    );

    assert.match(navigator, /name="MessageThread"/);
    assert.match(messagePrimitives, /onOpenThread/);
  });
});
