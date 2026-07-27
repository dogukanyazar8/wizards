import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { AdminRole } from "@wizards/db";
import { ADMIN_CAPABILITIES } from "@/lib/admin/capabilities";

const ADMIN_ROLES: AdminRole[] = ["OWNER", "ADMIN", "SUPPORT", "ANALYST", "MODERATOR"];

describe("admin capability map", () => {
  it("only maps known roles and never leaves a capability unreachable", () => {
    for (const [capability, roles] of Object.entries(ADMIN_CAPABILITIES)) {
      assert.ok(roles.length > 0, `${capability} has no roles`);
      assert.ok(roles.includes("OWNER"), `${capability} locks out OWNER`);

      for (const role of roles) {
        assert.ok(ADMIN_ROLES.includes(role), `${capability} maps unknown role ${role}`);
      }

      assert.equal(new Set(roles).size, roles.length, `${capability} repeats a role`);
    }
  });

  it("keeps ANALYST out of the sensitive capabilities", () => {
    const sensitive = [
      "audit.read",
      "campaign.approve",
      "case.action",
      "case.read",
      "campaign.create",
      "campaign.read",
      "campaign.send",
      "export.activity",
      "flag.write",
      "user.ban",
      "user.read",
    ] as const;

    for (const capability of sensitive) {
      const roles: readonly AdminRole[] = ADMIN_CAPABILITIES[capability];

      assert.ok(!roles.includes("ANALYST"), `${capability} still exposes ANALYST`);
    }
  });

  it("mirrors the feedback role constants that already shipped", () => {
    assert.deepEqual(ADMIN_CAPABILITIES["feedback.read"], [
      "OWNER",
      "ADMIN",
      "SUPPORT",
      "ANALYST",
      "MODERATOR",
    ]);
    assert.deepEqual(ADMIN_CAPABILITIES["feedback.write"], ["OWNER", "ADMIN", "SUPPORT"]);
  });

  it("routes every capability through requireAdminUser instead of re-implementing role checks", () => {
    const source = readFileSync(new URL("./capabilities.ts", import.meta.url), "utf8");

    assert.match(
      source,
      /requireAdminUser\(\{ roles: \[\.\.\.ADMIN_CAPABILITIES\[capability\]\] \}\)/u,
    );
  });
});
