import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
// Imported through the alias: this suite deliberately does not live beside the route.
// Node's test runner reads `[userId]` in a path as a glob character class, so any
// test file under a Next.js dynamic segment is silently collected and never run.
import {
  mobileUserNoteRoute,
  type MobileUserRouteDependencies,
} from "@/app/api/v1/mobile/users/[userId]/route-logic";

type SaveCall = { authorId: string; body: string | null; subjectId: string };

function createDependencies(overrides: Partial<MobileUserRouteDependencies> = {}) {
  const rateLimits: string[] = [];
  const saves: SaveCall[] = [];

  const dependencies: MobileUserRouteDependencies = {
    authenticate: async () => "viewer-1",
    createReport: async () => ({ reportId: "report-1" }),
    getProfile: async () => {
      throw new Error("the note route never reads a profile");
    },
    enforceRateLimit: async (_userId, action) => {
      rateLimits.push(action);
    },
    parseBody: parseJsonBody,
    saveNote: async (scope, body) => {
      saves.push({ authorId: scope.authorId, body, subjectId: scope.subjectId });
      return { note: body };
    },
    ...overrides,
  };

  return { dependencies, rateLimits, saves };
}

function noteRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/users/user-2/note", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
}

describe("mobile user note route", () => {
  it("writes the note under the session user, never under a client-supplied author", async () => {
    const { dependencies, rateLimits, saves } = createDependencies();

    const response = await mobileUserNoteRoute(
      noteRequest({ body: "Staging erişimi var" }),
      { params: Promise.resolve({ userId: "user-2" }) },
      dependencies,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { note: "Staging erişimi var" });
    assert.deepEqual(rateLimits, ["mobile:users:note"]);
    assert.deepEqual(saves, [
      { authorId: "viewer-1", body: "Staging erişimi var", subjectId: "user-2" },
    ]);
  });

  it("treats an empty body as a delete", async () => {
    const { dependencies, saves } = createDependencies();

    const response = await mobileUserNoteRoute(
      noteRequest({ body: "   " }),
      { params: Promise.resolve({ userId: "user-2" }) },
      dependencies,
    );

    assert.deepEqual(await response.json(), { note: null });
    assert.equal(saves[0]?.body, null);
  });

  it("accepts an explicit null body as the same delete", async () => {
    const { dependencies, saves } = createDependencies();

    await mobileUserNoteRoute(
      noteRequest({ body: null }),
      { params: Promise.resolve({ userId: "user-2" }) },
      dependencies,
    );

    assert.equal(saves[0]?.body, null);
  });

  it("rejects a note longer than the stored column", async () => {
    const { dependencies, saves } = createDependencies();

    const response = await mobileUserNoteRoute(
      noteRequest({ body: "x".repeat(257) }),
      { params: Promise.resolve({ userId: "user-2" }) },
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(saves, []);
  });

  it("rejects an unknown field instead of storing it", async () => {
    const { dependencies, saves } = createDependencies();

    const response = await mobileUserNoteRoute(
      noteRequest({ authorId: "someone-else", body: "hi" }),
      { params: Promise.resolve({ userId: "user-2" }) },
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(saves, []);
  });

  it("rate limits before it authenticates a body", async () => {
    const { dependencies } = createDependencies({
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests", 429, "RATE_LIMITED");
      },
    });

    const response = await mobileUserNoteRoute(
      noteRequest({ body: "hi" }),
      { params: Promise.resolve({ userId: "user-2" }) },
      dependencies,
    );

    assert.equal(response.status, 429);
  });
});
