import assert from "node:assert/strict";
import test from "node:test";
import {
  getMobileRecentDMPrefetchStats,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchSettled,
} from "../src/query/mobile-message-prefetch";
import { mobileSearchKeyRegistry } from "../src/query/mobile-query-keys";
import { useMobileActiveTargetStore } from "../src/state/mobile-active-target-store";
import { useMobileComposerDraftStore } from "../src/state/mobile-composer-draft-store";
import { useMobileOverlayStore } from "../src/state/mobile-overlay-store";
import { resetMobileSessionState } from "../src/state/reset-mobile-session-state";

test("focused mobile stores keep navigation, drafts, and overlays isolated", () => {
  useMobileActiveTargetStore.getState().setTextChannel("server-1", "channel-1");
  useMobileComposerDraftStore.getState().setDraft("channel:channel-1", "draft");
  useMobileOverlayStore.getState().openOverlay("voice-invite");

  assert.deepEqual(
    {
      channelId: useMobileActiveTargetStore.getState().channelId,
      serverId: useMobileActiveTargetStore.getState().serverId,
    },
    { channelId: "channel-1", serverId: "server-1" },
  );
  assert.equal(useMobileComposerDraftStore.getState().getDraft("channel:channel-1"), "draft");
  assert.equal(useMobileOverlayStore.getState().activeOverlay, "voice-invite");
});

test("composer drafts are bounded without changing user whitespace", () => {
  const content = `  ${"x".repeat(2_100)}  `;
  useMobileComposerDraftStore.getState().setDraft("dm:conversation-1", content);

  const draft = useMobileComposerDraftStore.getState().getDraft("dm:conversation-1");
  assert.equal(draft.length, 2_000);
  assert.equal(draft.startsWith("  "), true);
});

test("reset clears session UI state and the in-memory search registry", () => {
  useMobileActiveTargetStore.getState().setConversation("conversation-1");
  useMobileComposerDraftStore.getState().setDraft("dm:conversation-1", "private draft");
  useMobileOverlayStore.getState().openOverlay("screen-share-consent");
  recordMobileRecentDMPrefetch(["conversation-1"]);
  recordMobileRecentDMPrefetchSettled("conversation-1");
  assert.equal(
    mobileSearchKeyRegistry.getFingerprint({
      conversationId: "conversation-1",
      query: "private search",
      scope: "dm",
    }),
    "search-1",
  );

  resetMobileSessionState();

  assert.equal(useMobileActiveTargetStore.getState().conversationId, null);
  assert.deepEqual(useMobileComposerDraftStore.getState().drafts, {});
  assert.equal(useMobileOverlayStore.getState().activeOverlay, null);
  assert.deepEqual(getMobileRecentDMPrefetchStats(), {
    attempted: 0,
    hitRate: 0,
    openedAfterSettled: 0,
    settled: 0,
  });
  assert.equal(
    mobileSearchKeyRegistry.getFingerprint({
      conversationId: "conversation-1",
      query: "private search",
      scope: "dm",
    }),
    "search-1",
  );
});
