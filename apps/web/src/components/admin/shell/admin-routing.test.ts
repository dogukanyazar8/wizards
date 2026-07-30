import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AdminRole } from "@wizards/db";
import { redirectLegacyAdminHash } from "./admin-anchor-shim";
import { ADMIN_NAV_GROUPS, getVisibleAdminNavGroups } from "./admin-nav-items";
import { isAdminNavPathActive } from "./admin-shell-nav-link";

const adminAppRoot = join(process.cwd(), "src", "app", "admin");

const expectedNavKeys: Record<AdminRole, string[]> = {
  ADMIN: [
    "overview",
    "users",
    "analytics",
    "servers",
    "moderation",
    "audit",
    "releases",
    "help",
    "support",
    "voice",
    "health",
    "notifications",
    "flags",
    "feedback",
  ],
  ANALYST: ["overview", "analytics", "releases", "voice", "health", "feedback"],
  MODERATOR: [
    "overview",
    "users",
    "analytics",
    "servers",
    "moderation",
    "releases",
    "voice",
    "health",
    "feedback",
  ],
  OWNER: [
    "overview",
    "users",
    "analytics",
    "servers",
    "moderation",
    "audit",
    "releases",
    "help",
    "support",
    "voice",
    "health",
    "notifications",
    "flags",
    "feedback",
  ],
  SUPPORT: [
    "overview",
    "users",
    "analytics",
    "servers",
    "moderation",
    "releases",
    "support",
    "voice",
    "health",
    "feedback",
  ],
};

/** `/admin` is the segment root; every other module is one segment below it. */
function toSegmentFile(href: string, file: string) {
  return href === "/admin" ? file : `${href.slice("/admin/".length)}/${file}`;
}

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

  it("gives every module in the rail a page that guards its own capability", () => {
    const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

    assert.ok(items.length > 0, "the rail cannot be empty");

    for (const item of items) {
      const pageFile = toSegmentFile(item.href, "page.tsx");
      const pagePath = join(adminAppRoot, pageFile);

      assert.ok(
        existsSync(pagePath),
        `${item.href} is published in the rail but ${pageFile} does not exist`,
      );
      assert.match(
        readFileSync(pagePath, "utf8"),
        new RegExp(`requireAdminModule\\("${item.capability.replace(".", "\\.")}"\\)`, "u"),
        `${pageFile} must guard ${item.capability} through requireAdminModule`,
      );
      assert.ok(
        existsSync(join(adminAppRoot, toSegmentFile(item.href, "loading.tsx"))),
        `${item.href} needs a loading state so the shell keeps its cards`,
      );
    }
  });

  it("publishes no placeholder module in the rail", () => {
    for (const item of ADMIN_NAV_GROUPS.flatMap((group) => group.items)) {
      const source = readFileSync(join(adminAppRoot, toSegmentFile(item.href, "page.tsx")), "utf8");

      assert.doesNotMatch(
        source,
        /AdminModulePlaceholder/u,
        `${item.href} is in the rail but still renders a placeholder`,
      );
      assert.equal(
        item.comingSoon,
        undefined,
        `${item.href} is flagged as coming soon; drop it from the rail instead`,
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
