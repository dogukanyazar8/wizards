import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const MESSAGE_SERVICE = readFileSync(
  fileURLToPath(new URL("./message-service.ts", import.meta.url)),
  "utf8",
);
const SEND_SERVICE = readFileSync(
  fileURLToPath(new URL("./channel-message-send-service.ts", import.meta.url)),
  "utf8",
);

describe("channel poll persistence contract", () => {
  it("writes the poll in the channel message transaction and maps it to ChatMessage", () => {
    assert.match(MESSAGE_SERVICE, /await tx\.poll\.create\(/u);
    assert.match(MESSAGE_SERVICE, /messageId: createdMessage\.id/u);
    assert.match(MESSAGE_SERVICE, /poll: \{ select: POLL_SELECT \}/u);
    assert.match(
      MESSAGE_SERVICE,
      /poll: message\.poll \? mapPollToDTO\(message\.poll, viewerId\) : null/u,
    );
  });

  it("routes creation through the existing permission and fanout service", () => {
    assert.match(SEND_SERVICE, /poll\?:/u);
    assert.match(SEND_SERVICE, /poll: args\.poll \?\? null/u);
  });
});
