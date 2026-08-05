import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ApiError, jsonError } from "@/lib/api";
import type { AdminCapability } from "@/lib/admin/capabilities";

const adminApiRoot = dirname(fileURLToPath(import.meta.url));
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";
const accessModule = import("@/lib/admin/access");
const capabilitiesModule = import("@/lib/admin/capabilities");

/**
 * The routes that shipped without a role filter — `ANALYST` reached the raw
 * email list and the whole activity export through them — plus the campaign
 * approval gate, pinned to the capability each one must use.
 */
const ROUTE_CAPABILITY_PINS: ReadonlyArray<{ capability: AdminCapability; file: string }> = [
  { capability: "user.read", file: "users/route.ts" },
  { capability: "badge.read", file: "users/[userId]/badges/route.ts" },
  { capability: "badge.write", file: "users/[userId]/badges/route.ts" },
  { capability: "server.read", file: "servers/route.ts" },
  { capability: "export.activity", file: "reports/activity.csv/route.ts" },
  { capability: "campaign.read", file: "notification-campaigns/route.ts" },
  { capability: "campaign.approve", file: "notification-campaigns/[campaignId]/approve/route.ts" },
  { capability: "campaign.send", file: "notification-campaigns/[campaignId]/send/route.ts" },
  { capability: "feedback.write", file: "feedback/clusters/[suggestionId]/route.ts" },
  { capability: "flag.write", file: "flags/route.ts" },
  { capability: "flag.write", file: "flags/[key]/route.ts" },
  { capability: "case.read", file: "moderation/cases/route.ts" },
  { capability: "case.read", file: "moderation/cases/[caseId]/route.ts" },
  { capability: "case.action", file: "moderation/cases/[caseId]/claim/route.ts" },
  { capability: "case.action", file: "moderation/cases/[caseId]/action/route.ts" },
  {
    capability: "case.action",
    file: "moderation/cases/[caseId]/evidence/[evidenceId]/route.ts",
  },
  { capability: "release.read", file: "releases/route-logic.ts" },
  { capability: "release.write", file: "releases/route-logic.ts" },
  { capability: "release.read", file: "releases/[releaseId]/route-logic.ts" },
  { capability: "release.write", file: "releases/[releaseId]/route-logic.ts" },
  { capability: "release.write", file: "releases/[releaseId]/publish/route-logic.ts" },
  { capability: "release.write", file: "releases/[releaseId]/changes/route-logic.ts" },
  { capability: "help.write", file: "help/articles/route-logic.ts" },
  { capability: "help.write", file: "help/articles/[articleId]/route-logic.ts" },
  { capability: "support.read", file: "support/reports/route-logic.ts" },
  { capability: "support.read", file: "support/reports/[reportId]/route-logic.ts" },
];

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return collectRouteFiles(path);
    }

    return entry === "route.ts" ? [path] : [];
  });
}

function readWithLocalLogic(routeFile: string, seen = new Set<string>()): string {
  if (seen.has(routeFile)) {
    return "";
  }

  seen.add(routeFile);
  const source = readFileSync(routeFile, "utf8");
  const localImports = [...source.matchAll(/from "(\.[^"]*)"/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

  return localImports.reduce((combined, specifier) => {
    const resolved = join(dirname(routeFile), `${specifier}.ts`);

    try {
      return `${combined}\n${readWithLocalLogic(resolved, seen)}`;
    } catch {
      return combined;
    }
  }, source);
}

describe("admin API capability coverage", () => {
  it("guards every admin route handler with a capability", () => {
    const routeFiles = collectRouteFiles(adminApiRoot);

    assert.ok(routeFiles.length >= 10, "admin route scan found suspiciously few handlers");

    for (const routeFile of routeFiles) {
      assert.match(
        readWithLocalLogic(routeFile),
        /requireAdminCapability\(/u,
        `${routeFile} authorizes without a capability`,
      );
    }
  });

  it("never authorizes an admin route through a bare requireAdminUser call", () => {
    for (const routeFile of collectRouteFiles(adminApiRoot)) {
      assert.doesNotMatch(
        readWithLocalLogic(routeFile),
        /requireAdminUser\(/u,
        `${routeFile} still calls requireAdminUser directly`,
      );
    }
  });

  it("pins the previously unfiltered routes to their capability", () => {
    for (const { capability, file } of ROUTE_CAPABILITY_PINS) {
      const source = readFileSync(join(adminApiRoot, file), "utf8");

      assert.match(
        source,
        new RegExp(`requireAdminCapability\\("${capability.replace(".", "\\.")}"\\)`, "u"),
        `${file} must authorize with ${capability}`,
      );
    }
  });
});

describe("admin capability authorization", () => {
  it("answers ANALYST with the shared 403 envelope on the leaked capabilities", async () => {
    const [{ ensureAdminRoleAllowed }, { ADMIN_CAPABILITIES }] = await Promise.all([
      accessModule,
      capabilitiesModule,
    ]);

    for (const capability of [
      "user.read",
      "export.activity",
      "campaign.read",
      "campaign.approve",
      "campaign.send",
    ] as const) {
      let thrown: unknown;

      try {
        ensureAdminRoleAllowed("ANALYST", [...ADMIN_CAPABILITIES[capability]]);
      } catch (error) {
        thrown = error;
      }

      assert.ok(thrown instanceof ApiError, `${capability} let ANALYST through`);
      assert.equal(thrown.status, 403);

      const response = jsonError(thrown);
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        code: "ADMIN_ACCESS_REQUIRED",
        error: "Admin access required",
      });
    }
  });

  it("still admits the roles the capability grants", async () => {
    const [{ ensureAdminRoleAllowed }, { ADMIN_CAPABILITIES }] = await Promise.all([
      accessModule,
      capabilitiesModule,
    ]);

    assert.equal(
      ensureAdminRoleAllowed("SUPPORT", [...ADMIN_CAPABILITIES["user.read"]]),
      "SUPPORT",
    );
    assert.equal(
      ensureAdminRoleAllowed("OWNER", [...ADMIN_CAPABILITIES["export.activity"]]),
      "OWNER",
    );
  });

  it("rejects a missing admin membership before it can reach a capability", async () => {
    const [{ ensureAdminRoleAllowed }, { ADMIN_CAPABILITIES }] = await Promise.all([
      accessModule,
      capabilitiesModule,
    ]);

    assert.throws(
      () => ensureAdminRoleAllowed(null, [...ADMIN_CAPABILITIES["dashboard.read"]]),
      ApiError,
    );
  });
});
