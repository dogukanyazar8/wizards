import assert from "node:assert/strict";
import { it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { appUpdateQueryOptions, hasActiveUpdateCall } from "./app-update-query";
import { nativeSettingsClient } from "./desktop/settings-client";
import { WHISPR_BUILD_ID } from "./app-version";

it("shares a native check across settings surfaces and preserves the fresh result", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  const check = t.mock.method(nativeSettingsClient, "check", async () => ({
    enabled: true,
    available: true,
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
  }));
  const install = t.mock.method(nativeSettingsClient, "install", async () => {});
  const options = appUpdateQueryOptions(true);
  const [about, desktop] = await Promise.all([
    client.fetchQuery(options),
    client.fetchQuery(options),
  ]);
  assert.deepEqual(about, desktop);
  assert.equal(about.available, true);
  assert.equal(about.latestVersion, "1.1.0");
  assert.ok(about.checkedAt > 0);
  assert.deepEqual(await client.fetchQuery(options), about);
  assert.equal(check.mock.callCount(), 1);
  assert.equal(install.mock.callCount(), 0);
});

it("keeps the last successful version after a failed check without claiming success", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  t.mock.method(nativeSettingsClient, "check", async () => ({
    enabled: true,
    available: false,
    currentVersion: "1.0.0",
    latestVersion: null,
  }));
  const options = appUpdateQueryOptions(true);
  const previous = await client.fetchQuery(options);
  t.mock.method(nativeSettingsClient, "check", async () => {
    throw new Error("offline");
  });
  await assert.rejects(client.fetchQuery({ ...options, staleTime: 0 }), /offline/);
  assert.deepEqual(client.getQueryData(options.queryKey), previous);
  assert.equal(client.getQueryState(options.queryKey)?.status, "error");
});

it("detects web updates by build ID even when the version number is unchanged", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  let buildId = WHISPR_BUILD_ID;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ buildId, version: "1.0.0", notes: [] }),
  );
  const options = { ...appUpdateQueryOptions(false), staleTime: 0 };
  assert.equal((await client.fetchQuery(options)).available, false);
  buildId = `${WHISPR_BUILD_ID}-next`;
  assert.equal((await client.fetchQuery(options)).available, true);
});

it("rejects failed and malformed web responses", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  t.mock.method(globalThis, "fetch", async () => new Response("offline", { status: 503 }));
  await assert.rejects(client.fetchQuery(appUpdateQueryOptions(false)), /Unable to check/);
  t.mock.method(globalThis, "fetch", async () => Response.json({ version: "1" }));
  await assert.rejects(client.fetchQuery(appUpdateQueryOptions(false)), /Invalid Whispr/);
});

it("protects both server voice sessions and direct calls", () => {
  assert.equal(hasActiveUpdateCall({ activeChannelId: null, activeConversationId: null }), false);
  assert.equal(hasActiveUpdateCall({ activeChannelId: "voice", activeConversationId: null }), true);
  assert.equal(hasActiveUpdateCall({ activeChannelId: null, activeConversationId: "dm" }), true);
});
