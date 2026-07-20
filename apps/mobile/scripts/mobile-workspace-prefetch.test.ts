import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_WORKSPACE_PREFETCH_SERVER_LIMIT,
  getMobileWorkspacePrefetchChannelId,
  selectMobileWorkspacePrefetchServerIds,
} from "../src/query/mobile-workspace-prefetch";

const recent = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

test("prefetch warms the servers next to the selected one, never the selected one", () => {
  const ids = selectMobileWorkspacePrefetchServerIds({ recent, selectedServerId: "c" });

  assert.deepEqual(ids, ["d", "e"]);
  assert.equal(ids.includes("c"), false);
  assert.equal(ids.length, MOBILE_WORKSPACE_PREFETCH_SERVER_LIMIT);
});

test("prefetch wraps backwards when the selected server is last", () => {
  assert.deepEqual(selectMobileWorkspacePrefetchServerIds({ recent, selectedServerId: "e" }), [
    "d",
    "c",
  ]);
});

test("prefetch falls back to the most recent servers when nothing is selected", () => {
  assert.deepEqual(selectMobileWorkspacePrefetchServerIds({ recent, selectedServerId: null }), [
    "a",
    "b",
  ]);
  assert.deepEqual(
    selectMobileWorkspacePrefetchServerIds({ recent, selectedServerId: "unknown-server" }),
    ["a", "b"],
  );
});

test("prefetch stays bounded and tolerates an empty or single-server list", () => {
  assert.deepEqual(
    selectMobileWorkspacePrefetchServerIds({ recent: [], selectedServerId: "a" }),
    [],
  );
  assert.deepEqual(
    selectMobileWorkspacePrefetchServerIds({ recent: [{ id: "a" }], selectedServerId: "a" }),
    [],
  );
  assert.deepEqual(
    selectMobileWorkspacePrefetchServerIds({ limit: 0, recent, selectedServerId: "a" }),
    [],
  );
  assert.equal(
    selectMobileWorkspacePrefetchServerIds({ limit: 99, recent, selectedServerId: "a" }).length,
    4,
  );
});

test("default channel prefetch target comes from the resolved server detail", () => {
  assert.equal(getMobileWorkspacePrefetchChannelId(undefined), null);
  assert.equal(
    getMobileWorkspacePrefetchChannelId({
      detail: { server: { defaultChannelId: null } },
    } as never),
    null,
  );
  assert.equal(
    getMobileWorkspacePrefetchChannelId({
      detail: { server: { defaultChannelId: "channel-1" } },
    } as never),
    "channel-1",
  );
});
