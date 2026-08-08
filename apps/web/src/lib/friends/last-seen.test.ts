import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { prisma } from "@wizards/db";

import { resolveLastSeenAtByUserId } from "./last-seen";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type Restore = () => void;

async function readDirectorySources(root: string): Promise<Array<[string, string]>> {
  const entries = await readdir(root, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry): Promise<Array<[string, string]>> => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return readDirectorySources(entryPath);
      }

      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        return [];
      }

      return [[entryPath, await readFile(entryPath, "utf8")]];
    }),
  );

  return sources.flat();
}

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

describe("last-seen resolution", () => {
  it("reads the newest session per user and skips users no session ever covered", async () => {
    const restores: Restore[] = [];
    let capturedArgs: unknown;

    patchMethod(
      prisma.appSession,
      "groupBy",
      async (args: unknown) => {
        capturedArgs = args;
        return [
          { _max: { lastSeenAt: new Date("2026-08-07T09:30:00.000Z") }, userId: "seen-user" },
          { _max: { lastSeenAt: null }, userId: "never-seen-user" },
        ];
      },
      restores,
    );

    try {
      const result = await resolveLastSeenAtByUserId(["seen-user", "never-seen-user", "absent"]);

      assert.deepEqual(capturedArgs, {
        by: ["userId"],
        where: { userId: { in: ["seen-user", "never-seen-user", "absent"] } },
        _max: { lastSeenAt: true },
      });
      assert.equal(result.get("seen-user"), "2026-08-07T09:30:00.000Z");
      assert.equal(result.has("never-seen-user"), false);
      assert.equal(result.has("absent"), false);
    } finally {
      for (const restore of restores) restore();
    }
  });

  it("short-circuits an empty request instead of querying", async () => {
    const restores: Restore[] = [];
    let called = false;

    patchMethod(
      prisma.appSession,
      "groupBy",
      async () => {
        called = true;
        return [];
      },
      restores,
    );

    try {
      const result = await resolveLastSeenAtByUserId([]);

      assert.equal(called, false);
      assert.equal(result.size, 0);
    } finally {
      for (const restore of restores) restore();
    }
  });

  it("gates every last-seen surface on the invisible set", async () => {
    // Görünmez publishes OFFLINE without closing the socket, so the session
    // heartbeat keeps `AppSession.lastSeenAt` moving. Any surface that renders
    // last-seen has to drop the hidden users or it hands back the exact fact the
    // mode exists to hide. Discovered by scan, so a new surface joins this rule
    // instead of quietly opting out of it.
    const libRoot = path.join(sourceRoot, "lib");
    const sources = await readDirectorySources(libRoot);
    const consumers = sources.filter(
      ([filePath, source]) =>
        !filePath.endsWith(`${path.sep}last-seen.ts`) &&
        !filePath.endsWith(".test.ts") &&
        source.includes("resolveLastSeenAtByUserId("),
    );

    assert.ok(
      consumers.length >= 3,
      `expected the known last-seen surfaces, saw ${consumers.length}`,
    );
    for (const [filePath, source] of consumers) {
      const relative = path.relative(libRoot, filePath);
      assert.match(source, /readPresenceState\(/, `${relative} must read the invisible set`);
      assert.match(source, /hiddenUserIds/, `${relative} must gate last-seen on it`);
    }
  });

  it("keeps the DM list on one last-seen read per page, not one per conversation", async () => {
    // `mapDMConversationDTO` resolves last-seen itself when nothing hands it a
    // map, which is right for a single conversation and an N+1 for a page. The
    // list path must therefore resolve once and pass the map down.
    const source = await readFile(path.join(sourceRoot, "lib", "dm", "service.ts"), "utf8");
    const listBody = source.slice(
      source.indexOf("export async function listDirectMessages"),
      source.indexOf("export async function getDirectMessageUnreadCount"),
    );

    assert.ok(listBody.length > 0);
    assert.match(listBody, /resolveLastSeenAtByUserId\(/);
    assert.match(listBody, /mapDMConversationDTO\([\s\S]*?lastSeenByUserId,/);
  });
});
