import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_MOBILE_LOCALE,
  MOBILE_LOCALE_OPTIONS,
  MOBILE_LOCALE_STORAGE_KEY,
  activeMobileCopy,
  loadMobileLocalePreference,
  normalizeMobileLocale,
  normalizeMobileLocalePreference,
  resolveMobileLocaleFromDeviceLocales,
  saveMobileLocalePreference,
  setActiveMobileLocale,
  type MobileLocalePreferenceStorage,
} from "../src/locale/mobile-locale-preferences";
import { mobileCopy } from "../src/locale/mobile-copy";

function createMemoryStorage(
  initialValue: string | null = null,
): MobileLocalePreferenceStorage & { value: string | null } {
  return {
    value: initialValue,
    async getItemAsync(key) {
      assert.equal(key, MOBILE_LOCALE_STORAGE_KEY);
      return this.value;
    },
    async setItemAsync(key, value) {
      assert.equal(key, MOBILE_LOCALE_STORAGE_KEY);
      this.value = value;
    },
  };
}

describe("mobile locale preferences", () => {
  it("keeps Turkish and English catalogs in exact key parity", () => {
    assert.deepEqual(Object.keys(mobileCopy.tr).sort(), Object.keys(mobileCopy.en).sort());
  });

  it("uses natural UTF-8 Turkish for the primary mobile navigation surfaces", () => {
    assert.equal(mobileCopy.tr.directMessageFilterAll, "Tümü");
    assert.equal(mobileCopy.tr.directMessageFilterUnread, "Okunmamış");
    assert.equal(mobileCopy.tr.directMessageSectionAll, "Tüm DM'ler");
    assert.equal(mobileCopy.tr.dmInboxDescription, "Sohbetlerin ve arkadaşların");
    assert.equal(mobileCopy.tr.dmSegmentConversations, "Sohbetler");
    assert.equal(mobileCopy.tr.socialSegmentConversations, "Konuşmalar");
    assert.equal(mobileCopy.tr.socialSegmentFriends, "Arkadaşlar");
    assert.equal(mobileCopy.tr.workspaceServerInviteShareAction, "Daveti paylaş");
    assert.equal(mobileCopy.tr.workspaceServerIconAction, "Sunucu simgesi seç");
    assert.equal(mobileCopy.tr.workspaceSectionExpandAction, "aç");
    assert.equal(mobileCopy.tr.workspaceSectionCollapseAction, "kapat");
  });

  it("does not regress localized mobile surfaces to ASCII Turkish or English-only copy", () => {
    const localizedSources = [
      "../src/account/mobile-two-factor-screen.tsx",
      "../src/app/components/kit/destructive-confirmation-sheet.tsx",
      "../src/app/components/kit/toast.tsx",
      "../src/app/screens/dm-conversation-screen.tsx",
      "../src/app/screens/dm-screen.tsx",
      "../src/app/screens/settings-screen.tsx",
      "../src/media/mobile-gif-picker.tsx",
      "../src/social/friends-hub.tsx",
      "../src/social/mobile-profile-avatar-editor.tsx",
      "../src/social/social-account-screens.tsx",
      "../src/workspace/mobile-channel-settings-screen.tsx",
      "../src/workspace/mobile-server-members-screen.tsx",
      "../src/workspace/mobile-server-settings-screen.tsx",
      "../src/workspace/mobile-workspace-editor-sheets.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    const source = localizedSources.join("\n");

    for (const staleCopy of [
      "Arkadas",
      "Cevrimici",
      "Dogrulama kodu",
      "GIF secici",
      "Gorunen ad",
      "Henuz",
      "Kullanici adi",
      "Konusmalar",
      "Sohbet detaylari",
      'accessibilityLabel="Conversation details"',
      'accessibilityLabel="Dismiss notification"',
      'label="Cancel"',
    ]) {
      assert.equal(source.includes(staleCopy), false, `Stale mobile copy found: ${staleCopy}`);
    }
  });

  it("normalizes manual and device preferences fail-closed to Turkish", () => {
    assert.equal(DEFAULT_MOBILE_LOCALE, "tr");
    assert.deepEqual(
      MOBILE_LOCALE_OPTIONS.map((option) => option.id),
      ["en", "tr"],
    );
    assert.equal(normalizeMobileLocale("tr"), "tr");
    assert.equal(normalizeMobileLocale("en"), "en");
    assert.equal(normalizeMobileLocale("de"), "tr");
    assert.equal(normalizeMobileLocale(undefined), "tr");
    assert.deepEqual(normalizeMobileLocalePreference("tr"), { locale: "tr", mode: "manual" });
    assert.deepEqual(normalizeMobileLocalePreference("device:en"), {
      manualLocale: "en",
      mode: "device",
    });
    assert.deepEqual(normalizeMobileLocalePreference("device:de"), {
      manualLocale: "tr",
      mode: "device",
    });
    assert.deepEqual(normalizeMobileLocalePreference("unsafe"), { locale: "tr", mode: "manual" });
  });

  it("loads legacy preferences, retains the manual locale in device mode, and saves without exposing session data", async () => {
    const storage = createMemoryStorage("en");

    assert.deepEqual(await loadMobileLocalePreference(storage), { locale: "en", mode: "manual" });
    await saveMobileLocalePreference(storage, { manualLocale: "tr", mode: "device" });

    assert.equal(storage.value, "device:tr");
    assert.deepEqual(await loadMobileLocalePreference(createMemoryStorage("unsafe")), {
      locale: "tr",
      mode: "manual",
    });
  });

  it("uses the first supported device language and safely falls back to Turkish", () => {
    assert.equal(
      resolveMobileLocaleFromDeviceLocales([{ languageCode: "de" }, { languageCode: "en" }]),
      "en",
    );
    assert.equal(resolveMobileLocaleFromDeviceLocales([{ languageCode: "de" }]), "tr");
  });

  it("drives the active mobile copy from the selected locale", () => {
    setActiveMobileLocale("en");
    assert.equal(activeMobileCopy.settingsTitle, "Settings");

    setActiveMobileLocale("tr");
    assert.equal(activeMobileCopy.settingsTitle, "Ayarlar");
  });
});
