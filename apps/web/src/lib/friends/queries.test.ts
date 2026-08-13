import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { friendPageQuery } from "@/lib/friends/queries";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("friends query pagination", () => {
  it("uses a bounded keyset cursor for every friend list", () => {
    assert.deepEqual(friendPageQuery({ cursor: "request-9", limit: 500 }), {
      cursor: { id: "request-9" },
      skip: 1,
      take: 100,
    });
    assert.deepEqual(friendPageQuery({ limit: Number.NaN }), { take: 100 });
  });

  it("does not override the bounded take at individual query sites", async () => {
    const source = await readFile(path.join(sourceRoot, "lib", "friends", "queries.ts"), "utf8");

    assert.equal(source.match(/\btake:/g)?.length ?? 0, 0);
  });
});

describe("friends read route import boundaries", () => {
  it("keeps read-only friends routes on the lightweight query module", async () => {
    const routePaths = [
      path.join(sourceRoot, "app", "api", "v1", "friends", "route.ts"),
      path.join(sourceRoot, "app", "api", "v1", "friends", "pending", "route.ts"),
      path.join(sourceRoot, "app", "api", "v1", "friends", "blocked", "route.ts"),
    ];

    const routeSources = await Promise.all(
      routePaths.map((routePath) => readFile(routePath, "utf8")),
    );

    for (const source of routeSources) {
      assert.match(source, /@\/lib\/friends\/queries/);
      assert.doesNotMatch(source, /@\/lib\/friends\/service/);
    }
  });
});
