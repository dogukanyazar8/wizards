import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPublishDesktopRichPresence,
  isWhitelistedDesktopStreamingExecutable,
  resolveDesktopStreamerMode,
  sanitizeDesktopRichPresenceAudience,
} from "@/lib/desktop/privacy";

describe("desktop privacy controls", () => {
  it("defaults rich presence audience to nobody", () => {
    assert.equal(sanitizeDesktopRichPresenceAudience("friends"), "friends");
    assert.equal(sanitizeDesktopRichPresenceAudience("nobody"), "nobody");
    assert.equal(sanitizeDesktopRichPresenceAudience("everyone"), "nobody");
    assert.equal(sanitizeDesktopRichPresenceAudience(null), "nobody");
  });

  it("keeps streaming process detection pathless and opt-in", () => {
    assert.equal(isWhitelistedDesktopStreamingExecutable("C:\\Program Files\\obs64.exe"), true);
    assert.equal(isWhitelistedDesktopStreamingExecutable("/Applications/OBS.app/obs.exe"), true);
    assert.equal(isWhitelistedDesktopStreamingExecutable("notepad.exe"), false);
    assert.equal(isWhitelistedDesktopStreamingExecutable("bad\nname.exe"), false);
  });

  it("only enables detected streamer mode when process detection is enabled", () => {
    assert.deepEqual(
      resolveDesktopStreamerMode({
        foregroundProcessName: "obs64.exe",
        manualEnabled: false,
        processDetectionEnabled: false,
      }),
      {
        active: false,
        detectedExecutableName: null,
        reason: "off",
      },
    );

    assert.deepEqual(
      resolveDesktopStreamerMode({
        foregroundProcessName: "C:\\Program Files\\obs64.exe",
        manualEnabled: false,
        processDetectionEnabled: true,
      }),
      {
        active: true,
        detectedExecutableName: "obs64.exe",
        reason: "detected",
      },
    );
  });

  it("keeps manual streamer mode independent from process detection", () => {
    assert.deepEqual(
      resolveDesktopStreamerMode({
        foregroundProcessName: null,
        manualEnabled: true,
        processDetectionEnabled: false,
      }),
      {
        active: true,
        detectedExecutableName: null,
        reason: "manual",
      },
    );
  });

  it("does not publish local activity unless the user explicitly chooses friends", () => {
    assert.equal(canPublishDesktopRichPresence({ audience: "nobody", enabled: true }), false);
    assert.equal(canPublishDesktopRichPresence({ audience: "friends", enabled: false }), false);
    assert.equal(canPublishDesktopRichPresence({ audience: "friends", enabled: true }), true);
  });
});
