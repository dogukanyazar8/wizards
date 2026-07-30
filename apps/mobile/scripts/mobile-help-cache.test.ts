import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { MobileHelpArticle } from "@wizards/types";

import {
  MOBILE_HELP_CACHE_KEY,
  cacheMobileHelpArticle,
  readCachedMobileHelpArticles,
  type MobileHelpCacheStorage,
} from "../src/about/mobile-help-cache";

function article(slug: string): MobileHelpArticle {
  return {
    bodyMarkdown: null,
    category: "chat",
    hasBody: true,
    id: `article-${slug}`,
    readMinutes: 3,
    slug,
    title: `Article ${slug}`,
    url: `https://whispr.chat/help/${slug}`,
    views: 1_000,
  };
}

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  const getItem = mock.fn(async () => value);
  const setItem = mock.fn(async (_key: string, next: string) => {
    value = next;
  });
  const storage: MobileHelpCacheStorage = { getItem, setItem };

  return { getItem, setItem, storage };
}

describe("mobile help article cache", () => {
  it("keeps the ten most recently opened unique slugs in newest-first order", async () => {
    const harness = createStorage();

    for (let index = 0; index < 11; index += 1) {
      await cacheMobileHelpArticle(
        { ...article(`slug-${index}`), bodyMarkdown: `# Body ${index}` },
        harness.storage,
      );
    }
    await cacheMobileHelpArticle(
      { ...article("slug-4"), bodyMarkdown: "# Updated body" },
      harness.storage,
    );

    const cached = await readCachedMobileHelpArticles(harness.storage);

    assert.equal(cached.length, 10);
    assert.deepEqual(
      cached.map((entry) => entry.slug),
      [
        "slug-4",
        "slug-10",
        "slug-9",
        "slug-8",
        "slug-7",
        "slug-6",
        "slug-5",
        "slug-3",
        "slug-2",
        "slug-1",
      ],
    );
    assert.equal(cached[0]?.bodyMarkdown, "# Updated body");
    assert.equal(
      cached.some((entry) => entry.slug === "slug-0"),
      false,
    );
    assert.deepEqual(harness.setItem.mock.calls.at(-1)?.arguments[0], MOBILE_HELP_CACHE_KEY);
  });

  it("treats malformed or unavailable storage as an empty cache", async () => {
    const malformed = createStorage('{"not":"an array"}');
    assert.deepEqual(await readCachedMobileHelpArticles(malformed.storage), []);

    const unavailable: MobileHelpCacheStorage = {
      getItem: async () => {
        throw new Error("storage unavailable");
      },
      setItem: async () => {
        throw new Error("storage unavailable");
      },
    };
    assert.deepEqual(await readCachedMobileHelpArticles(unavailable), []);
    await assert.doesNotReject(
      cacheMobileHelpArticle({ ...article("safe"), bodyMarkdown: "# Safe" }, unavailable),
    );
  });

  it("drops invalid persisted entries instead of trusting AsyncStorage JSON", async () => {
    const valid = {
      ...article("valid"),
      bodyMarkdown: "# Valid",
    };
    const harness = createStorage(
      JSON.stringify([
        valid,
        { ...valid, slug: "../invalid", url: "javascript:alert(1)" },
        { bodyMarkdown: "# Missing article fields" },
      ]),
    );

    const cached = await readCachedMobileHelpArticles(harness.storage);

    assert.deepEqual(
      cached.map((entry) => entry.slug),
      ["valid"],
    );
  });
});
