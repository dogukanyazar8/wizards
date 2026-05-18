import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOperationalProbeResponse, getReadinessPayload, getReadinessStatusCode } from "./health";

const fixedDate = new Date("2026-05-14T00:00:00.000Z");

describe("health probes", () => {
  it("returns liveness without dependency checks", async () => {
    let databaseChecked = false;

    const response = await getOperationalProbeResponse({
      method: "GET",
      now: fixedDate,
      pathname: "/health",
      readiness: {
        checks: {
          database: async () => {
            databaseChecked = true;
          },
        },
      },
    });

    assert.deepEqual(response, {
      body: {
        status: "ok",
        timestamp: fixedDate.toISOString(),
      },
      status: 200,
    });
    assert.equal(databaseChecked, false);
  });

  it("returns readiness ok only when database and Redis checks pass", async () => {
    const readiness = await getReadinessPayload({
      checks: {
        database: async () => 1,
        redis: async () => "PONG",
      },
      now: fixedDate,
    });

    assert.deepEqual(readiness, {
      checks: {
        database: "ok",
        redis: "ok",
      },
      status: "ok",
      timestamp: fixedDate.toISOString(),
    });
    assert.equal(getReadinessStatusCode(readiness), 200);
  });

  it("returns readiness error when a dependency fails", async () => {
    const readiness = await getReadinessPayload({
      checks: {
        database: async () => 1,
        redis: async () => {
          throw new Error("redis unavailable");
        },
      },
      now: fixedDate,
    });

    assert.deepEqual(readiness.checks, {
      database: "ok",
      redis: "error",
    });
    assert.equal(readiness.status, "error");
    assert.equal(getReadinessStatusCode(readiness), 503);
  });

  it("maps /ready to readiness and ignores non-probe paths", async () => {
    const response = await getOperationalProbeResponse({
      method: "GET",
      pathname: "/ready",
      readiness: {
        checks: {
          database: async () => 1,
          redis: async () => "PONG",
        },
        now: fixedDate,
      },
    });

    assert.equal(response?.status, 200);
    assert.deepEqual(
      await getOperationalProbeResponse({
        method: "GET",
        pathname: "/channels",
      }),
      null,
    );
  });

  it("rejects unsupported probe methods", async () => {
    const response = await getOperationalProbeResponse({
      method: "POST",
      pathname: "/ready",
    });

    assert.deepEqual(response, {
      body: {
        message: "Method not allowed",
        status: "error",
      },
      headers: {
        Allow: "GET, HEAD",
      },
      status: 405,
    });
  });
});
