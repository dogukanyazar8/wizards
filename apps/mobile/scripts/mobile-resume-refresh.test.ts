import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createMobileQueryClient } from "../src/query/mobile-query-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { selectMobileResumeRefreshKeys } from "../src/query/mobile-resume-refresh";
import { MOBILE_WORKSPACE_STALE_TIME_MS } from "../src/query/mobile-workspace-query";

describe("resume refresh", () => {
  it("refreshes the channel the reader came back to, and its server", () => {
    assert.deepEqual(
      selectMobileResumeRefreshKeys({
        channelId: "channel-1",
        conversationId: null,
        serverId: "server-1",
      }),
      [
        mobileQueryKeys.bootstrap(),
        mobileQueryKeys.workspace("server-1"),
        mobileQueryKeys.channelMessages("channel-1"),
      ],
    );
  });

  it("refreshes the conversation the reader came back to", () => {
    assert.deepEqual(
      selectMobileResumeRefreshKeys({
        channelId: null,
        conversationId: "conversation-1",
        serverId: null,
      }),
      [mobileQueryKeys.bootstrap(), mobileQueryKeys.dmMessages("conversation-1")],
    );
  });

  it("still refreshes the root when no chat is open", () => {
    // The unread counts are what the reader sees first on a resume into the tabs.
    assert.deepEqual(
      selectMobileResumeRefreshKeys({ channelId: null, conversationId: null, serverId: null }),
      [mobileQueryKeys.bootstrap()],
    );
    assert.deepEqual(
      selectMobileResumeRefreshKeys({ channelId: "", conversationId: "", serverId: "" }),
      [mobileQueryKeys.bootstrap()],
    );
  });

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

  it("is what the provider runs on resume", () => {
    const provider = readFileSync(
      path.join(__dirname, "..", "src/app/providers/mobile-query-provider.tsx"),
      "utf8",
    );

    assert.match(
      provider,
      /selectMobileResumeRefreshKeys\(\s*useMobileActiveTargetStore\.getState/u,
    );
    assert.match(provider, /queryClient\.invalidateQueries\(\{ exact: true, queryKey \}\)/u);
  });
});
