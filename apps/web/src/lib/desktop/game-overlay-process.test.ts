import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveDesktopGameOverlayProcessGate,
  sanitizeDesktopExecutableName,
  sanitizeDesktopGameOverlayGameSettings,
} from "@/lib/desktop/game-overlay-process";

describe("desktop game overlay process gate", () => {
  it("keeps foreground process detection pathless and bounded", () => {
    assert.equal(sanitizeDesktopExecutableName("C:\\Games\\osu!\\osu!.exe"), "osu!.exe");
    assert.equal(sanitizeDesktopExecutableName("/usr/bin/minecraft.exe"), "minecraft.exe");
    assert.equal(sanitizeDesktopExecutableName(""), null);
    assert.equal(sanitizeDesktopExecutableName("a".repeat(129)), null);
    assert.equal(sanitizeDesktopExecutableName("bad\nname.exe"), null);
  });

  it("allows overlay when opt-in process detection is disabled", () => {
    assert.deepEqual(
      resolveDesktopGameOverlayProcessGate({
        foregroundProcessName: null,
        gameSettings: {},
        processDetectionEnabled: false,
      }),
      {
        allowed: true,
        executableName: null,
        preference: null,
        reason: "process-detection-disabled",
      },
    );
  });

  it("uses a whitelist and per-game settings when process detection is enabled", () => {
    assert.equal(
      resolveDesktopGameOverlayProcessGate({
        foregroundProcessName: "notepad.exe",
        gameSettings: {},
        processDetectionEnabled: true,
      }).allowed,
      false,
    );

    assert.deepEqual(
      resolveDesktopGameOverlayProcessGate({
        foregroundProcessName: "C:\\Games\\osu!\\osu!.exe",
        gameSettings: sanitizeDesktopGameOverlayGameSettings({
          "osu!.exe": {
            enabled: false,
            anchor: "bottom-right",
            size: "large",
            speakingOnly: true,
          },
        }),
        processDetectionEnabled: true,
      }),
      {
        allowed: false,
        executableName: "osu!.exe",
        preference: {
          anchor: "bottom-right",
          enabled: false,
          size: "large",
          speakingOnly: true,
        },
        reason: "disabled-for-game",
      },
    );
  });

  it("falls back to the global overlay preference for whitelisted games without an override", () => {
    assert.deepEqual(
      resolveDesktopGameOverlayProcessGate({
        fallbackPreference: {
          enabled: true,
          anchor: "bottom-left",
          size: "compact",
          speakingOnly: true,
        },
        foregroundProcessName: "osu!.exe",
        gameSettings: {},
        processDetectionEnabled: true,
      }),
      {
        allowed: true,
        executableName: "osu!.exe",
        preference: {
          enabled: true,
          anchor: "bottom-left",
          size: "compact",
          speakingOnly: true,
        },
        reason: "allowed",
      },
    );
  });
});
