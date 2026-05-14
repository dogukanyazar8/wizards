import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractMentionUsernames } from "./message-notification-service";

describe("workspace message notification service", () => {
  it("extracts unique mention usernames case-insensitively", () => {
    assert.deepEqual(extractMentionUsernames("hi @Ada and (@Bora) and @ada"), ["ada", "bora"]);
  });

  it("ignores emails, short names, and invalid mention characters", () => {
    assert.deepEqual(extractMentionUsernames("mail ada@example.com @a @valid_user @"), [
      "valid_user",
    ]);
  });

  it("keeps reserved mass mention names out of username notifications", () => {
    assert.deepEqual(extractMentionUsernames("@everyone please ask @Ada or @here"), ["ada"]);
  });
});
