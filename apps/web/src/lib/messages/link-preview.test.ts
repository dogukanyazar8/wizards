import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  assertPublicHttpUrl,
  createPublicLookup,
  extractLinkPreviewMetadata,
} from "./link-preview";

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

describe("link preview metadata extraction", () => {
  it("extracts Open Graph metadata through an HTML parser", () => {
    const metadata = extractLinkPreviewMetadata(
      `
        <html>
          <head>
            <meta content="Parser Safe &amp; Sound" property="og:title">
            <meta name='description' content='A &lt;strong&gt;plain&lt;/strong&gt; preview'>
            <meta property="og:site_name" content="Example Site">
            <meta property="og:image" content="/card.png">
          </head>
        </html>
      `,
      new URL("https://example.test/posts/1"),
    );

    assert.deepEqual(metadata, {
      description: "A plain preview",
      imageUrl: "https://example.test/card.png",
      siteName: "Example Site",
      title: "Parser Safe & Sound",
    });
  });

  it("does not cache entity-encoded HTML payloads as executable markup", () => {
    const metadata = extractLinkPreviewMetadata(
      `
        <html>
          <head>
            <meta property="og:title" content="&lt;svg/onload=alert(1)&gt;Clean title">
            <meta name="description" content="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;Plain text">
          </head>
        </html>
      `,
      new URL("https://example.test/posts/2"),
    );

    assert.equal(metadata.title, "Clean title");
    assert.ok(metadata.description?.includes("Plain text"));
    assert.ok(!metadata.description?.includes("<img"));
    assert.ok(!metadata.description?.includes("onerror"));
  });

  it("sanitizes fallback title text before caching", () => {
    const metadata = extractLinkPreviewMetadata(
      `
        <html>
          <head>
            <title>News &lt;img src=x onerror=alert(1)&gt; Today</title>
          </head>
        </html>
      `,
      new URL("https://example.test/news"),
    );

    assert.equal(metadata.title, "News Today");
  });
});
