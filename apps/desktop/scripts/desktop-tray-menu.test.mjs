import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const tray = source.slice(
  source.indexOf("fn setup_tray("),
  source.indexOf("fn position_desktop_companion_window"),
);

test("tray exposes only everyday actions and starts voice actions disabled", () => {
  const entries = [...tray.matchAll(/MenuItem::with_id\(app, "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(entries, [
    "show",
    "toggle_mute",
    "toggle_deafen",
    "leave_voice",
    "settings",
    "updates",
    "quit",
  ]);
  for (const id of ["toggle_mute", "toggle_deafen", "leave_voice"]) {
    assert.match(tray, new RegExp(`MenuItem::with_id\\(app, "${id}", labels\\[\\d\\], false,`));
  }
});

test("voice actions stay in the background; navigation and quit use existing safe paths", () => {
  for (const [id, command] of [
    ["toggle_mute", "toggle-mute"],
    ["toggle_deafen", "toggle-deafen"],
    ["leave_voice", "leave-voice"],
  ]) {
    assert.match(
      tray,
      new RegExp(`"${id}" => dispatch_desktop_command_without_focus\\(app, "${command}", None\\)`),
    );
  }
  assert.match(tray, /"settings" => schedule_desktop_control_window\(app, "app"\)/);
  assert.match(tray, /\/settings\/updates\/updates/);
  assert.match(tray, /"quit" => request_app_quit\(/);
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

test("tray tracks the actual voice connection, mute, deafen and application language", () => {
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
