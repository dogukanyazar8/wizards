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
      (error) => error instanceof ApiError && error.status === 400 && error.code === "BLOCKED_URL",
    );
  });

  it("blocks IPv4-mapped IPv6 addresses that resolve to private IPv4 ranges", async () => {
    const blockedMappedAddresses = [
      "::ffff:0.1.2.3",
      "::ffff:10.0.0.1",
      "::ffff:100.64.0.1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:172.16.0.1",
      "::ffff:172.31.255.255",
      "::ffff:192.168.1.1",
      "::ffff:a9fe:a9fe",
      "0:0:0:0:0:ffff:169.254.169.254",
      "0:0:0:0::ffff:169.254.169.254",
    ];

    for (const address of blockedMappedAddresses) {
      await assert.rejects(
        assertPublicHttpUrl("http://internal.test/", async () => [{ address, family: 6 }]),
        (error) =>
          error instanceof ApiError && error.status === 400 && error.code === "BLOCKED_URL",
      );
    }
  });

  it("allows IPv4-mapped IPv6 addresses that resolve to public IPv4 ranges", async () => {
    const target = await assertPublicHttpUrl("https://example.test/", async () => [
      { address: "::ffff:93.184.216.34", family: 6 },
    ]);

    assert.equal(target.addresses[0]?.address, "::ffff:93.184.216.34");
  });

  it("revalidates IPv4-mapped IPv6 addresses at socket lookup time", async () => {
    const publicLookup = createPublicLookup(async () => [
      { address: "::ffff:169.254.169.254", family: 6 },
    ]);

    await new Promise<void>((resolve, reject) => {
      publicLookup("rebind.test", {}, (error) => {
        try {
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
