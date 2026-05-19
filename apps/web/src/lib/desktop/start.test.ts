import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveDesktopStartDestination,
  resolveDesktopStartDestinationFromSession,
} from "./start";

describe("desktop start session resolution", () => {
  it("routes authenticated desktop launches to the safe callback", () => {
    assert.deepEqual(
      resolveDesktopStartDestinationFromSession("/channels/server-1", {
        user: { id: "user-1" },
      }),
      {
        authenticated: true,
        destination: "/channels/server-1",
      },
    );
  });

  it("fails closed to login when the session payload is anonymous", () => {
    assert.deepEqual(resolveDesktopStartDestinationFromSession("/settings", {}), {
      authenticated: false,
      destination: "/login?callbackUrl=%2Fsettings",
    });
  });

  it("sanitizes unsafe callback URLs before using them in redirects", () => {
    assert.deepEqual(
      resolveDesktopStartDestinationFromSession("https://attacker.example", {
        user: { id: "user-1" },
      }),
      {
        authenticated: true,
        destination: "/channels",
      },
    );
  });

  it("fetches the session without caching and falls back to login on failures", async () => {
    const seenRequests: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      seenRequests.push({ input, init });
      return new Response("{}", { status: 503 });
    };

    assert.deepEqual(
      await resolveDesktopStartDestination("/channels", {
        fetcher,
        timeoutMs: 0,
      }),
      {
        authenticated: false,
        destination: "/login?callbackUrl=%2Fchannels",
      },
    );

    assert.equal(seenRequests[0]?.input, "/api/auth/session");
    assert.equal(seenRequests[0]?.init?.cache, "no-store");
    assert.equal(seenRequests[0]?.init?.credentials, "same-origin");
  });
});
