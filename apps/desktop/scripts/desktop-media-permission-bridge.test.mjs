import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const bridgeSource = await readFile(
  path.join(desktopRoot, "src-tauri", "assets", "desktop-media-permission-bridge.js"),
  "utf8",
);

function createHarness({ decisions = {}, desktop = true, permissionStates = {} } = {}) {
  const captureCalls = [];
  const order = [];
  const prompts = [];
  let requestSequence = 0;
  const originalGetUserMedia = async (constraints) => {
    order.push("capture");
    captureCalls.push(constraints);
    return { constraints };
  };
  const context = {
    DOMException,
    Map,
    Object,
    Promise,
    console,
    navigator: {
      mediaDevices: { getUserMedia: originalGetUserMedia },
      permissions: {
        query: async ({ name }) => ({ state: permissionStates[name] ?? "prompt" }),
      },
    },
    queueMicrotask,
    setTimeout,
  };
  context.window = context;
  if (desktop) {
    context.__WHISPR_DESKTOP__ = { shell: "desktop" };
    context.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        assert.equal(command, "request_desktop_media_permission");
        order.push(`prompt:${args.kind}`);
        prompts.push(args.kind);
        const requestId = `media-permission-${++requestSequence}`;
        queueMicrotask(() => {
          order.push(`decision:${args.kind}`);
          context.__WHISPR_DESKTOP_MEDIA_PERMISSION_RESOLVE__(
            requestId,
            decisions[args.kind] ?? true,
          );
        });
        return { kind: args.kind, requestId };
      },
    };
  }

  vm.runInNewContext(bridgeSource, context, { filename: "desktop-media-permission-bridge.js" });

  return { captureCalls, context, order, originalGetUserMedia, prompts };
}

describe("desktop media permission bridge", () => {
  it("leaves ordinary browser getUserMedia untouched", async () => {
    const harness = createHarness({ desktop: false });

    assert.equal(harness.context.navigator.mediaDevices.getUserMedia, harness.originalGetUserMedia);
    await harness.context.navigator.mediaDevices.getUserMedia({ audio: true });
    assert.deepEqual(harness.prompts, []);
    assert.equal(harness.captureCalls.length, 1);
  });

  it("waits for the trusted microphone choice before capture", async () => {
    const harness = createHarness();

    await harness.context.navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    assert.deepEqual(harness.prompts, ["microphone"]);
    assert.deepEqual(harness.order, ["prompt:microphone", "decision:microphone", "capture"]);
  });

  it("deduplicates concurrent requests for the same media kind", async () => {
    const harness = createHarness();

    await Promise.all([
      harness.context.navigator.mediaDevices.getUserMedia({ audio: true }),
      harness.context.navigator.mediaDevices.getUserMedia({ audio: true }),
    ]);

    assert.deepEqual(harness.prompts, ["microphone"]);
    assert.equal(harness.captureCalls.length, 2);
  });

  it("requests microphone then camera for combined capture", async () => {
    const harness = createHarness();

    await harness.context.navigator.mediaDevices.getUserMedia({ audio: true, video: true });

    assert.deepEqual(harness.prompts, ["microphone", "camera"]);
    assert.deepEqual(harness.order, [
      "prompt:microphone",
      "decision:microphone",
      "prompt:camera",
      "decision:camera",
      "capture",
    ]);
  });

  it("does not reprompt a permission already granted in the WebView2 profile", async () => {
    const harness = createHarness({ permissionStates: { camera: "granted" } });

    await harness.context.navigator.mediaDevices.getUserMedia({ video: true });

    assert.deepEqual(harness.prompts, []);
    assert.equal(harness.captureCalls.length, 1);
  });

  it("rejects denial without touching the capture device", async () => {
    const harness = createHarness({ decisions: { camera: false } });

    await assert.rejects(
      harness.context.navigator.mediaDevices.getUserMedia({ video: true }),
      (error) => error?.name === "NotAllowedError",
    );
    assert.deepEqual(harness.prompts, ["camera"]);
    assert.equal(harness.captureCalls.length, 0);
  });
});
