import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("friends read route import boundaries", () => {
  it("keeps read-only friends routes on the lightweight query module", async () => {
    const routePaths = [
      path.join(sourceRoot, "app", "api", "v1", "friends", "route.ts"),
      path.join(sourceRoot, "app", "api", "v1", "friends", "pending", "route.ts"),
      path.join(sourceRoot, "app", "api", "v1", "friends", "blocked", "route.ts"),
    ];

    const routeSources = await Promise.all(routePaths.map((routePath) => readFile(routePath, "utf8")));

    for (const source of routeSources) {
      assert.match(source, /@\/lib\/friends\/queries/);
      assert.doesNotMatch(source, /@\/lib\/friends\/service/);
    }
  });
});
