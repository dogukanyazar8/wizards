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
    assert.match(directCallActionsSource, /await launchMobileDirectCall/);
    assert.match(routeNavigationSource, /const joined = await joinDirectCall/);
    assert.match(routeNavigationSource, /if \(!joined\) \{\s*return false/);
    assert.match(routeNavigationSource, /openVoiceRoom/);
  });

  it("does not invent incoming or ringing direct-call state", () => {
    assert.doesNotMatch(hookSource, /incoming-call|ringing/i);
  });
});
