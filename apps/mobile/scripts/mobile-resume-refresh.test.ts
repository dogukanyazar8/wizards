import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createMobileQueryClient } from "../src/query/mobile-query-client";
import { MOBILE_WORKSPACE_STALE_TIME_MS } from "../src/query/mobile-workspace-query";

describe("resume refresh", () => {
  it("stops focus from refetching the whole cache by itself", () => {
    const defaults = createMobileQueryClient().getDefaultOptions().queries;

    // A thirty-open run that never restarted the app issued 60 bootstrap and 60
    // workspace reads; a run that cold-started thirty times issued 13 and 3.
    assert.equal(defaults?.refetchOnWindowFocus, false);
    // Losing the network is a different question from losing focus.
    assert.equal(defaults?.refetchOnReconnect, true);
  });

  it("gives the workspace root the stale policy bootstrap already had", () => {
    assert.equal(MOBILE_WORKSPACE_STALE_TIME_MS, 60_000);
  });

  it("leaves missed-event refresh ownership to the realtime gap backfill", () => {
    const provider = readFileSync(
      path.join(__dirname, "..", "src/app/providers/mobile-query-provider.tsx"),
      "utf8",
    );

    assert.doesNotMatch(provider, /selectMobileResumeRefreshKeys/u);
    assert.doesNotMatch(provider, /queryClient\.invalidateQueries/u);
  });
});
