import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("mobile server management mutations", () => {
  it("selects newly created or joined servers without waiting for invalidation refetches", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "query", "use-mobile-server-management-mutations.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /onSuccess:\s*async/);
    assert.match(source, /void invalidateServer\(response\.server\.id\)\.catch\(\(\) => undefined\)/);
  });
});
