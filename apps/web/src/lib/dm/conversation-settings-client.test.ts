import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ConversationSettingsError,
  fetchMessagingPrivacy,
  reportUserRequest,
  setConversationMutedRequest,
  updateMessagingPrivacyRequest,
} from "./conversation-settings-client";

type Captured = { body: unknown; method: string; url: string };

function stubFetch(payload: unknown, status = 200) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      method: String(init.method),
      url,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as Response;
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

describe("conversation settings client", () => {
  it("sends the duration the submenu picked and returns the server's deadline", async () => {
    const { calls, fetchImpl } = stubFetch({
      muted: true,
      mutedUntil: "2026-08-27T09:15:00.000Z",
      notifyLevel: "NONE",
      success: true,
    });

    const result = await setConversationMutedRequest(
      "conversation-1",
      { duration: "15m", muted: true },
      fetchImpl,
    );

    assert.deepEqual(calls, [
      {
        body: { duration: "15m", muted: true },
        method: "PATCH",
        url: "/api/v1/dm/conversation-1/mute",
      },
    ]);
    // The deadline is the server's, never recomputed here: a client clock that
    // drifts would draw a pill that runs out at a different minute than the
    // notifications do.
    assert.equal(result.mutedUntil, "2026-08-27T09:15:00.000Z");
  });

  it("omits the duration for the pre-submenu body", async () => {
    const { calls, fetchImpl } = stubFetch({
      muted: false,
      mutedUntil: null,
      notifyLevel: "ALL",
      success: true,
    });

    await setConversationMutedRequest("conversation-1", { muted: false }, fetchImpl);

    assert.deepEqual(calls[0]?.body, { muted: false });
  });

  it("escapes a conversation id rather than pasting it into the path", async () => {
    const { calls, fetchImpl } = stubFetch({
      muted: true,
      mutedUntil: null,
      notifyLevel: "NONE",
      success: true,
    });

    await setConversationMutedRequest("a/b?c", { muted: true }, fetchImpl);

    assert.equal(calls[0]?.url, "/api/v1/dm/a%2Fb%3Fc/mute");
  });

  it("reads both privacy switches", async () => {
    const { calls, fetchImpl } = stubFetch({ readReceipts: false, typingIndicator: true });

    assert.deepEqual(await fetchMessagingPrivacy(fetchImpl), {
      readReceipts: false,
      typingIndicator: true,
    });
    assert.deepEqual(calls, [{ body: undefined, method: "GET", url: "/api/v1/users/me/privacy" }]);
  });

  it("sends only the switch that moved and reads back both", async () => {
    const { calls, fetchImpl } = stubFetch({ readReceipts: true, typingIndicator: false });

    const result = await updateMessagingPrivacyRequest({ typingIndicator: false }, fetchImpl);

    assert.deepEqual(calls[0]?.body, { typingIndicator: false });
    assert.deepEqual(result, { readReceipts: true, typingIndicator: false });
  });

  it("refuses a privacy response that is not the two-switch shape", async () => {
    const { fetchImpl } = stubFetch({ readReceipts: true });

    await assert.rejects(() => fetchMessagingPrivacy(fetchImpl));
  });

  it("posts a report and keeps only the receipt", async () => {
    const { calls, fetchImpl } = stubFetch({ reportId: "report-1" });

    const result = await reportUserRequest("user-2", { reason: "spam" }, fetchImpl);

    assert.deepEqual(calls, [
      { body: { reason: "spam" }, method: "POST", url: "/api/v1/users/user-2/report" },
    ]);
    assert.deepEqual(result, { reportId: "report-1" });
  });

  it("surfaces the server's error code so the toast can say what happened", async () => {
    const { fetchImpl } = stubFetch({ code: "SELF_REPORT", error: "Cannot report yourself" }, 400);

    await assert.rejects(
      () => reportUserRequest("user-1", { reason: "spam" }, fetchImpl),
      (error: unknown) =>
        error instanceof ConversationSettingsError &&
        error.status === 400 &&
        error.code === "SELF_REPORT",
    );
  });

  it("still fails loudly when the error body is not JSON", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }) as unknown as Response) as unknown as typeof fetch;

    await assert.rejects(
      () => updateMessagingPrivacyRequest({ readReceipts: false }, fetchImpl),
      (error: unknown) => error instanceof ConversationSettingsError && error.status === 500,
    );
  });
});
