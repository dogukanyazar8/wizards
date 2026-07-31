import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  mobileListLoadHandlers,
  notifyMobileFirstPaint,
  observeMobileListLoads,
  resetMobileListLoadObserversForTests,
  resetMobilePerformanceMetricsForTests,
  peekMobilePerformanceSamples,
} from "../src/performance/mobile-performance-metrics";

const MOBILE_ROOT = path.join(__dirname, "..");

function readMobileSource(relativePath: string) {
  return readFileSync(path.join(MOBILE_ROOT, relativePath), "utf8");
}

afterEach(() => {
  resetMobileListLoadObserversForTests();
  resetMobilePerformanceMetricsForTests();
});

/**
 * A device baseline reported ten DM opens as ten abandoned spans and zero
 * measurements: the closer had stayed behind on the preview component the live
 * transcript replaced. These assertions are about the wiring, because the defect
 * was wiring — every module involved already worked.
 */
describe("chat open instrumentation wiring", () => {
  it("closes a route's span from the live DM transcript", () => {
    const routes: (string | null)[] = [];
    observeMobileListLoads((route) => routes.push(route));

    mobileListLoadHandlers.dmMessages({ elapsedTimeInMs: 42 });

    assert.deepEqual(routes, ["DirectMessage"]);
  });

  it("keeps the bounded channel preview from closing a DM open", () => {
    const routes: (string | null)[] = [];
    observeMobileListLoads((route) => routes.push(route));

    mobileListLoadHandlers.channelMessagesPreview({ elapsedTimeInMs: 12 });

    // Still a real render cost, but attributed to the channel and closing
    // nothing: it renders inside a channel screen whose span is already closed.
    assert.deepEqual(routes, [null]);
    assert.equal(peekMobilePerformanceSamples().at(-1)?.surface, "channel-messages");
  });

  it("closes an open that settled with no list to render", () => {
    const routes: (string | null)[] = [];
    observeMobileListLoads((route) => routes.push(route));

    notifyMobileFirstPaint("DirectMessage");
    notifyMobileFirstPaint("");

    assert.deepEqual(routes, ["DirectMessage"]);
    // No list rendered, so no render duration is invented for one.
    assert.deepEqual(peekMobilePerformanceSamples(), []);
  });

  it("binds the closer to the transcript the reader actually opens", () => {
    const liveTranscript = readMobileSource("src/app/components/dm-chat-primitives.tsx");
    const previewSurface = readMobileSource("src/app/components/message-primitives.tsx");

    assert.match(liveTranscript, /onLoad=\{mobileListLoadHandlers\.dmMessages\}/);
    assert.equal(previewSurface.includes("mobileListLoadHandlers.dmMessages"), false);
  });

  it("closes the empty and failed opens of both chat surfaces", () => {
    for (const [source, route] of [
      ["src/app/screens/dm-conversation-screen.tsx", "DirectMessage"],
      ["src/app/screens/channel-screen.tsx", "ChannelChat"],
    ] as const) {
      assert.match(
        readMobileSource(source),
        new RegExp(`notifyMobileFirstPaint\\("${route}"\\)`),
        `${source} leaves an empty or failed open unmeasured`,
      );
    }
  });
});
