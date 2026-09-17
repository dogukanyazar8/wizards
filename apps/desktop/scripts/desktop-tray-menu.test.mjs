import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const tray = source.slice(
  source.indexOf("fn setup_tray("),
  source.indexOf("fn position_desktop_companion_window"),
);

test("tray exposes only open, settings, and close actions", () => {
  const entries = [...tray.matchAll(/MenuItem::with_id\(app, "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(entries, ["show", "settings", "quit"]);
  assert.equal([...tray.matchAll(/PredefinedMenuItem::separator\(app\)/g)].length, 2);
  assert.match(
    tray,
    /Menu::with_items\(\s*app,\s*&\[\s*&show_item,\s*&open_separator,\s*&settings_item,\s*&settings_separator,\s*&quit_item,?\s*\]/,
  );
});

test("open, settings, and close keep their existing safe paths", () => {
  assert.match(tray, /"show" => show_main_window\(app\)/);
  assert.match(tray, /"settings" => schedule_desktop_control_window\(app, "app"\)/);
  assert.match(tray, /"quit" => request_app_quit\(/);
  assert.doesNotMatch(tray, /"(?:toggle_mute|toggle_deafen|leave_voice|updates)" =>/);
});

test("only the main window can publish typed tray state and unsupported locales are rejected", () => {
  const command = source.slice(
    source.indexOf("fn set_desktop_activity_status("),
    source.indexOf("/// F9:", source.indexOf("fn set_desktop_activity_status(")),
  );
  assert.match(command, /assert_desktop_main_command_window\(&window\)\?/);
  assert.match(command, /tray: Option<DesktopTrayContext>/);
  assert.match(command, /"tr" \| "en"/);
  assert.match(command, /DesktopTrayItems>\(\)\s*\.sync\(tray\.as_ref\(\), voice_active\)\?/);
  assert.ok(command.indexOf("assert_desktop_main_command_window") < command.indexOf(".sync("));
});

test("tray tracks application language without changing desktop activity publishing", () => {
  const experience = readFileSync(
    new URL("../../web/src/components/desktop/desktop-experience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(experience, /setDesktopActivityStatus\(desktopActivityStatus,\s*\{\s*locale,/);
  assert.match(
    experience,
    /voiceActive: Boolean\(activeChannelId\) && connectionState === "connected"/,
  );
  assert.match(experience, /muted: isMuted/);
  assert.match(experience, /deafened: isDeafened/);
  assert.match(experience, /setDesktopActivityStatus\("idle"\)/);
});
