import { expect, test } from "../../fixtures/test";
import { apiLoginAs, e2eRequestHeaders } from "../../helpers/api-auth";

/**
 * Ana Sayfa 1a — Faz 3. The nine endpoints against a real server, a real
 * database and a real session.
 *
 * The unit suites prove the shape and the budget; this proves the wiring: the
 * route file is reachable, the guard runs before anything else, and every link
 * the payload hands to the client is an in-app path.
 */

const HOME_READ_ENDPOINTS = [
  "/api/v1/app/summary",
  "/api/v1/app/recent?limit=6",
  "/api/v1/app/awaiting?limit=6",
  "/api/v1/voice/live?limit=4",
  "/api/v1/events/upcoming?limit=3",
  // Ş10: `events/list` ve `events/calendar` silindi; akışın tek ucu `GET /api/v1/events`.
  "/api/v1/events?limit=4",
  "/api/v1/mentions?limit=20",
  "/api/v1/search/command?q=",
] as const;

function collectHrefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectHrefs(entry, found);
    }
    return found;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "href" && typeof entry === "string") {
        found.push(entry);
      } else {
        collectHrefs(entry, found);
      }
    }
  }

  return found;
}

test.describe("home data endpoints", () => {
  test("refuses every home read without a session", async ({ request }) => {
    for (const endpoint of HOME_READ_ENDPOINTS) {
      const response = await request.get(endpoint);

      expect(response.status(), endpoint).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
    }
  });

  test("refuses the presence write without a session", async ({ request }) => {
    const response = await request.patch("/api/v1/users/me/presence", {
      data: { presence: "ONLINE" },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(401);
  });

  test("serves every home read to a signed-in member without caching it", async ({ request }) => {
    await apiLoginAs(request, "alice");

    for (const endpoint of HOME_READ_ENDPOINTS) {
      const response = await request.get(endpoint);

      expect(response.status(), endpoint).toBe(200);
      expect(response.headers()["cache-control"], endpoint).toContain("no-store");

      const body: unknown = await response.json();
      for (const href of collectHrefs(body)) {
        expect(href, `${endpoint} produced an off-site link`).toMatch(/^\/(?!\/)/);
      }
    }
  });

  test("rejects a query the screens never send", async ({ request }) => {
    await apiLoginAs(request, "alice");

    for (const endpoint of [
      "/api/v1/app/recent?limit=99",
      "/api/v1/mentions?limit=500",
      "/api/v1/events?limit=500",
      `/api/v1/search/command?q=${"a".repeat(65)}`,
    ]) {
      const response = await request.get(endpoint);

      expect(response.status(), endpoint).toBe(400);
      const body = await response.json();
      expect(JSON.stringify(body), endpoint).not.toContain("prisma");
    }
  });

  test("opens a focus window and does not extend it on a repeat of the same body", async ({
    request,
  }) => {
    await apiLoginAs(request, "alice");

    const open = await request.patch("/api/v1/users/me/presence", {
      data: { focus: { enabled: true, minutes: 25 } },
      headers: e2eRequestHeaders,
    });
    expect(open.status()).toBe(200);
    const opened = await open.json();
    expect(opened).toMatchObject({ presence: "DND" });
    expect(opened.focus).toMatchObject({ active: true, totalMinutes: 25 });

    const repeat = await request.patch("/api/v1/users/me/presence", {
      data: { focus: { enabled: true, minutes: 25 } },
      headers: e2eRequestHeaders,
    });
    expect(repeat.status()).toBe(200);
    const repeated = await repeat.json();
    expect(repeated.focus.minutesLeft).toBeLessThanOrEqual(opened.focus.minutesLeft);

    const closed = await request.patch("/api/v1/users/me/presence", {
      data: { focus: { enabled: false } },
      headers: e2eRequestHeaders,
    });
    expect(closed.status()).toBe(200);
    await expect(closed.json()).resolves.toMatchObject({ focus: null });
  });

  test("refuses a focus window outside the allowed range", async ({ request }) => {
    await apiLoginAs(request, "alice");

    const response = await request.patch("/api/v1/users/me/presence", {
      data: { focus: { enabled: true, minutes: 1 } },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(400);
  });
});
