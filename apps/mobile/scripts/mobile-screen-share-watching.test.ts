import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMobileScreenShareWatching,
  type MobileScreenShareWatch,
} from "../src/voice/mobile-screen-share-watching";
import { resolveMobileScreenShareLayer } from "../src/voice/mobile-video-subscription";
import { resolveVideoAspect } from "../src/voice/mobile-video-layout";
import { VideoQuality } from "livekit-client";

test("visible inline/fullscreen surfaces deduplicate, renew at 60s, and stop on background/unmount", () => {
  const watcher = createMobileScreenShareWatching();
  const events: MobileScreenShareWatch[] = [];
  watcher.setEmitter((event) => events.push(event));
  const target = { channelId: "channel", serverId: "server", sharerUserId: "alice" };
  const inline = watcher.watch(target);
  const fullscreen = watcher.watch(target);
  assert.equal(events.length, 1);
  const now = Date.now();
  watcher.tick(now + 59_000);
  assert.equal(events.length, 1);
  watcher.tick(now + 60_001);
  assert.equal(events.length, 2);
  inline();
  inline();
  assert.equal(events.length, 2);
  watcher.setActive(false);
  assert.equal(events.at(-1)?.watching, false);
  watcher.tick(now + 120_000);
  assert.equal(events.length, 3);
  watcher.setActive(true);
  assert.equal(events.at(-1)?.watching, true);
  fullscreen();
  assert.equal(events.at(-1)?.watching, false);
  watcher.tick(now + 180_000);
  assert.equal(events.length, 5);
});

test("screen-only ultrawide aspect and 4K decoder ceiling preserve camera layout", () => {
  const dimensions = { width: 3840, height: 2160 };
  assert.equal(
    resolveMobileScreenShareLayer({ dimensions, isFullscreen: true }),
    VideoQuality.MEDIUM,
  );
  assert.equal(
    resolveMobileScreenShareLayer({
      dimensions: { width: 1920, height: 1080 },
      isFullscreen: true,
    }),
    VideoQuality.HIGH,
  );
  assert.equal(resolveMobileScreenShareLayer({ isFullscreen: false }), VideoQuality.MEDIUM);
  assert.equal(resolveVideoAspect({ width: 2520, height: 1080 }, "screen"), 21 / 9);
  assert.equal(resolveVideoAspect({ width: 2520, height: 1080 }, "camera"), 16 / 9);
});
