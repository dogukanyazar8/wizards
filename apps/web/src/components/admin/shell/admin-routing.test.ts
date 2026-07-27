import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AdminRole } from "@wizards/db";
import { redirectLegacyAdminHash } from "./admin-anchor-shim";
import { getVisibleAdminNavGroups } from "./admin-nav-items";
import { isAdminNavPathActive } from "./admin-shell-nav-link";

const adminAppRoot = join(process.cwd(), "src", "app", "admin");

const expectedNavKeys: Record<AdminRole, string[]> = {
  ADMIN: ["overview", "users", "servers", "audit", "activity", "notifications", "feedback"],
  ANALYST: ["overview", "activity", "feedback"],
  MODERATOR: ["overview", "users", "servers", "activity", "feedback"],
  OWNER: ["overview", "users", "servers", "audit", "activity", "notifications", "feedback"],
  SUPPORT: ["overview", "users", "servers", "activity", "feedback"],
};

const pageCapabilityPins = [
  { capability: "dashboard.read", file: "page.tsx" },
  { capability: "user.read", file: "users/page.tsx" },
  { capability: "server.read", file: "servers/page.tsx" },
  { capability: "dashboard.read", file: "activity/page.tsx" },
  { capability: "audit.read", file: "audit/page.tsx" },
] as const;

describe("admin route shell", () => {
  it("derives each role's visible modules from capabilities", () => {
    for (const [role, expectedKeys] of Object.entries(expectedNavKeys) as Array<
      [AdminRole, string[]]
    >) {
      const actualKeys = getVisibleAdminNavGroups(role).flatMap((group) =>
        group.items.map((item) => item.key),
      );

      assert.deepEqual(actualKeys, expectedKeys, `${role} navigation changed`);
    }
  });

  it("pins each admin page to its own server-side capability", () => {
    for (const { capability, file } of pageCapabilityPins) {
      const pagePath = join(adminAppRoot, file);

      assert.ok(existsSync(pagePath), `${file} is missing`);
      assert.match(
        readFileSync(pagePath, "utf8"),
        new RegExp(`requireAdminCapability\\("${capability.replace(".", "\\.")}"\\)`, "u"),
        `${file} must require ${capability}`,
      );
    }
  });

  it("redirects only known legacy fragments through the client router", () => {
    const destinations: string[] = [];

    assert.equal(
      redirectLegacyAdminHash("#users", (href) => destinations.push(href)),
      true,
    );
    assert.equal(
      redirectLegacyAdminHash("#audit", (href) => destinations.push(href)),
      true,
    );
    assert.equal(
      redirectLegacyAdminHash("#unknown", (href) => destinations.push(href)),
      false,
    );
    assert.deepEqual(destinations, ["/admin/users", "/admin/audit"]);
  });

  it("selects a rail item from the current admin pathname", () => {
    assert.equal(isAdminNavPathActive("/admin", "/admin"), true);
    assert.equal(isAdminNavPathActive("/admin/users", "/admin/users"), true);
    assert.equal(isAdminNavPathActive("/admin/users/details", "/admin/users"), true);
    assert.equal(isAdminNavPathActive("/admin/users", "/admin"), false);
    assert.equal(isAdminNavPathActive("/admin/unknown", "/admin/audit"), false);
  });
});
