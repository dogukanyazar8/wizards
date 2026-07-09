import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const API_V1_DIR = fileURLToPath(new URL(".", import.meta.url));

const UNAUTHENTICATED_ROUTE_PATHS = new Set([
  "app/version",
  "desktop/download",
  "mobile/auth/exchange",
  "mobile/auth/forgot-password",
  "mobile/auth/login",
  "mobile/auth/refresh",
  "mobile/auth/register",
  "mobile/auth/revoke",
  "mobile/auth/verification-email",
]);

const BODYLESS_MUTATING_ROUTE_PATHS = new Set([
  "admin/notification-campaigns/[campaignId]/send",
  "auth/desktop-session",
  "channels/[channelId]/messages",
  "channels/[channelId]/messages/[messageId]/pin",
  "channels/[channelId]/read",
  "dm/[conversationId]",
  "dm/[conversationId]/read",
  "dm/[conversationId]/unread",
  "friends/[userId]",
  "friends/block/[userId]",
  "notifications/[id]/read",
  "notifications/clear",
  "notifications/read-all",
  "servers/[serverId]/invites/[inviteId]",
  "servers/[serverId]/members/[memberId]",
  "servers/[serverId]/members/me",
]);

const AUTH_GUARD_CALL_PATTERN =
  /\b(?:requireApiUserId|requireMobileApiUserId|requireMobileApiSession|requireAdminUser)\s*\(/;
const EXPORTED_METHOD_PATTERN =
  /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b|export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const PARSE_JSON_BODY_CALL_PATTERN = /\bparseJsonBody\s*\(/;
const RAW_REQUEST_BODY_CALL_PATTERN = /\b(?:request|req)\.(?:json|text|formData)\s*\(/;
const RATE_LIMIT_CALL_PATTERN =
  /enforceApiRateLimit\s*\(\s*[^,]+,\s*"([^"]+)"\s*\)/g;

const EXPECTED_RATE_LIMIT_ACTIONS = [
  {
    action: "server:detail",
    method: "GET",
    routePath: "servers/[serverId]",
  },
  {
    action: "server:update",
    method: "PATCH",
    routePath: "servers/[serverId]",
  },
  {
    action: "server:delete",
    method: "DELETE",
    routePath: "servers/[serverId]",
  },
  {
    action: "mobile:message:search",
    method: "GET",
    routePath: "mobile/channels/[channelId]/messages/search",
  },
  {
    action: "mobile:message:search",
    method: "GET",
    routePath: "mobile/dm/[conversationId]/messages/search",
  },
] as const;

type RouteFile = {
  content: string;
  methods: string[];
  path: string;
  routePath: string;
};

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function routePathFor(filePath: string) {
  const routeDir = path.dirname(filePath);
  return path.relative(API_V1_DIR, routeDir).split(path.sep).join("/") || ".";
}

function exportedMethods(content: string) {
  return [...content.matchAll(EXPORTED_METHOD_PATTERN)]
    .map((match) => match[1] || match[2])
    .filter((method): method is string => Boolean(method));
}

function routeMethodBody(content: string, method: string) {
  const methodMatch = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`,
  ).exec(content);
  if (!methodMatch) {
    return "";
  }

  const rest = content.slice(methodMatch.index + methodMatch[0].length);
  const nextMethodMatch = EXPORTED_METHOD_PATTERN.exec(rest);
  EXPORTED_METHOD_PATTERN.lastIndex = 0;

  return nextMethodMatch ? rest.slice(0, nextMethodMatch.index) : rest;
}

function rateLimitActions(content: string) {
  return [...content.matchAll(RATE_LIMIT_CALL_PATTERN)].map((match) => match[1]);
}

function readRoutes(): RouteFile[] {
  return collectRouteFiles(API_V1_DIR)
    .map((filePath) => {
      const routeContent = readFileSync(filePath, "utf8");
      const logicPath = path.join(path.dirname(filePath), "route-logic.ts");
      const content = existsSync(logicPath)
        ? `${routeContent}\n${readFileSync(logicPath, "utf8")}`
        : routeContent;

      return {
        content,
        methods: exportedMethods(routeContent),
        path: path.relative(process.cwd(), filePath).split(path.sep).join("/"),
        routePath: routePathFor(filePath),
      };
    })
    .sort((a, b) => a.routePath.localeCompare(b.routePath));
}

function hasMutatingMethod(route: RouteFile) {
  return route.methods.some((method) => MUTATING_METHODS.has(method));
}

describe("API v1 route contract", () => {
  const routes = readRoutes();
  const routePaths = new Set(routes.map((route) => route.routePath));

  it("keeps the unauthenticated route allowlist explicit and minimal", () => {
    const unguardedRoutes = routes
      .filter((route) => !AUTH_GUARD_CALL_PATTERN.test(route.content))
      .map((route) => route.routePath);

    assert.deepEqual(unguardedRoutes, [...UNAUTHENTICATED_ROUTE_PATHS]);

    for (const routePath of UNAUTHENTICATED_ROUTE_PATHS) {
      assert.equal(
        routePaths.has(routePath),
        true,
        `Unauthenticated API route allowlist entry does not exist: ${routePath}`,
      );
    }
  });

  it("requires every authenticated route to call an auth guard", () => {
    const missingGuards = routes
      .filter((route) => !UNAUTHENTICATED_ROUTE_PATHS.has(route.routePath))
      .filter((route) => !AUTH_GUARD_CALL_PATTERN.test(route.content))
      .map((route) => route.path);

    assert.deepEqual(missingGuards, []);
  });

  it("requires mutating routes to either parse JSON centrally or be documented as bodyless", () => {
    const mutatingWithoutJsonParser = routes
      .filter(hasMutatingMethod)
      .filter((route) => !PARSE_JSON_BODY_CALL_PATTERN.test(route.content))
      .map((route) => route.routePath);

    assert.deepEqual(mutatingWithoutJsonParser, [...BODYLESS_MUTATING_ROUTE_PATHS]);

    for (const routePath of BODYLESS_MUTATING_ROUTE_PATHS) {
      assert.equal(
        routePaths.has(routePath),
        true,
        `Bodyless mutating API route allowlist entry does not exist: ${routePath}`,
      );
    }
  });

  it("does not bypass parseJsonBody with direct request body readers", () => {
    const rawBodyReaders = routes
      .filter((route) => RAW_REQUEST_BODY_CALL_PATTERN.test(route.content))
      .map((route) => route.path);

    assert.deepEqual(rawBodyReaders, []);
  });

  it("keeps high-risk route rate-limit actions mapped to the intended method", () => {
    for (const expected of EXPECTED_RATE_LIMIT_ACTIONS) {
      const route = routes.find((candidate) => candidate.routePath === expected.routePath);
      assert.ok(route, `Missing route for ${expected.routePath}`);

      const body = routeMethodBody(route.content, expected.method);
      assert.ok(body, `Missing ${expected.method} in ${expected.routePath}`);
      const actions = rateLimitActions(body);
      assert.deepEqual(actions.length > 0 ? actions : rateLimitActions(route.content), [
        expected.action,
      ]);
    }
  });
});
