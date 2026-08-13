import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileCopy } from "../src/locale/mobile-copy";
import { mobileProfileAvatarEditorCopy } from "../src/locale/mobile-profile-avatar-editor-copy";

/**
 * TypeScript already forces the two dictionaries to share a shape, so a *missing*
 * key cannot compile. What it cannot catch is a key that shipped with the other
 * language's text in it — an English sentence sitting in `tr`, or Turkish left in
 * `en` — which is what an untranslated string actually looks like in this repo.
 */
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Multi-word strings that are legitimately identical in both languages. Single
 * tokens (brand names, "GIF", "E2E", "DM", "Spam") are excluded by rule below
 * rather than listed here, so this stays short.
 */
const SHARED_BY_DESIGN = new Set([
  "authWelcomeCopyrightTemplate",
  "securitySettingsSessionClientDesktop",
  "securitySettingsSessionClientMobile",
  "sharedMediaVideoLabelTemplate",
  // "{name} · {px} px" — a step name, a number and the unit symbol. "px" is not
  // translated in either language, so the two dictionaries are identical on
  // purpose rather than by omission.
  "appearanceSettingsMessageFontSizeValue",
]);

/** Placeholder-only templates and lone tokens carry no prose to translate. */
function hasTranslatableProse(value: string): boolean {
  const prose = value.replace(/\{[^}]+\}/g, "").trim();

  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(prose)) {
    return false;
  }

  return prose.includes(" ") || prose.length > 6;
}

function flatten(prefix: string, value: unknown, out: Map<string, string>) {
  if (typeof value === "string") {
    out.set(prefix, value);
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(prefix ? `${prefix}.${key}` : key, child, out);
    }
  }
}

function flattenLocale(locale: "en" | "tr"): Map<string, string> {
  const out = new Map<string, string>();
  flatten("", mobileCopy[locale] as unknown, out);
  return out;
}

describe("mobile copy parity", () => {
  const tr = flattenLocale("tr");
  const en = flattenLocale("en");

  it("ships the same key set in both languages", () => {
    assert.deepEqual(
      [...tr.keys()].filter((key) => !en.has(key)),
      [],
      "keys present in tr but missing from en",
    );
    assert.deepEqual(
      [...en.keys()].filter((key) => !tr.has(key)),
      [],
      "keys present in en but missing from tr",
    );
    assert.ok(tr.size > 1_000, "copy dictionary unexpectedly small");
  });

  it("never leaves Turkish text in the English dictionary", () => {
    const leaked = [...en].filter(([, value]) => TURKISH_LETTERS.test(value)).map(([key]) => key);

    assert.deepEqual(leaked, [], "English copy still contains Turkish characters");
  });

  it("keeps only deliberately shared strings identical across languages", () => {
    const identical = [...tr]
      .filter(([key, value]) => {
        if (SHARED_BY_DESIGN.has(key.split(".").at(-1) ?? key)) {
          return false;
        }

        return en.get(key) === value && hasTranslatableProse(value);
      })
      .map(([key, value]) => `${key}="${value}"`);

    assert.deepEqual(identical, [], "identical tr/en strings look untranslated");
  });

  it("holds the avatar-editor dictionary to the same rules", () => {
    const editorTr = new Map(Object.entries(mobileProfileAvatarEditorCopy.tr));
    const editorEn = new Map(Object.entries(mobileProfileAvatarEditorCopy.en));

    assert.deepEqual([...editorTr.keys()].sort(), [...editorEn.keys()].sort());
    assert.deepEqual(
      [...editorEn].filter(([, value]) => TURKISH_LETTERS.test(value)).map(([key]) => key),
      [],
    );
    assert.deepEqual(
      [...editorTr]
        .filter(([key, value]) => editorEn.get(key) === value && hasTranslatableProse(value))
        .map(([key]) => key),
      [],
    );
  });
});
