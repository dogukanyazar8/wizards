import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "@wizards/types";

import {
  appendMessage,
  OPTIMISTIC_MESSAGE_PREFIX,
  patchMessageAuthors,
  type MessagePages,
  updateAuthorPresence,
} from "./use-messages";

function makeMessage(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Ada",
      id: "me",
      username: "ada",
    },
    channelId: "channel-1",
    content: "selam",
    createdAt: "2026-07-28T10:00:00.000Z",
    deletedAt: null,
    editedAt: null,
    reactions: [],
    type: "DEFAULT",
    ...overrides,
  };
}

function makePages(messages: ChatMessage[]): MessagePages {
  return {
    pageParams: [undefined],
    pages: [{ hasMore: false, messages }],
  };
}

function messageIds(pages: MessagePages | undefined): string[] {
  return (pages?.pages[0]?.messages ?? []).map((message) => message.id);
}

describe("appendMessage optimistic reconciliation", () => {
  it("lands the author's echo in the bubble its nonce names", () => {
    const pending = makeMessage({
      deliveryStatus: "sending",
      id: `${OPTIMISTIC_MESSAGE_PREFIX}1-1`,
    });
    const next = appendMessage(
      makePages([pending]),
      makeMessage({ clientNonce: `${OPTIMISTIC_MESSAGE_PREFIX}1-1`, id: "server-1" }),
    );

    assert.deepEqual(messageIds(next), ["server-1"]);
    // The nonce is a detail of one delivery: left in the cache it would differ
    // from the copy the next fetch brings back.
    assert.equal("clientNonce" in (next.pages[0]?.messages[0] ?? {}), false);
  });

  /**
   * The regression the nonce exists for. Two identical sends inside the content
   * matcher's window used to collapse into one bubble on the first echo, and the
   * second only came back once its own echo landed.
   */
  it("keeps a second identical send pending until its own echo arrives", () => {
    const first = makeMessage({
      deliveryStatus: "sending",
      id: `${OPTIMISTIC_MESSAGE_PREFIX}1-1`,
    });
    const second = makeMessage({
      deliveryStatus: "sending",
      id: `${OPTIMISTIC_MESSAGE_PREFIX}1-2`,
    });

    const afterFirstEcho = appendMessage(
      makePages([first, second]),
      makeMessage({ clientNonce: `${OPTIMISTIC_MESSAGE_PREFIX}1-1`, id: "server-1" }),
    );
    assert.deepEqual(messageIds(afterFirstEcho), [`${OPTIMISTIC_MESSAGE_PREFIX}1-2`, "server-1"]);

    const afterSecondEcho = appendMessage(
      afterFirstEcho,
      makeMessage({ clientNonce: `${OPTIMISTIC_MESSAGE_PREFIX}1-2`, id: "server-2" }),
    );
    assert.deepEqual(messageIds(afterSecondEcho), ["server-1", "server-2"]);
  });

  it("still matches on content when the echo carries no nonce", () => {
    const pending = makeMessage({
      deliveryStatus: "sending",
      id: `${OPTIMISTIC_MESSAGE_PREFIX}1-1`,
    });
    const next = appendMessage(makePages([pending]), makeMessage({ id: "server-1" }));

    assert.deepEqual(messageIds(next), ["server-1"]);
  });

  it("leaves another author's message alone", () => {
    const pending = makeMessage({
      deliveryStatus: "sending",
      id: `${OPTIMISTIC_MESSAGE_PREFIX}1-1`,
    });
    const next = appendMessage(
      makePages([pending]),
      makeMessage({
        author: { avatarUrl: null, displayName: "Bo", id: "other", username: "bo" },
        id: "server-1",
      }),
    );

    assert.deepEqual(messageIds(next), [`${OPTIMISTIC_MESSAGE_PREFIX}1-1`, "server-1"]);
  });

  /**
   * An open DM receives the same message twice — once as `dm:message:new`, once
   * inside `dm:conversation:updated`. The second delivery must not hand back a
   * new object, or the list re-renders for nothing.
   */
  it("returns the same pages object when a message is delivered twice", () => {
    const pages = makePages([makeMessage({ id: "server-1" })]);
    const next = appendMessage(pages, makeMessage({ id: "server-1" }));

    assert.equal(next, pages);
  });
});

describe("updateAuthorPresence", () => {
  it("preserves the entire cache when the updated user has no messages", () => {
    const pages = makePages([makeMessage({ id: "message-1" })]);

    const next = updateAuthorPresence(pages, {
      customStatus: null,
      status: "ONLINE",
      userId: "someone-else",
    });

    assert.equal(next, pages);
  });
});

describe("patchMessageAuthors", () => {
  it("preserves the entire cache when the updated profile has no messages", () => {
    const pages = makePages([makeMessage({ id: "message-1" })]);

    const next = patchMessageAuthors(pages, {
      avatarUrl: null,
      customStatus: null,
      displayName: "Grace",
      status: "ONLINE",
      userId: "someone-else",
      username: "grace",
    });

    assert.equal(next, pages);
  });
});
