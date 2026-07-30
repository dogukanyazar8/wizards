import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  requireReleasePublisherOrAdmin,
  tryReleasePublisherUserId,
} from "./release-publisher-auth";

const environment = {
  WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID: "service-user-1",
  WHISPR_RELEASE_PUBLISH_TOKEN: "a".repeat(64),
};

function publisherRequest(token?: string) {
  return new Request("https://whispr.test", {
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
}

describe("release publisher authentication", () => {
  it("recognizes the publisher token for read-only publication verification", () => {
    assert.equal(
      tryReleasePublisherUserId(publisherRequest("a".repeat(64)), environment),
      "service-user-1",
    );
    assert.equal(tryReleasePublisherUserId(publisherRequest("b".repeat(64)), environment), null);
    assert.equal(tryReleasePublisherUserId(publisherRequest(), environment), null);
  });

  it("accepts the dedicated bearer token without exposing it", async () => {
    const publisher = await requireReleasePublisherOrAdmin(
      new Request("https://whispr.test", {
        headers: { authorization: `Bearer ${"a".repeat(64)}` },
      }),
      async () => {
        throw new Error("interactive fallback must not run");
      },
      environment,
    );

    assert.equal(publisher.id, "service-user-1");
    assert.equal(publisher.username, "release-publisher");
    assert.doesNotMatch(JSON.stringify(publisher), /a{32}/);
  });

  it("fails a wrong bearer token instead of falling back to a session", async () => {
    await assert.rejects(
      requireReleasePublisherOrAdmin(
        new Request("https://whispr.test", {
          headers: { authorization: `Bearer ${"b".repeat(64)}` },
        }),
        async () => ({
          email: "admin@whispr.test",
          id: "admin-1",
          role: "ADMIN",
          username: "admin",
        }),
        environment,
      ),
      (error: unknown) =>
        error instanceof ApiError && error.code === "RELEASE_PUBLISH_UNAUTHORIZED",
    );
  });

  it("keeps interactive admin authentication when no bearer is supplied", async () => {
    const admin = await requireReleasePublisherOrAdmin(
      new Request("https://whispr.test"),
      async () => ({
        email: "admin@whispr.test",
        id: "admin-1",
        role: "ADMIN",
        username: "admin",
      }),
      environment,
    );

    assert.equal(admin.id, "admin-1");
  });
});
