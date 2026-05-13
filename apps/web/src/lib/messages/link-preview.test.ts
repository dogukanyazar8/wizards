import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import { assertPublicHttpUrl, createPublicLookup } from "./link-preview";

describe("link preview SSRF guard", () => {
  it("allows public hostnames after DNS validation", async () => {
    const target = await assertPublicHttpUrl("https://example.test/path#fragment", async () => [
      { address: "93.184.216.34", family: 4 },
    ]);

    assert.equal(target.url.toString(), "https://example.test/path");
  });

  it("blocks hostnames that resolve to private addresses", async () => {
    await assert.rejects(
      assertPublicHttpUrl("http://internal.test/", async () => [
        { address: "127.0.0.1", family: 4 },
      ]),
      (error) =>
        error instanceof ApiError &&
        error.status === 400 &&
        error.code === "BLOCKED_URL",
    );
  });

  it("revalidates DNS at socket lookup time to prevent rebinding", async () => {
    let lookupCount = 0;
    const resolveHost = async () => {
      lookupCount += 1;
      return lookupCount === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    };

    await assertPublicHttpUrl("http://rebind.test/", resolveHost);
    const publicLookup = createPublicLookup(resolveHost);

    await new Promise<void>((resolve, reject) => {
      publicLookup("rebind.test", {}, (error) => {
        try {
          assert.equal(lookupCount, 2);
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 400);
          assert.equal(error.code, "BLOCKED_URL");
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      });
    });
  });
});
