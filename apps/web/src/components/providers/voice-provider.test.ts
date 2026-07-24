import assert from "node:assert/strict";
import test from "node:test";
import { mergeVoiceCurrentUserProfile } from "./voice-provider";

const currentUser = {
  avatarUrl: "https://cdn.example.com/avatar.png",
  displayName: "Current display name",
  id: "user-1",
  username: "current-user",
};

test("voice profile merge preserves omitted fields and clears an explicit display name", () => {
  assert.deepEqual(mergeVoiceCurrentUserProfile(currentUser, { username: "renamed-user" }), {
    ...currentUser,
    username: "renamed-user",
  });

  assert.deepEqual(
    mergeVoiceCurrentUserProfile(currentUser, {
      displayName: null,
      username: "renamed-user",
    }),
    {
      ...currentUser,
      displayName: "renamed-user",
      username: "renamed-user",
    },
  );
});
