import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  listMobileHelpArticles,
  type MobileHelpServiceDependencies,
} from "@/lib/help/help-service";
import { logError } from "@/lib/logger";

const routes = import("./route-logic");

type Row = {
  bodyMarkdown: string | null;
  category: "ACCOUNT" | "CHAT" | "MEDIA" | "SERVER";
  id: string;
  position: number;
  publishedAt: Date | null;
  readMinutes: number;
  slug: string;
  title: string;
  url: string;
  viewCount: number;
};

const published = new Date("2026-07-01T00:00:00.000Z");

const catalogue: Row[] = [
  {
    bodyMarkdown: "# Mikrofon",
    category: "MEDIA",
    id: "help-1",
    position: 0,
    publishedAt: published,
    readMinutes: 3,
    slug: "mikrofon-calismiyor",
    title: "Sesli kanalda mikrofonum çalışmıyor",
    url: "https://whispr.team/help/mikrofon-calismiyor",
    viewCount: 24_000,
  },
  {
    bodyMarkdown: null,
    category: "CHAT",
    id: "help-2",
    position: 1,
    publishedAt: published,
    readMinutes: 2,
    slug: "kanal-sessize-alma",
    title: "Bildirimleri kanal kanal sessize alma",
    url: "https://whispr.team/help/kanal-sessize-alma",
    viewCount: 18_000,
  },
  {
    bodyMarkdown: "# Roller",
    category: "SERVER",
    id: "help-3",
    position: 2,
    publishedAt: published,
    readMinutes: 5,
    slug: "rolleri-duzenleme",
    title: "Sunucu rollerini ve izinleri düzenleme",
    url: "https://whispr.team/help/rolleri-duzenleme",
    viewCount: 11_000,
  },
  {
    bodyMarkdown: "# 2FA",
    category: "ACCOUNT",
    id: "help-4",
    position: 3,
    publishedAt: published,
    readMinutes: 4,
    slug: "iki-adimli-dogrulama",
    title: "İki adımlı doğrulamayı açma",
    url: "https://whispr.team/help/iki-adimli-dogrulama",
    viewCount: 9_000,
  },
  {
    bodyMarkdown: null,
    category: "CHAT",
    id: "help-draft",
    position: 4,
    publishedAt: null,
    readMinutes: 1,
    slug: "taslak",
    title: "Yayınlanmamış makale",
    url: "https://whispr.team/help/taslak",
    viewCount: 99_999,
  },
];

function table(rows: Row[] = catalogue): MobileHelpServiceDependencies {
  const live = () => rows.filter((row) => row.publishedAt !== null);

  return {
    countByCategory: async () => {
      const counts = new Map<Row["category"], number>();
      for (const row of live()) {
        counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
      }
      return [...counts].map(([category, count]) => ({ _count: count, category }));
    },
    findArticles: async (args) => {
      const where = args.where as { category?: Row["category"] } | undefined;
      const filtered = live().filter((row) => !where?.category || row.category === where.category);
      const byViews = Array.isArray(args.orderBy) && "viewCount" in (args.orderBy[0] ?? {});
      const sorted = filtered.sort((left, right) =>
        byViews ? right.viewCount - left.viewCount : left.position - right.position,
      );

      return sorted.slice(0, args.take ?? sorted.length) as never;
    },
    incrementViewCount: async () => undefined,
    logError,
  };
}

function request(url = "https://whispr.test/api/v1/mobile/help/articles") {
  return new Request(url, { method: "GET" });
}

function dependencies(
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileHelpArticleListRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    listArticles: (input) => listMobileHelpArticles(input, table()),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileHelpArticleListRoute"]>[1];
}

describe("mobile help article list route", () => {
  it("returns the four most-read articles for the popular block", async () => {
    const { mobileHelpArticleListRoute } = await routes;
    const response = await mobileHelpArticleListRoute(
      request("https://whispr.test/api/v1/mobile/help/articles?popular=1"),
      dependencies(),
    );
    const payload = (await response.json()) as { articles: Array<{ views: number }> };

    assert.equal(response.status, 200);
    assert.equal(payload.articles.length, 4);
    assert.deepEqual(
      payload.articles.map((article) => article.views),
      [24_000, 18_000, 11_000, 9_000],
    );
  });

  it("counts every category tile even when a single category was asked for", async () => {
    const { mobileHelpArticleListRoute } = await routes;
    const response = await mobileHelpArticleListRoute(
      request("https://whispr.test/api/v1/mobile/help/articles?category=chat"),
      dependencies(),
    );
    const payload = (await response.json()) as {
      articles: Array<{ category: string }>;
      categories: Array<{ articleCount: number; key: string }>;
    };

    assert.deepEqual(
      payload.articles.map((article) => article.category),
      ["chat"],
    );
    // Filtering the list must not blank the grid behind it.
    assert.deepEqual(payload.categories, [
      { articleCount: 1, key: "account" },
      { articleCount: 1, key: "chat" },
      { articleCount: 1, key: "media" },
      { articleCount: 1, key: "server" },
    ]);
  });

  it("keeps an unpublished article out of both the list and the counts", async () => {
    const { mobileHelpArticleListRoute } = await routes;
    const response = await mobileHelpArticleListRoute(request(), dependencies());
    const payload = (await response.json()) as {
      articles: Array<{ slug: string }>;
      categories: Array<{ articleCount: number; key: string }>;
    };

    assert.equal(
      payload.articles.some((article) => article.slug === "taslak"),
      false,
    );
    assert.equal(payload.categories.find((entry) => entry.key === "chat")?.articleCount, 1);
  });

  it("flags whether an article can be read in the app or has to open a browser", async () => {
    const { mobileHelpArticleListRoute } = await routes;
    const response = await mobileHelpArticleListRoute(
      request("https://whispr.test/api/v1/mobile/help/articles?popular=1"),
      dependencies(),
    );
    const payload = (await response.json()) as {
      articles: Array<{ bodyMarkdown: string | null; hasBody: boolean; slug: string }>;
    };

    assert.equal(payload.articles.find((a) => a.slug === "mikrofon-calismiyor")?.hasBody, true);
    assert.equal(
      payload.articles.find((a) => a.slug === "mikrofon-calismiyor")?.bodyMarkdown,
      "# Mikrofon",
    );
    assert.equal(payload.articles.find((a) => a.slug === "kanal-sessize-alma")?.hasBody, false);
    assert.equal(payload.articles.find((a) => a.slug === "kanal-sessize-alma")?.bodyMarkdown, null);
  });

  it("rejects a category that is not one of the four tiles", async () => {
    const { mobileHelpArticleListRoute } = await routes;
    const response = await mobileHelpArticleListRoute(
      request("https://whispr.test/api/v1/mobile/help/articles?category=billing"),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("requires a session and its own rate action", async () => {
    const { mobileHelpArticleListRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileHelpArticleListRoute(
      request(),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:help:list"]);

    const unauthenticated = await mobileHelpArticleListRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
