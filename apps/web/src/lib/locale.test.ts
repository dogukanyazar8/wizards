import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWhisprVersionPayload, WHISPR_RELEASE_NOTES } from "./app-version";
import { APP_LOCALES, APP_MESSAGES } from "./locale";

describe("locale dictionaries", () => {
  it("keeps EN and TR translation keys in parity", () => {
    assert.deepEqual(Object.keys(APP_MESSAGES.tr).sort(), Object.keys(APP_MESSAGES.en).sort());
  });

  it("keeps update release notes localizable and fallback-safe", () => {
    assert.equal(WHISPR_RELEASE_NOTES.length, 4);

    for (const note of WHISPR_RELEASE_NOTES) {
      assert.ok(note.fallbackCategory?.trim());
      assert.ok(note.fallbackDescription?.trim());
      assert.ok(note.fallbackTitle?.trim());

      for (const locale of APP_LOCALES) {
        assert.ok(APP_MESSAGES[locale][note.categoryKey], `${locale}:${note.categoryKey}`);
        assert.ok(APP_MESSAGES[locale][note.descriptionKey], `${locale}:${note.descriptionKey}`);
        assert.ok(APP_MESSAGES[locale][note.titleKey], `${locale}:${note.titleKey}`);
      }
    }
  });

  it("localizes update payload text for clients without the latest locale bundle", () => {
    const [firstSourceNote] = WHISPR_RELEASE_NOTES;
    const [firstLocalizedNote] = getWhisprVersionPayload("tr").notes;

    assert.ok(firstSourceNote);
    assert.ok(firstLocalizedNote);
    assert.equal(firstLocalizedNote.categoryKey, APP_MESSAGES.tr[firstSourceNote.categoryKey]);
    assert.equal(
      firstLocalizedNote.descriptionKey,
      APP_MESSAGES.tr[firstSourceNote.descriptionKey],
    );
    assert.equal(firstLocalizedNote.titleKey, APP_MESSAGES.tr[firstSourceNote.titleKey]);
  });
});
