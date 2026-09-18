import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

// Actual LiveKit track/locks and Web Audio; only the licensed Krisp processor is replaced.
const bundle = await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  stdin: {
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    contents: `
      import {LocalAudioTrack} from "livekit-client";
      import {enableKrispProcessor} from "@/lib/voice/krisp-processor";
      window.run = async (concurrent) => {
        const context = new AudioContext();
        await context.resume();
        const source = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        source.connect(destination);
        source.start();
        const media = destination.stream.getAudioTracks()[0];
        const track = new LocalAudioTrack(media, {}, true, context);
        let initialized = 0, destroyed = 0, enabled = false;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const processor = {
          name: "livekit-noise-filter",
          async init() { initialized++; await gate; },
          async restart() {},
          async destroy() { destroyed++; enabled = false; },
          async setEnabled(value) { enabled = value && destroyed === 0; return enabled; },
          isEnabled() { return enabled; },
        };
        try {
          const first = enableKrispProcessor(track, processor);
          const second = concurrent ? enableKrispProcessor(track, processor) : null;
          release();
          const results = [await first, await (second ?? enableKrispProcessor(track, processor))];
          return {initialized, destroyed, enabled, results};
        } finally {
          track.stop(); source.stop(); await context.close();
        }
      };
    `,
  },
});

for (const concurrent of [false, true]) {
  test(`Krisp remains active after ${concurrent ? "concurrent" : "repeated"} attachment`, async () => {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const result = await page.evaluate((value) => window.run(value), concurrent);
      assert.deepEqual(result, {
        initialized: 1,
        destroyed: 0,
        enabled: true,
        results: [true, true],
      });
    } finally {
      await browser.close();
    }
  });
}
