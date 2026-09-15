import assert from "node:assert/strict";
import { it } from "node:test";
import { shouldShowVoiceReminder } from "./active-voice-route";

const voice = { serverId: "server 1", channelId: "voice-1" };
it("settings and same-server navigation do not show the return banner", () => {
  for (const pathname of [
    "/settings",
    "/settings/av/audio",
    "/settings/appearance/theme",
    "/channels/server%201/voice-1",
    "/channels/server%201/text-2",
    "/home",
  ]) {
    assert.equal(shouldShowVoiceReminder(pathname, voice), false, pathname);
  }
});
it("another server and direct messages still offer returning to the active call", () => {
  for (const pathname of ["/channels/server-2/text", "/channels/@me", "/channels/%40me/dm-1"]) {
    assert.equal(shouldShowVoiceReminder(pathname, voice), true, pathname);
  }
});
it("idle voice sessions never show a return banner", () => {
  assert.equal(shouldShowVoiceReminder("/channels/other", { ...voice, channelId: null }), false);
  assert.equal(shouldShowVoiceReminder("/channels/other", { ...voice, serverId: null }), false);
});
