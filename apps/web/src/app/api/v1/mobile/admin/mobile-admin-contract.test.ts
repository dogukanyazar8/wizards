import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const mobileAdminRoot = dirname(fileURLToPath(import.meta.url));

function collectRoutes(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return collectRoutes(path);
    }

    return entry === "route.ts" ? [path] : [];
  });
}

/**
 * The mobile surface is triage only. Banning an account and deleting a message
 * are desktop decisions, so those endpoints must not exist here at all — a
 * hidden button is not a boundary, a missing route is.
 */
const ALLOWED_ROUTES = [
  "cases/[caseId]/claim/route.ts",
  "cases/[caseId]/dismiss/route.ts",
  "cases/[caseId]/escalate/route.ts",
  "cases/[caseId]/route.ts",
  "cases/route.ts",
];

describe("mobile admin surface", () => {
  it("exposes only the triage endpoints", () => {
    const routes = collectRoutes(mobileAdminRoot)
      .map((route) => relative(mobileAdminRoot, route).split("\\").join("/"))
      .sort();

    assert.deepEqual(routes, ALLOWED_ROUTES);
  });

  it("guards every mobile admin route with the shared capability map", () => {
    for (const route of collectRoutes(mobileAdminRoot)) {
      const source = readFileSync(route, "utf8");

      assert.match(
        source,
        /requireMobileAdminCapability\(request, "case\.(action|read)"\)/u,
        `${route} authorizes without the capability map`,
      );
      // Ban and message deletion never reach the phone.
      assert.doesNotMatch(source, /setAdminUserBanState|deleteEvidenceMessage/u);
    }
  });
});
