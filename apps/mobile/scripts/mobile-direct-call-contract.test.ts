import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const hookSource = readFileSync(
  new URL("../src/voice/use-mobile-voice-room.ts", import.meta.url),
  "utf8",
);
const providerSource = readFileSync(
  new URL("../src/app/providers/mobile-voice-provider.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../src/app/mobile-product-app.tsx", import.meta.url),
  "utf8",
);
const directCallActionsSource = readFileSync(
  new URL("../src/app/features/use-mobile-direct-call-actions.ts", import.meta.url),
  "utf8",
);
const dmCallFeatureSource = readFileSync(
  new URL("../src/app/features/use-mobile-dm-call-feature.ts", import.meta.url),
  "utf8",
);
const voiceRoomContainerSource = readFileSync(
  new URL("../src/app/screens/mobile-screen-containers.tsx", import.meta.url),
  "utf8",
);
const outgoingScreenSource = readFileSync(
  new URL("../src/app/screens/mobile-outgoing-call-screen.tsx", import.meta.url),
  "utf8",
);
const routeNavigationSource = readFileSync(
  new URL("../src/voice/mobile-voice-room-route-navigation.ts", import.meta.url),
  "utf8",
);

describe("mobile direct-call contract", () => {
  it("exposes a direct-call join that targets the conversation and skips channel membership", () => {
    assert.match(hookSource, /joinDirectCall/);
    assert.match(
      hookSource,
      /fetchMobileVoiceToken\(apiClient, \{ conversationId:\s*conversationId! \}\)/,
    );
    assert.match(hookSource, /sessionMode:\s*"direct"/);
    assert.match(hookSource, /serverId:\s*null/);
    assert.match(hookSource, /channelName:\s*title/);
    assert.match(hookSource, /const serverParticipants = isDirectCall\s*\? \[\]/);
    assert.match(hookSource, /sessionModeRef\.current === "channel"/);
    assert.match(hookSource, /if \(sessionId\) \{\s*startHeartbeat/);
  });

  it("requests maintained camera permission and publishes video only for video calls", () => {
    assert.match(providerSource, /requestCameraPermission/);
    assert.match(hookSource, /video[^]*setCameraEnabled\(true\)/);
  });

  it("wires both Task 3 DM callbacks through the successful-join navigation gate", () => {
    assert.match(appSource, /onStartVoiceCall/);
    assert.match(appSource, /onStartVideoCall/);
    assert.match(directCallActionsSource, /onStartVoiceCall/);
    assert.match(directCallActionsSource, /onStartVideoCall/);
    assert.match(directCallActionsSource, /await startCall\(/);
    assert.match(dmCallFeatureSource, /await launchMobileDirectCall/);
    // The room screen must open before joining: waiting for the LiveKit handshake made the
    // ringing screen appear seconds late.
    const openIndex = routeNavigationSource.indexOf("openVoiceRoom({");
    const joinIndex = routeNavigationSource.indexOf("joinDirectCall({");
    assert.ok(openIndex > 0 && joinIndex > 0);
    assert.ok(openIndex < joinIndex);
    assert.match(routeNavigationSource, /return joinDirectCall\(/);
  });

  it("keeps ring state out of the LiveKit runtime hook", () => {
    // The ring handshake belongs to the DM call feature; the voice runtime only joins rooms.
    assert.doesNotMatch(hookSource, /incoming-call|ringing/i);
    assert.match(dmCallFeatureSource, /emitDMCallStart/);
    assert.match(dmCallFeatureSource, /ringing-out/);
  });

  it("routes an unanswered outgoing call to the 7a/7b screens", () => {
    assert.match(voiceRoomContainerSource, /dmCallSession\?\.status === "ringing-out"/);
    assert.match(voiceRoomContainerSource, /MobileOutgoingVideoCallScreen/);
    assert.match(voiceRoomContainerSource, /MobileOutgoingVoiceCallScreen/);
    // 7a and 7b keep the full waiting dock with screen share disabled until connected.
    assert.match(outgoingScreenSource, /directCallCancelAction/);
    assert.match(outgoingScreenSource, /disabled\s+glass=\{glass\}\s+icon="tv-outline"/);
  });

  it("leaves the voice room route when the DM call ends", () => {
    // Without this the room state resets and the channel voice UI would be left on screen.
    assert.match(
      voiceRoomContainerSource,
      /routeContext\?\.sessionMode !== "direct" \|\| dmCallSession/,
    );
    assert.match(voiceRoomContainerSource, /const endDirectCall = useMobileDMCallStore/);
  });

  it("returns to the conversation when an outgoing call is not answered", () => {
    // Popping rather than replacing: the conversation is usually already on the
    // stack under the call, and replacing left a second copy of it behind.
    assert.match(voiceRoomContainerSource, /navigation\.popTo\("DirectMessage", \{ conversationId \}\)/);
  });
});
