import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setSocketServer } from "@/lib/socket/runtime";
import { getActiveChannelViewerUserIds, groupUsersByVisibleChannelIds } from "./unread-service";

describe("workspace unread service", () => {
  it("collects active channel viewers through the socket adapter", async () => {
    let requestedRoom: string | null = null;
    const socketServer = {
      in(room: string) {
        requestedRoom = room;

        return {
          async fetchSockets() {
            return [
              { data: { userId: "user-1" } },
              { data: { userId: "user-2" } },
              { data: { userId: "user-1" } },
              { data: {} },
            ];
          },
        };
      },
    } as unknown as Parameters<typeof setSocketServer>[0];

    setSocketServer(socketServer);

    const userIds = await getActiveChannelViewerUserIds("channel-1");

    assert.equal(requestedRoom, "channel-1");
    assert.deepEqual(userIds.sort(), ["user-1", "user-2"]);
  });

  it("groups users by identical visible channel sets", () => {
    const groups = groupUsersByVisibleChannelIds(new Map([
      ["user-1", ["channel-a", "channel-b"]],
      ["user-2", ["channel-a", "channel-b"]],
      ["user-3", ["channel-c"]],
      ["user-4", []],
    ]));

    assert.deepEqual(groups, [
      {
        channelIds: ["channel-a", "channel-b"],
        userIds: ["user-1", "user-2"],
      },
      {
        channelIds: ["channel-c"],
        userIds: ["user-3"],
      },
    ]);
  });
});
