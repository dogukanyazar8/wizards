import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Mention } from "@wizards/types";

import {
  MENTION_REPLY_COPY_KEY,
  readMentionMessageId,
  resolveReplyTarget,
} from "@/lib/mentions/reply-target";

/** Ş7 — karar K10'un üç dalı. */

function mention(overrides: Partial<Mention> = {}): Mention {
  return {
    author: { avatarUrl: null, handle: "selin", id: "u2", initials: "SA", name: "Selin Aksoy" },
    body: "bakar mısın",
    createdAt: "2026-08-21T06:41:00.000Z",
    href: "/channels/s1/c1?message=m-1",
    id: "channel:mn-1",
    kind: "me",
    messageId: "m-1",
    permalink: "https://whispr.test/channels/s1/c1?message=m-1",
    readLater: false,
    source: {
      channelId: "c1",
      channelName: "tasarım-kritiği",
      serverId: "s1",
      serverInitial: "W",
      serverName: "Whispr",
      type: "channel",
    },
    stateKey: { refId: "mn-1", source: "channel" },
    tag: "@Doğukan Yazar",
    unread: true,
    ...overrides,
  };
}

describe("resolveReplyTarget", () => {
  it("kanal bahsetmesi kanala yanıtlanır", () => {
    assert.deepEqual(resolveReplyTarget(mention()), {
      channelId: "c1",
      replyToId: "m-1",
      type: "channel",
    });
  });

  it("DM bahsetmesi sohbete yanıtlanır", () => {
    const dm = mention({
      href: "/messages/conv-1?message=m-9",
      messageId: "m-9",
      source: { conversationId: "conv-1", title: "Zeynep Arı", type: "dm" },
      stateKey: { refId: "dmm-1", source: "dm" },
    });

    assert.deepEqual(resolveReplyTarget(dm), {
      conversationId: "conv-1",
      replyToId: "m-9",
      type: "dm",
    });
  });

  it("thread bahsetmesi thread'e yanıtlanır — K10", () => {
    const thread = mention({
      kind: "thread",
      thread: { id: "parent-7", open: true, replyCount: 3 },
    });

    assert.deepEqual(resolveReplyTarget(thread), {
      channelId: "c1",
      parentMessageId: "parent-7",
      type: "thread",
    });
  });

  it("thread bloğu olmayan thread kartı yeni bir thread açmaz, kendi mesajını üst sayar", () => {
    const thread = mention({ kind: "thread" });

    assert.deepEqual(resolveReplyTarget(thread), {
      channelId: "c1",
      parentMessageId: "m-1",
      type: "thread",
    });
  });

  it("thread'i olan ama türü thread olmayan kart yine kanala yanıtlanır", () => {
    // K10 hedefi **türden** okur; bir kanal bahsetmesinin thread satırı taşıması onu thread
    // bahsetmesi yapmaz.
    const inThread = mention({ thread: { id: "parent-7", open: true, replyCount: 2 } });

    assert.equal(resolveReplyTarget(inThread).type, "channel");
  });

  it("DM thread kartı yine DM'e yanıtlanır — DM dalı türden önce gelir", () => {
    const dmThread = mention({
      href: "/messages/conv-1?message=m-9",
      kind: "thread",
      messageId: "m-9",
      source: { conversationId: "conv-1", title: "Zeynep Arı", type: "dm" },
      thread: { id: "parent-3", open: true, replyCount: 1 },
    });

    assert.equal(resolveReplyTarget(dmThread).type, "dm");
  });
});

describe("readMentionMessageId", () => {
  it("sözleşmedeki mesaj kimliğini okur", () => {
    assert.equal(readMentionMessageId(mention()), "m-1");
  });

  it("navigasyon adresi yanlış veya sorgusuz olsa da hedef değişmez", () => {
    assert.equal(
      readMentionMessageId(mention({ href: "/channels/s1/c1?message=yanlış", messageId: "m-42" })),
      "m-42",
    );
    assert.equal(readMentionMessageId(mention({ href: "/channels/s1/c1" })), "m-1");
  });
});

describe("MENTION_REPLY_COPY_KEY", () => {
  it("üç hedefin de metin anahtarı var ve thread ayrı cümle kullanır", () => {
    assert.equal(MENTION_REPLY_COPY_KEY.channel.placeholder, "mentions.reply.placeholder");
    assert.equal(MENTION_REPLY_COPY_KEY.dm.placeholder, "mentions.reply.placeholderDm");
    assert.equal(MENTION_REPLY_COPY_KEY.thread.placeholder, "mentions.reply.placeholderThread");
    assert.equal(MENTION_REPLY_COPY_KEY.thread.meta, "mentions.reply.metaThread");
  });
});
