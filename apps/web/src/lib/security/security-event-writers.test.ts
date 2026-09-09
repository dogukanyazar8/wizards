import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { SECURITY_EVENT_KINDS, type SecurityEventKind } from "./security-event-service";

const SRC_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SERVICE_FILE = path.join(SRC_ROOT, "lib", "security", "security-event-service.ts");

/**
 * Ayarlar Ş3 §3 (K5). The kind list is closed because a kind with no writer is a row the Güvenlik
 * tab promises and never fills. This scan is the guard: delete a writer and the kind that lost it
 * is named here, rather than quietly becoming a section of the screen that stays empty forever.
 *
 * The behaviour of each writer is covered by its own unit test; this file only proves the wiring
 * exists — including for `auth.ts` and the `"use server"` actions, which have no unit harness.
 */
function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : collectSourceFiles(entryPath);
    }
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      return [];
    }
    return statSync(entryPath).isFile() ? [entryPath] : [];
  });
}

const sources = collectSourceFiles(SRC_ROOT)
  .filter((filePath) => filePath !== SERVICE_FILE)
  .map((filePath) => ({
    content: readFileSync(filePath, "utf8"),
    path: path.relative(SRC_ROOT, filePath).split(path.sep).join("/"),
  }));

function writersOf(kind: SecurityEventKind) {
  return (
    sources
      // A writer either names the kind in an object literal (`kind: "…"`) or passes it positionally
      // to a local helper; both spell the same quoted literal, so match that.
      .filter(({ content }) => content.includes(`"${kind}"`))
      .map(({ path: filePath }) => filePath)
  );
}

describe("security event writers", () => {
  it("gives every kind at least one production writer outside the service", () => {
    const orphaned = SECURITY_EVENT_KINDS.filter((kind) => writersOf(kind).length === 0);

    assert.deepEqual(orphaned, []);
  });

  it("keeps the eight kinds wired to the flows they describe", () => {
    const expectedWriters: Record<SecurityEventKind, string> = {
      EMAIL_CHANGED: "lib/account/service.ts",
      FAILED_LOGIN: "auth.ts",
      LOGIN_NEW_DEVICE: "lib/auth/auth-session-service.ts",
      PASSWORD_CHANGED: "app/api/v1/users/me/password/route-logic.ts",
      RECOVERY_CODES_REGENERATED: "lib/auth/two-factor.ts",
      SESSION_REVOKED: "lib/auth/auth-session-service.ts",
      TWO_FACTOR_DISABLED: "lib/account/actions.ts",
      TWO_FACTOR_ENABLED: "lib/account/actions.ts",
    };

    for (const kind of SECURITY_EVENT_KINDS) {
      assert.equal(
        writersOf(kind).includes(expectedWriters[kind]),
        true,
        `${kind} is no longer written by ${expectedWriters[kind]}`,
      );
    }
  });

  it("routes every writer through the service rather than prisma directly", () => {
    const directWrites = sources
      .filter(({ content }) =>
        /prisma\.securityEvent\.(create|createMany|upsert)\s*\(/.test(content),
      )
      .map(({ path: filePath }) => filePath);

    assert.deepEqual(directWrites, []);
  });
});
