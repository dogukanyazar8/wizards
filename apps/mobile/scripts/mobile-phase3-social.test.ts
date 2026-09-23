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
    // Profil düzenleme ekranı `mobile-profile-edit-screen.tsx`e taşındı; eski
    // `social-account-screens` kopyası kaldırıldı, sözleşme canlı ekrandan okunur.
    const profileEdit = read("../src/social/mobile-profile-edit-screen.tsx");
    const sources = `${dm}\n${dmInbox}\n${friends}\n${account}\n${profileEdit}`;
    // 9d replaced the username submit form with live search plus per-row actions.
    // §2 "1c" then folded that search into the tab band and dropped the invite
    // card, so the requests tab is the three groups the design draws and nothing
    // else — user lookup now rides `mobile-dm-search-input`.
    for (const testId of [
      "mobile-friends-screen",
      "mobile-dm-search-input",
      "mobile-presence-sheet",
      "mobile-profile-edit-screen",
      "mobile-blocked-users-screen",
    ]) {
      assert.equal(sources.includes(testId), true, `Missing ${testId}`);
    }
    for (const removedTestId of ["mobile-friend-invite-card", "mobile-friend-search-users-input"]) {
      assert.equal(sources.includes(removedTestId), false, `Unexpected ${removedTestId}`);
    }
    // Segment ids are built from the segment union, so assert the template and its members.
    assert.match(dmInbox, /testID=\{`mobile-social-segment-\$\{candidate\}`\}/);
    assert.match(
      read("../src/app/screens/dm-screen.types.ts"),
      /"conversations" \| "friends" \| "requests"/,
    );
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
    const profileEdit = read("../src/social/mobile-profile-edit-screen.tsx");
    const avatarEditor = read("../src/social/mobile-profile-avatar-editor.tsx");
    // Canlı ekran avatarı kendi içinde `useMobileImageUpload` ile yüklüyor; editör
    // bileşeni aynı sınırlı sözleşmeyi ayrı yüzey olarak koruyor.
    assert.match(profileEdit, /useMobileImageUpload/);
    assert.match(profileEdit, /purpose: target === "avatar" \? "profile-avatar"/);
    assert.match(avatarEditor, /useMobileImageUpload/);
    assert.match(avatarEditor, /purpose: "profile-avatar"/);
    assert.match(avatarEditor, /patchMobileProfileAvatarCaches/);
    assert.equal(
      /fetch\(|requestJson\([^)]*avatar/i.test(`${profileEdit}\n${avatarEditor}`),
      false,
    );
  });
});
