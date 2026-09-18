import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
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

// Import the real SDK as ESM (strict mode), after the native initialization script.
// Krisp bundles a WebRTC adapter that wraps getUserMedia during module evaluation.
const desktopBridge = await readFile(
  new URL("../../desktop/src-tauri/assets/desktop-media-permission-bridge.js", import.meta.url),
  "utf8",
);
const krispModule = await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  stdin: {
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    contents: 'export { isKrispNoiseFilterSupported } from "@livekit/krisp-noise-filter";',
  },
});

for (const allowed of [false, true]) {
  test(`real Krisp module loads after desktop bridge and respects microphone ${allowed ? "approval" : "denial"}`, async () => {
    const browser = await chromium.launch({
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.route("https://voice.test/", (route) =>
        route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Krisp</title>" }),
      );
      await page.route("https://voice.test/krisp.js", (route) =>
        route.fulfill({ contentType: "text/javascript", body: krispModule.outputFiles[0].text }),
      );
      await page.addInitScript((allowed) => {
        window.__WHISPR_DESKTOP__ = { shell: "desktop" };
        window.prompts = [];
        window.captureCalls = 0;
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (constraints) => {
          window.captureCalls++;
          return capture(constraints);
        };
        // Exercise the trusted prompt even though Chromium's fake device is preapproved.
        navigator.permissions.query = async () => ({ state: "prompt" });
        window.__TAURI_INTERNALS__ = {
          async invoke(command, { kind }) {
            window.prompts.push({ command, kind });
            const requestId = "media-permission-1";
            queueMicrotask(() =>
              window.__WHISPR_DESKTOP_MEDIA_PERMISSION_RESOLVE__(requestId, allowed),
            );
            return { kind, requestId };
          },
        };
      }, allowed);
      await page.goto("https://voice.test/");
      await page.evaluate(desktopBridge);
      const result = await page.evaluate(async () => {
        const bridgeCapture = navigator.mediaDevices.getUserMedia;
        const krisp = await import("/krisp.js");
        let outcome;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          outcome = stream.getAudioTracks()[0].readyState;
          stream.getTracks().forEach((track) => track.stop());
        } catch (error) {
          outcome = error.name;
        }
        return {
          supported: krisp.isKrispNoiseFilterSupported(),
          wrapped: navigator.mediaDevices.getUserMedia !== bridgeCapture,
          outcome,
          captureCalls: window.captureCalls,
          prompts: window.prompts,
        };
      });
      assert.deepEqual(result, {
        supported: true,
        wrapped: true,
        outcome: allowed ? "live" : "NotAllowedError",
        captureCalls: allowed ? 1 : 0,
        prompts: [{ command: "request_desktop_media_permission", kind: "microphone" }],
      });
    } finally {
      await browser.close();
    }
  });
}
