import assert from "node:assert/strict";
import test from "node:test";
import type { MobileApiClient } from "../src/api/mobile-api-client";
import {
  getMobileChannelMessageThreadQueryOptions,
  getMobileDMMessageThreadQueryOptions,
} from "../src/query/mobile-message-thread-query";

const client: MobileApiClient = {
  requestJson: async () => {
    throw new Error("Thread query functions must not run while inspecting options.");
  },
};

test("thread query options use a parent-scoped key and fail closed without both identifiers", () => {
  const channel = getMobileChannelMessageThreadQueryOptions(client, "channel-1", "message-1");
  const dm = getMobileDMMessageThreadQueryOptions(client, "conversation-1", "message-1");

  assert.deepEqual(channel.queryKey, ["mobile", "channel-thread", "channel-1", "message-1"]);
  assert.deepEqual(dm.queryKey, ["mobile", "dm-thread", "conversation-1", "message-1"]);
  assert.equal(getMobileChannelMessageThreadQueryOptions(client, "", "message-1").enabled, false);
  assert.equal(getMobileDMMessageThreadQueryOptions(client, "conversation-1", "").enabled, false);
});
