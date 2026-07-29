import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  searchMobileHelpArticles,
  type MobileHelpServiceDependencies,
} from "@/lib/help/help-service";
import { logError } from "@/lib/logger";

const routes = import("./route-logic");

const article = {
  bodyMarkdown: "# Mikrofon",
  category: "MEDIA" as const,
  id: "help-1",
  position: 0,
  readMinutes: 3,
  slug: "mikrofon-calismiyor",
  title: "Sesli kanalda mikrofonum çalışmıyor",
  url: "https://whispr.team/help/mikrofon-calismiyor",
  viewCount: 24_000,
};

function table(): MobileHelpServiceDependencies {
  return {
    countByCategory: async () => [{ _count: 1, category: "MEDIA" }],
    findArticles: async (args) => {
      const where = args.where as { title?: { contains: string; mode?: string } } | undefined;
      const needle = where?.title?.contains ?? "";
      // The real query is `mode: "insensitive"`; mirror that here so a search
      // the user types in lower case still matches a capitalised title.
      const matches = article.title
        .toLocaleLowerCase("tr")
        .includes(needle.toLocaleLowerCase("tr"));

      return (matches ? [article] : []) as never;
    },
    incrementViewCount: async () => undefined,
    logError,
  };
}

function request(query: string) {
  return new Request(`https://whispr.test/api/v1/mobile/help/search?${query}`, { method: "GET" });
}

function dependencies(
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileHelpSearchRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    searchArticles: (query: string) => searchMobileHelpArticles(query, table()),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileHelpSearchRoute"]>[1];
}

describe("mobile help search route", () => {
  it("matches a title regardless of case", async () => {
    const { mobileHelpSearchRoute } = await routes;
    const response = await mobileHelpSearchRoute(request("q=MİKROFON"), dependencies());
    const payload = (await response.json()) as { articles: Array<{ slug: string }> };

    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.articles.map((entry) => entry.slug),
      ["mikrofon-calismiyor"],
    );
  });

  it("answers 200 with an empty list when nothing matches", async () => {
    const { mobileHelpSearchRoute } = await routes;
    const response = await mobileHelpSearchRoute(request("q=bulunamaz"), dependencies());
    const payload = (await response.json()) as {
      articles: unknown[];
      categories: unknown[];
    };

    // 2e turns this into the "Bunu bulamadık — ekibe yaz" row, which it cannot
    // do if the request failed.
    assert.equal(response.status, 200);
    assert.deepEqual(payload.articles, []);
    assert.equal(payload.categories.length, 4);
  });

  it("refuses a query shorter than two characters", async () => {
    const { mobileHelpSearchRoute } = await routes;

    assert.equal((await mobileHelpSearchRoute(request("q=m"), dependencies())).status, 400);
    assert.equal((await mobileHelpSearchRoute(request("q=%20%20"), dependencies())).status, 400);
    assert.equal((await mobileHelpSearchRoute(request(""), dependencies())).status, 400);
  });

  it("requires a session and its own rate action", async () => {
    const { mobileHelpSearchRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileHelpSearchRoute(
      request("q=mikrofon"),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:help:search"]);

    const unauthenticated = await mobileHelpSearchRoute(
      request("q=mikrofon"),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
