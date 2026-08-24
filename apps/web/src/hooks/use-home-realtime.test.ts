import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyFriendVoiceRoom,
  applyPresenceToLiveRooms,
  applyPresenceToSummary,
} from "@/hooks/use-home-realtime";
import type { FriendDto, FriendVoiceRoomDto } from "@/lib/friends/types";
import type { AppSummaryResponse, VoiceLiveResponse } from "@/lib/home/types";

const SOURCE = readFileSync(join(process.cwd(), "src/hooks/use-home-realtime.ts"), "utf8");

const SUMMARY: AppSummaryResponse = {
  dateLabel: "2026-08-19T09:00:00.000Z",
  dmUnread: 3,
  focus: {
    active: true,
    expiresAt: "2026-08-19T12:10:00.000Z",
    minutesLeft: 10,
    totalMinutes: 25,
  },
  greetingName: "Doğukan",
  pendingReplies: 2,
  presence: "DND",
  unreadMentions: 1,
};

const ROOMS: VoiceLiveResponse = {
  rooms: [
    {
      caption: "",
      href: "/channels/s1/c1",
      id: "c1",
      kind: "voice",
      name: "Genel",
      participantCount: 2,
      participants: [
        { avatarUrl: null, displayName: "Ayşe", id: "u2", presence: "ONLINE" },
        { avatarUrl: null, displayName: "Kerem", id: "u3", presence: "ONLINE" },
      ],
      serverId: "s1",
      serverName: "Whispr",
      speaker: null,
    },
  ],
  totalCount: 1,
};

describe("useHomeRealtime patching", () => {
  it("patches the header only for the viewer's own presence", async () => {
    assert.deepEqual(
      applyPresenceToSummary(SUMMARY, { status: "ONLINE", userId: "u2" }, "u1"),
      SUMMARY,
    );

    const own = applyPresenceToSummary(SUMMARY, { status: "ONLINE", userId: "u1" }, "u1");
    assert.equal(own?.presence, "ONLINE");
    // Leaving DND ends the window the pill is counting down.
    assert.equal(own?.focus, null);

    const stillFocused = applyPresenceToSummary(SUMMARY, { status: "DND", userId: "u1" }, "u1");
    assert.deepEqual(stillFocused?.focus, SUMMARY.focus);
  });

  it("patches a participant in place instead of refetching the list", () => {
    const patched = applyPresenceToLiveRooms(ROOMS, { status: "IDLE", userId: "u3" });

    assert.deepEqual(
      patched?.rooms[0]?.participants.map((participant) => [participant.id, participant.presence]),
      [
        ["u2", "ONLINE"],
        ["u3", "IDLE"],
      ],
    );
    assert.equal(patched?.rooms[0]?.participantCount, 2);
    assert.equal(applyPresenceToLiveRooms(undefined, { status: "IDLE", userId: "u3" }), undefined);
  });

  it("keeps audio levels out of the query cache", () => {
    const audioHandler = SOURCE.slice(
      SOURCE.indexOf("const onAudioLevel"),
      SOURCE.indexOf('socket.on("presence:update"'),
    );

    assert.ok(audioHandler.includes("pendingLevels.current"));
    assert.ok(!audioHandler.includes("queryClient"));
    assert.ok(!audioHandler.includes("setQueriesData"));
    // One write per animation frame, not one per event.
    assert.ok(audioHandler.includes("requestAnimationFrame"));
  });

  it("subscribes to the six contracted events and unsubscribes from all of them", () => {
    const events = [
      "presence:update",
      "friends:updated",
      "friends:voice:update",
      "voice:state:update",
      "voice:audio-level:update",
      "notification:new",
      "server:unread:update",
      "dm:conversation:updated",
    ];

    for (const event of events) {
      assert.ok(SOURCE.includes(`socket.on("${event}"`), `${event} is not subscribed`);
      assert.ok(SOURCE.includes(`socket.off("${event}"`), `${event} is never released`);
    }
  });

  it("adds no socket event of its own", () => {
    const eventsFile = readFileSync(join(process.cwd(), "src/lib/socket/events.ts"), "utf8");
    const subscribed = [...SOURCE.matchAll(/socket\.on\("([^"]+)"/g)].map((match) => match[1]);

    assert.ok(subscribed.length > 0);
    for (const event of subscribed) {
      assert.ok(eventsFile.includes(`"${event}"`), `${event} is not an existing socket event`);
    }
  });
});

describe("useHomeRealtime — arkadaş sesli odası", () => {
  const friend = (id: string, voiceRoom: FriendVoiceRoomDto | null) =>
    ({
      allowsGroupInvites: true,
      avatarUrl: null,
      customStatus: null,
      displayName: id,
      id,
      lastSeenAt: null,
      presence: { customStatus: null, status: "ONLINE" as const },
      status: "ONLINE" as const,
      username: id,
      voiceRoom,
    }) satisfies FriendDto;

  const room: FriendVoiceRoomDto = {
    channelId: "c1",
    channelName: "live-room",
    serverId: "s1",
    serverName: "Whispr",
  };

  it("odayı yalnız olayın sahibine yazar", () => {
    const next = applyFriendVoiceRoom([friend("a", null), friend("b", null)], {
      userId: "a",
      voiceRoom: room,
    });

    assert.deepEqual(next?.[0]?.voiceRoom, room);
    assert.equal(next?.[1]?.voiceRoom, null);
  });

  it("odadan çıkışta alanı temizler", () => {
    const next = applyFriendVoiceRoom([friend("a", room)], { userId: "a", voiceRoom: null });

    assert.equal(next?.[0]?.voiceRoom, null);
  });

  it("liste henüz yüklenmediyse hiçbir şey uydurmaz", () => {
    assert.equal(applyFriendVoiceRoom(undefined, { userId: "a", voiceRoom: room }), undefined);
  });
});
