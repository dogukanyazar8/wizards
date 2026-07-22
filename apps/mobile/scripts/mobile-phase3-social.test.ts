import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("mobile Phase 3 social contract", () => {
  it("binds the friends segment and account actions to production test IDs", () => {
    const dm = read("../src/app/screens/dm-screen.tsx");
    const dmInbox = read("../src/app/screens/dm-inbox.tsx");
    const friends = read("../src/social/friends-hub.tsx");
    const account = read("../src/social/social-account-screens.tsx");
    const sources = `${dm}\n${dmInbox}\n${friends}\n${account}`;
    // 9d replaced the username submit form with live search plus per-row actions.
    for (const testId of ["mobile-friends-screen", "mobile-friend-search-users-input", "mobile-friend-invite-card", "mobile-presence-sheet", "mobile-profile-edit-screen", "mobile-blocked-users-screen"]) {
      assert.equal(sources.includes(testId), true, `Missing ${testId}`);
    }
    // Segment ids are built from the segment union, so assert the template and its members.
    assert.match(dmInbox, /testID=\{`mobile-social-segment-\$\{candidate\}`\}/);
    assert.match(read("../src/app/screens/dm-screen.types.ts"), /"conversations" \| "friends" \| "requests"/);
  });

  it("keeps social state remote-only and maps verified socket events narrowly", () => {
    const query = read("../src/social/mobile-social-query.ts");
    const realtime = read("../src/realtime/mobile-realtime-contract.ts");
    // Case-sensitive so the OFFLINE presence literal is not read as offline persistence.
    assert.equal(/AsyncStorage|persistQueryClient|[Oo]ffline/.test(query), false);
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
