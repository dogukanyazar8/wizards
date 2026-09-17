import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import vm from "node:vm";

const script = await readFile(
  new URL("../src-tauri/assets/desktop-control/app.js", import.meta.url),
  "utf8",
);
const settle = () => new Promise((resolve) => setImmediate(resolve));

it("the trusted permission window has no native frame or opaque canvas", async () => {
  const native = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const builder = native.slice(
    native.indexOf("fn show_or_create_desktop_control_window("),
    native.indexOf("fn hide_main_window_to_tray("),
  );
  for (const property of [
    "decorations(false)",
    "transparent(true)",
    "shadow(false)",
    "resizable(false)",
  ]) {
    assert.ok(builder.includes(`.${property}`), `permission window requires ${property}`);
  }
  assert.match(builder, /\.background_color\(tauri::utils::config::Color\(0, 0, 0, 0\)\)/);
  assert.match(builder, /\.on_navigation\(is_desktop_control_url\)/);
  assert.match(builder, /\.on_new_window\(\|_, _\| NewWindowResponse::Deny\)/);
});

async function surface(invoke) {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        textContent: "",
        hidden: false,
        disabled: false,
        open: false,
        listeners: {},
        addEventListener(kind, fn) {
          this.listeners[kind] = fn;
        },
        toggleAttribute(name, force) {
          this[name] = force;
        },
        focus() {
          this.focused = true;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      });
    return elements.get(id);
  };
  const window = { __TAURI_INTERNALS__: { invoke } };
  vm.runInNewContext(script, { window, document: { getElementById: get } });
  await settle();
  return { get, window };
}

it("requires an explicit grant and sends only the current request id", async () => {
  const calls = [];
  const ui = await surface(async (command, args) => {
    calls.push([command, args]);
    return { mediaPermissionPrompt: { kind: "microphone", requestId: "media-permission-1" } };
  });
  assert.equal(calls.length, 1);
  assert.equal(ui.get("media-permission-dialog").open, true);
  assert.equal(ui.get("media-permission-deny").focused, true);
  ui.get("media-permission-allow").listeners.click();
  await settle();
  assert.equal(calls[1][0], "resolve_desktop_media_permission");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), {
    allowed: true,
    requestId: "media-permission-1",
  });
  assert.equal(ui.get("media-permission-dialog").open, false);
});

it("Escape and native close deny access; malformed requests never prompt", async () => {
  for (const cancel of [
    (ui) => ui.get("media-permission-dialog").listeners.cancel({ preventDefault() {} }),
    (ui) => ui.window.whisprDesktopControlCancelMediaPermission(),
  ]) {
    const calls = [];
    const ui = await surface(async (command, args) => {
      calls.push([command, args]);
      return { mediaPermissionPrompt: { kind: "camera", requestId: "media-permission-2" } };
    });
    cancel(ui);
    await settle();
    assert.equal(calls[1][1].allowed, false);
  }
  const ui = await surface(async () => ({
    mediaPermissionPrompt: { kind: "camera", requestId: "forged" },
  }));
  assert.equal(ui.get("media-permission-dialog").open, false);
});

it("failed resolution stays open, allows retry and suppresses double submission", async () => {
  let submissions = 0;
  const ui = await surface(async (command) => {
    if (command === "get_desktop_control_state")
      return { mediaPermissionPrompt: { kind: "camera", requestId: "media-permission-3" } };
    submissions++;
    throw new Error("native failure with private detail");
  });
  ui.get("media-permission-allow").listeners.click();
  ui.get("media-permission-allow").listeners.click();
  await settle();
  assert.equal(submissions, 1);
  assert.equal(ui.get("media-permission-dialog").open, true);
  assert.equal(ui.get("media-permission-allow").disabled, false);
  assert.doesNotMatch(ui.get("media-permission-result").textContent, /private detail/);
});
