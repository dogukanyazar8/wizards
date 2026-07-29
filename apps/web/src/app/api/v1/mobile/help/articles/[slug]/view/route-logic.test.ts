import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  recordMobileHelpArticleView,
  type MobileHelpServiceDependencies,
} from "@/lib/help/help-service";

const routes = import("./route-logic");

function table(
  incrementViewCount: (slug: string) => Promise<unknown>,
  onLogError: (message: string) => void = () => undefined,
): MobileHelpServiceDependencies {
  return {
    countByCategory: async () => [],
    findArticles: async () => [],
    incrementViewCount,
    logError: (message: string) => onLogError(message),
  };
}

function request() {
  return new Request("https://whispr.test/api/v1/mobile/help/articles/mikrofon-calismiyor/view", {
    method: "POST",
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function dependencies(
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileHelpArticleViewRoute"]>[2] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    recordView: (slug: string) =>
      recordMobileHelpArticleView(
        slug,
        table(async () => undefined),
      ),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileHelpArticleViewRoute"]>[2];
}

describe("mobile help article view route", () => {
  it("counts the view for the slug in the path", async () => {
    const { mobileHelpArticleViewRoute } = await routes;
    const counted: string[] = [];
    const response = await mobileHelpArticleViewRoute(
      request(),
      context({ slug: "mikrofon-calismiyor" }),
      dependencies({
        recordView: (slug: string) =>
          recordMobileHelpArticleView(
            slug,
            table(async (target) => {
              counted.push(target);
            }),
          ),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(counted, ["mikrofon-calismiyor"]);
  });

  it("still answers ok when the counter write fails", async () => {
    const { mobileHelpArticleViewRoute } = await routes;
    const logged: string[] = [];
    const response = await mobileHelpArticleViewRoute(
      request(),
      context({ slug: "mikrofon-calismiyor" }),
      dependencies({
        recordView: (slug: string) =>
          recordMobileHelpArticleView(
            slug,
            table(
              async () => {
                throw new Error("row is gone");
              },
              (message) => logged.push(message),
            ),
          ),
      }),
    );

    // Losing one increment must not fail the navigation that triggered it.
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(logged.length, 1);
  });

  it("rejects an empty slug", async () => {
    const { mobileHelpArticleViewRoute } = await routes;
    const response = await mobileHelpArticleViewRoute(
      request(),
      context({ slug: "" }),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("requires a session and its own rate action", async () => {
    const { mobileHelpArticleViewRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileHelpArticleViewRoute(
      request(),
      context({ slug: "mikrofon-calismiyor" }),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:help:view"]);

    const unauthenticated = await mobileHelpArticleViewRoute(
      request(),
      context({ slug: "mikrofon-calismiyor" }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
