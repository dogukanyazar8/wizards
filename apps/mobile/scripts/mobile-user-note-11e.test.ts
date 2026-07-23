import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryClient } from "@tanstack/react-query";

import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import {
  MOBILE_USER_NOTE_MAX_LENGTH,
  normalizeMobileUserNote,
  saveMobileUserNote,
} from "../src/social/mobile-user-note-client";
import {
  patchMobileUserNoteCaches,
  restoreMobileUserNoteCaches,
} from "../src/social/mobile-user-note-query";
import {
  MOBILE_STATUS_PICKER_OPTIONS,
  toMobilePresenceStatus,
  toMobileStatusPickerOption,
} from "../src/social/mobile-status-picker-model";

type RecordedRequest = { body: unknown; method: string | undefined; path: string };

function createRecordingClient(response: unknown) {
  const requests: RecordedRequest[] = [];
  const client = {
    requestJson: async (path: string, options?: { body?: unknown; method?: string }) => {
      requests.push({ body: options?.body, method: options?.method, path });
      return response;
    },
  } as never;

  return { client, requests };
}

function profile(userId: string, note: string | null) {
  return { note, user: { id: userId, username: "ada" } };
}

describe("11e note contract", () => {
  it("trims a note and caps it at the stored length", () => {
    assert.equal(normalizeMobileUserNote("  staging access  "), "staging access");
    assert.equal(
      normalizeMobileUserNote("x".repeat(MOBILE_USER_NOTE_MAX_LENGTH + 40)).length,
      MOBILE_USER_NOTE_MAX_LENGTH,
    );
  });

  it("writes the note to the subject's note path", async () => {
    const { client, requests } = createRecordingClient({ note: "staging access" });
    const saved = await saveMobileUserNote(client, "user 2", " staging access ");

    assert.equal(saved, "staging access");
    assert.deepEqual(requests, [
      {
        body: { body: "staging access" },
        method: "PUT",
        path: "/api/v1/mobile/users/user%202/note",
      },
    ]);
  });

  it("sends null for a cleared note, which is how a note is deleted", async () => {
    const { client, requests } = createRecordingClient({ note: null });
    const saved = await saveMobileUserNote(client, "user-2", "   ");

    assert.equal(saved, null);
    assert.deepEqual(requests[0]?.body, { body: null });
  });

  it("rejects a malformed note response instead of caching it", async () => {
    const { client } = createRecordingClient({ note: 42 });
    await assert.rejects(() => saveMobileUserNote(client, "user-2", "hi"));
  });
});

describe("11e note cache sync", () => {
  it("moves every server context of the same user at once", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(mobileQueryKeys.userProfile("user-2"), profile("user-2", null));
    queryClient.setQueryData(
      mobileQueryKeys.userProfile("user-2", "server-1"),
      profile("user-2", null),
    );
    queryClient.setQueryData(mobileQueryKeys.userProfile("user-3"), profile("user-3", "other"));

    patchMobileUserNoteCaches({ note: "staging access", queryClient, userId: "user-2" });

    assert.equal(
      (queryClient.getQueryData(mobileQueryKeys.userProfile("user-2")) as { note: string }).note,
      "staging access",
    );
    assert.equal(
      (
        queryClient.getQueryData(mobileQueryKeys.userProfile("user-2", "server-1")) as {
          note: string;
        }
      ).note,
      "staging access",
    );
    assert.equal(
      (queryClient.getQueryData(mobileQueryKeys.userProfile("user-3")) as { note: string }).note,
      "other",
      "a note belongs to one subject and must not leak into another card",
    );
  });

  it("restores the previous note when the save fails", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(mobileQueryKeys.userProfile("user-2"), profile("user-2", "before"));

    const snapshot = patchMobileUserNoteCaches({ note: null, queryClient, userId: "user-2" });
    assert.equal(
      (queryClient.getQueryData(mobileQueryKeys.userProfile("user-2")) as { note: string | null })
        .note,
      null,
    );

    restoreMobileUserNoteCaches(snapshot);
    assert.equal(
      (queryClient.getQueryData(mobileQueryKeys.userProfile("user-2")) as { note: string }).note,
      "before",
    );
  });

  it("skips untouched entries so an unrelated rollback cannot resurrect them", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(mobileQueryKeys.userProfile("user-2"), profile("user-2", "same"));

    const snapshot = patchMobileUserNoteCaches({ note: "same", queryClient, userId: "user-2" });
    assert.equal(snapshot.entries.length, 0);
  });
});

describe("11e status picker mapping", () => {
  it("writes Invisible as OFFLINE so presence carries no invisibility flag", () => {
    assert.equal(toMobilePresenceStatus("INVISIBLE"), "OFFLINE");
    assert.equal(toMobilePresenceStatus("ONLINE"), "ONLINE");
    assert.equal(toMobilePresenceStatus("IDLE"), "IDLE");
    assert.equal(toMobilePresenceStatus("DND"), "DND");
  });

  it("shows an OFFLINE account as the Invisible row", () => {
    assert.equal(toMobileStatusPickerOption("OFFLINE"), "INVISIBLE");
    assert.equal(toMobileStatusPickerOption("ONLINE"), "ONLINE");
    assert.equal(toMobileStatusPickerOption(null), null);
  });

  it("offers exactly the four handoff rows", () => {
    assert.deepEqual([...MOBILE_STATUS_PICKER_OPTIONS], ["ONLINE", "IDLE", "DND", "INVISIBLE"]);
  });
});
