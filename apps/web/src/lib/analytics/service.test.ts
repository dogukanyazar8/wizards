import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getUtcDayStart, splitIntervalByUtcDay } from "@/lib/analytics/service";

describe("analytics service date helpers", () => {
  it("normalizes metric dates to UTC day starts", () => {
    assert.equal(
      getUtcDayStart(new Date("2026-05-12T21:45:00.000Z")).toISOString(),
      "2026-05-12T00:00:00.000Z",
    );
  });

  it("splits usage intervals across UTC days", () => {
    const segments = splitIntervalByUtcDay(
      new Date("2026-05-12T23:59:30.000Z"),
      new Date("2026-05-13T00:00:30.000Z"),
    );

    assert.deepEqual(
      segments.map((segment) => ({
        date: segment.date.toISOString(),
        seconds: segment.seconds,
      })),
      [
        { date: "2026-05-12T00:00:00.000Z", seconds: 30 },
        { date: "2026-05-13T00:00:00.000Z", seconds: 30 },
      ],
    );
  });
});
