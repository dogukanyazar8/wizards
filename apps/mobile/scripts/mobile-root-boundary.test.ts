import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(process.cwd(), "src", "app");

describe("mobile root boundary", () => {
  it("keeps the root focused on provider composition and typed navigation", () => {
    const source = readFileSync(join(appRoot, "whispr-mobile-root.tsx"), "utf8");
    assert.match(source, /MobileAppProviders/);
    assert.match(source, /MobileProductApp/);
    assert.match(source, /MobileNavigator/);
    assert.doesNotMatch(source, /ActiveScreen|MobileScreenRuntime|fetchMobile|sendMobile/);
    assert.ok(source.split(/\r?\n/).length < 300);
  });

  it("renders each navigation surface through a focused screen provider hook", () => {
    const source = readFileSync(join(appRoot, "screens", "mobile-screen-containers.tsx"), "utf8");
    for (const screen of [
      "OverviewScreen",
      "MessagesScreen",
      "NotificationsScreen",
      "VoiceScreen",
      "ProfileSettingsScreen",
    ]) {
      assert.match(source, new RegExp(`<${screen}`));
    }
    assert.match(source, /useMobileOverviewScreenProps/);
    assert.match(source, /useMobileMessagesScreenProps/);
    assert.doesNotMatch(source, /ActiveScreen|MobileScreenRuntimeProvider|ActiveScreenProps/);
  });

  it("keeps focused route cleanup callbacks stable while selected targets change", () => {
    const source = readFileSync(join(appRoot, "screens", "mobile-screen-containers.tsx"), "utf8");
    assert.match(source, /useLatestValueRef\(closeWorkspaceChannel\)/);
    assert.match(source, /useLatestValueRef\(closeDMConversation\)/);
    assert.match(source, /closeWorkspaceChannelRef\.current\(\)/);
    assert.match(source, /closeDMConversationRef\.current\(\)/);
  });

  it("keeps route, overlay, and composer modules split by product surface", () => {
    for (const path of [
      ["screens", "home-screen.tsx"],
      ["screens", "dm-screen.tsx"],
      ["screens", "channel-screen.tsx"],
      ["screens", "voice-screen.tsx"],
      ["screens", "settings-screen.tsx"],
      ["screens", "notifications-screen.tsx"],
      ["screens", "auth", "mobile-auth-screen-containers.tsx"],
      ["overlays", "mobile-voice-invite-overlay.tsx"],
      ["composer", "mobile-composer.tsx"],
    ]) {
      assert.equal(existsSync(join(appRoot, ...path)), true, path.join("/") + " should exist");
    }
  });

  it("keeps virtualized lists and cached remote images on their production primitives", () => {
    const channel = readFileSync(join(appRoot, "screens", "channel-screen.tsx"), "utf8");
    const dmInbox = readFileSync(join(appRoot, "screens", "dm-inbox.tsx"), "utf8");
    const home = readFileSync(join(appRoot, "screens", "home-screen.tsx"), "utf8");
    const workspaceChannels = readFileSync(
      join(appRoot, "screens", "workspace-channel-section-list.tsx"),
      "utf8",
    );
    const messages = readFileSync(join(appRoot, "components", "message-primitives.tsx"), "utf8");
    const image = readFileSync(join(appRoot, "components", "mobile-cached-image.tsx"), "utf8");
    for (const source of [channel, dmInbox, home, messages, workspaceChannels]) {
      assert.match(source, /FlashList/);
    }
    assert.match(image, /cachePolicy="memory-disk"/);
    assert.match(image, /contentFit="cover"/);
  });

  it("keeps realtime ownership in one provider and bridge", () => {
    const provider = readFileSync(
      join(appRoot, "providers", "mobile-realtime-provider.tsx"),
      "utf8",
    );
    assert.match(provider, /createMobileRealtimeQueryBridge/);
    assert.match(provider, /createMobileRealtimeClient/);
    assert.match(provider, /getMobileRealtimeForegroundBackfillSources/);
  });

  it("keeps voice room participants in one mobile section", () => {
    const source = readFileSync(join(appRoot, "screens", "voice-screen.tsx"), "utf8");
    assert.match(source, /model\.participants\.map/);
    assert.doesNotMatch(source, /participants=\{model\.(speaking|listening)Participants\}/);
  });
});
