import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("mobile Phase 3 social contract", () => {
  it("binds the friends segment and account actions to production test IDs", () => {
    const dm = read("../src/app/screens/dm-screen.tsx");
    const friends = read("../src/social/friends-hub.tsx");
    const account = read("../src/social/social-account-screens.tsx");
    for (const testId of ["mobile-social-segment-friends", "mobile-friends-screen", "mobile-friend-request-submit", "mobile-presence-sheet", "mobile-profile-edit-screen", "mobile-blocked-users-screen"]) {
      assert.equal(`${dm}\n${friends}\n${account}`.includes(testId), true, `Missing ${testId}`);
    }
  });

  it("keeps social state remote-only and maps verified socket events narrowly", () => {
    const query = read("../src/social/mobile-social-query.ts");
    const realtime = read("../src/realtime/mobile-realtime-contract.ts");
    assert.equal(/AsyncStorage|persistQueryClient|offline/i.test(query), false);
    assert.match(realtime, /"friends:updated"/);
    assert.match(realtime, /"presence:update"/);
    assert.match(realtime, /"user:profile:updated"/);
  });

  it("uses the bounded M2 avatar upload and claim contract without a direct profile mutation", () => {
    const account = read("../src/social/social-account-screens.tsx");
    const avatarEditor = read("../src/social/mobile-profile-avatar-editor.tsx");
    assert.match(account, /MobileProfileAvatarEditor/);
    assert.match(avatarEditor, /useMobileImageUpload/);
    assert.match(avatarEditor, /purpose: "profile-avatar"/);
    assert.match(avatarEditor, /patchMobileProfileAvatarCaches/);
    assert.equal(/fetch\(|requestJson\([^)]*avatar/i.test(`${account}\n${avatarEditor}`), false);
  });
});
