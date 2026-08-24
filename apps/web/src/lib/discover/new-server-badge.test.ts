import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNewServer, markServerSeen, readSeenServers } from "./new-server-badge";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

function installStorage(context: { after(callback: () => void): void }, initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set("wizards.discover.seenServers.v1", initial);
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  context.after(() => Reflect.deleteProperty(globalThis, "localStorage"));
  return values;
}

describe("new server badge", () => {
  it("expires at 24 hours", () => {
    assert.equal(
      isNewServer("server-1", new Date(NOW - (24 * 60 - 1) * 60_000).toISOString(), NOW, new Set()),
      true,
    );
    assert.equal(
      isNewServer("server-1", new Date(NOW - (24 * 60 + 1) * 60_000).toISOString(), NOW, new Set()),
      false,
    );
  });

  it("is no longer new immediately after the server was visited", () => {
    assert.equal(
      isNewServer("server-1", new Date(NOW - 60_000).toISOString(), NOW, new Set(["server-1"])),
      false,
    );
  });

  it("treats corrupted localStorage as an empty set", (context) => {
    installStorage(context, "not-json");

    assert.deepEqual([...readSeenServers()], []);
  });

  it("keeps only the 200 most recently visited servers", (context) => {
    installStorage(context);

    for (let index = 0; index < 201; index += 1) {
      markServerSeen(`server-${index}`);
    }

    const seen = readSeenServers();
    assert.equal(seen.size, 200);
    assert.equal(seen.has("server-0"), false);
    assert.equal(seen.has("server-200"), true);
  });
});
