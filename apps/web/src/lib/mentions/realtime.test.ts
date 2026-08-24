import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Mention, MentionCounts } from "@wizards/types";

import {
  publishMentionCreated,
  publishMentionReadAll,
  publishMentionState,
} from "@/lib/mentions/realtime";
import type { AppSocketServer } from "@/lib/socket/runtime";

const COUNTS: MentionCounts = {
  all: 1,
  bySource: { s1: 1 },
  everyone: 0,
  me: 1,
  readLater: 0,
  roleNames: [],
  role: 0,
  thread: 0,
  unread: 1,
};

const MENTION = {
  author: { avatarUrl: null, handle: "selin", id: "u2", initials: "SA", name: "Selin Aksoy" },
  body: "bak",
  createdAt: "2026-08-21T09:41:00.000Z",
  href: "/channels/s1/c1?message=m-1",
  id: "channel:mn-1",
  kind: "me",
  messageId: "m-1",
  permalink: "https://whispr.test/channels/s1/c1?message=m-1",
  readLater: false,
  source: {
    channelId: "c1",
    channelName: "genel",
    serverId: "s1",
    serverInitial: "W",
    serverName: "Whispr",
    type: "channel",
  },
  stateKey: { refId: "mn-1", source: "channel" },
  tag: "@Doğukan Yazar",
  unread: true,
} satisfies Mention;

function fakeServer() {
  const emitted: Array<{ event: string; payload: unknown; room: string }> = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ event, payload, room }),
    }),
  } as unknown as AppSocketServer;

  return { emitted, server };
}

describe("mentions realtime", () => {
  it("üç olay da yalnız kullanıcının kendi odasına gider", () => {
    const { emitted, server } = fakeServer();

    publishMentionCreated("u1", MENTION, COUNTS, server);
    publishMentionState(
      "u1",
      { dismissed: false, mentionId: "channel:mn-1", readLater: false, unread: false },
      COUNTS,
      server,
    );
    publishMentionReadAll("u1", COUNTS, server);

    assert.deepEqual(
      emitted.map((entry) => [entry.room, entry.event]),
      [
        ["user:u1", "mention:new"],
        ["user:u1", "mention:state"],
        ["user:u1", "mention:read-all"],
      ],
    );
  });

  it("her yayın sayaçları da taşır — olayla sorgu arasında yanlış sayı görünmesin", () => {
    const { emitted, server } = fakeServer();

    publishMentionCreated("u1", MENTION, COUNTS, server);

    assert.deepEqual(emitted[0]?.payload, { counts: COUNTS, mention: MENTION });
  });

  it("mention:state kartın üç durumunu birden taşır", () => {
    const { emitted, server } = fakeServer();

    publishMentionState(
      "u1",
      { dismissed: true, mentionId: "everyone:m-9", readLater: true, unread: false },
      COUNTS,
      server,
    );

    assert.deepEqual(emitted[0]?.payload, {
      counts: COUNTS,
      dismissed: true,
      mentionId: "everyone:m-9",
      readLater: true,
      unread: false,
    });
  });

  it("soket sunucusu yokken sessizce geçer — yayın bir yan etki, bir gereklilik değil", () => {
    assert.doesNotThrow(() => publishMentionReadAll("u1", COUNTS, null));
  });
});
