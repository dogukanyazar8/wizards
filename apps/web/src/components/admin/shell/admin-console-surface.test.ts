import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  ADMIN_CONSOLE_SURFACE,
  ADMIN_SURFACE_PARAM,
  resolveAdminSurface,
} from "@/components/admin/shell/admin-console-surface";

const shellRoot = dirname(fileURLToPath(import.meta.url));
const adminShellSource = readFileSync(join(shellRoot, "..", "kit", "admin-shell.tsx"), "utf8");
const desktopLibSource = readFileSync(
  join(shellRoot, "..", "..", "..", "..", "..", "desktop", "src-tauri", "src", "lib.rs"),
  "utf8",
);

describe("admin console surface", () => {
  it("treats only the console value as the detached surface", () => {
    assert.equal(resolveAdminSurface(ADMIN_CONSOLE_SURFACE), "console");
    assert.equal(resolveAdminSurface(null), "app");
    assert.equal(resolveAdminSurface(""), "app");
    assert.equal(resolveAdminSurface("Console"), "app");
    assert.equal(resolveAdminSurface("desktop"), "app");
  });

  /**
   * F test 9: the console window is the same admin route without the rail. The
   * shell has to gate the rail on the surface rather than ship a second layout,
   * because two layouts drift the moment one of them gains a module.
   */
  it("renders the navigation rail only outside the console surface", () => {
    assert.match(adminShellSource, /<AdminAppSurfaceOnly>\s*<aside/u);
    assert.match(adminShellSource, /<\/aside>\s*<\/AdminAppSurfaceOnly>/u);
    assert.match(adminShellSource, /<AdminSurfaceRoot/u);
  });

  /** The native window and the web reader have to name the same query. */
  it("agrees with the desktop window on the surface query", () => {
    assert.equal(ADMIN_SURFACE_PARAM, "surface");
    assert.match(
      desktopLibSource,
      new RegExp(
        `DESKTOP_ADMIN_CONSOLE_PATH: &str = "/admin/moderation\\?${ADMIN_SURFACE_PARAM}=${ADMIN_CONSOLE_SURFACE}"`,
        "u",
      ),
    );
  });
});
