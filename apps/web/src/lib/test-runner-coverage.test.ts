import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// @ts-expect-error -- plain ESM helper shared with the test runner script.
import { escapeTestGlobPath } from "../../scripts/test-glob-path.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = join(webRoot, "src");

function collectTestFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return collectTestFiles(path);
    }
    return entry.endsWith(".test.ts") || entry.endsWith(".test.tsx") ? [path] : [];
  });
}

/**
 * `node --test` globs its positional arguments, so an App Router path like
 * `.../servers/[serverId]/route-logic.test.ts` silently matched nothing and
 * every suite under a dynamic segment was collected but never executed. This
 * pins the escaping that fixes it, because the failure mode is invisible: the
 * run stays green while whole files go unexecuted.
 */
describe("web test runner path handling", () => {
  it("escapes dynamic-segment brackets into literal glob classes", () => {
    assert.equal(escapeTestGlobPath("a/[code]/b.test.ts"), "a/[[]code[]]/b.test.ts");
    assert.equal(
      escapeTestGlobPath("api/[serverId]/invites/[inviteId]/qr.test.ts"),
      "api/[[]serverId[]]/invites/[[]inviteId[]]/qr.test.ts",
    );
  });

  it("leaves a path without dynamic segments untouched", () => {
    assert.equal(
      escapeTestGlobPath("src/lib/friends/service.test.ts"),
      "src/lib/friends/service.test.ts",
    );
  });

  it("keeps every dynamic-segment suite reachable by the runner", () => {
    const bracketSuites = collectTestFiles(srcRoot)
      .map((path) => relative(webRoot, path).split(sep).join("/"))
      .filter((path) => path.includes("["));

    assert.ok(
      bracketSuites.length > 0,
      "expected dynamic-segment suites to exist; if they moved, this guard needs a new anchor",
    );

    for (const suite of bracketSuites) {
      const escaped = escapeTestGlobPath(suite);
      assert.equal(escaped.includes("[[]"), true, `${suite} would still be read as a glob class`);
      assert.equal(
        escaped.replaceAll("[[]", "[").replaceAll("[]]", "]"),
        suite,
        `${suite} must survive escaping unchanged`,
      );
    }
  });
});
