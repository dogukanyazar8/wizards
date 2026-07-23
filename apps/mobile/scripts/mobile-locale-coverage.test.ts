import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mobileCopy } from "../src/locale/mobile-copy";

/**
 * Every user-visible string has to follow the language the user picked. Copy
 * either lives in `src/locale/mobile-copy.ts` or in a screen-local table keyed
 * by locale; a bare literal in a component follows neither and would show one
 * language to both audiences.
 */

/**
 * Nothing outside `src/locale` may keep its own locale table any more — every
 * screen resolves its copy from `mobileCopy[locale]`.
 */
const LOCALE_TABLE_OWNERS: readonly string[] = [];

const COPY_ATTRIBUTES = [
  "accessibilityLabel",
  "body",
  "confirmLabel",
  "description",
  "emptyDescription",
  "emptyTitle",
  "label",
  "placeholder",
  "subtitle",
  "title",
] as const;

const JSX_TEXT = />\s*([A-Za-zÇĞİÖŞÜçğıöşü][^<>{}\n]{2,})\s*</g;
const COPY_ATTRIBUTE = new RegExp(`\\b(${COPY_ATTRIBUTES.join("|")})\\s*=\\s*"([^"\\n]{3,})"`, "g");
const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/;
/** A `tr:`/`en:` block whose first entry is a string is a copy table. */
const LOCALE_TABLE = /\r?\n\s+(?:tr|en):\s*\{\r?\n\s+[A-Za-z_$][\w$]*:\s*["`]/;
/** Brand and format names read the same in both languages. */
const LANGUAGE_NEUTRAL = new Set(["Whispr", "GIF", "Whispr Mobil"]);

function isUserFacingCopy(value: string): boolean {
  const trimmed = value.trim();
  if (LANGUAGE_NEUTRAL.has(trimmed) || trimmed.length < 3) {
    return false;
  }
  if (/[{}()[\]=&|<>$`]/.test(trimmed) || /^[a-z0-9-]+$/.test(trimmed)) {
    return false;
  }
  return TURKISH_LETTER.test(trimmed) || /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(trimmed);
}

function findHardcodedCopy(source: string): string[] {
  const found: string[] = [];

  for (const match of source.matchAll(JSX_TEXT)) {
    const value = match[1];
    if (value !== undefined && isUserFacingCopy(value)) {
      found.push(value.trim());
    }
  }
  for (const match of source.matchAll(COPY_ATTRIBUTE)) {
    const value = match[2];
    if (value !== undefined && isUserFacingCopy(value)) {
      found.push(`${match[1]}="${value.trim()}"`);
    }
  }

  return found;
}

describe("mobile locale coverage", () => {
  it("keeps user-visible copy out of component literals", () => {
    const owners = new Set<string>(LOCALE_TABLE_OWNERS);
    const offenders: string[] = [];

    for (const file of globSync("src/**/*.tsx", { cwd: process.cwd() })) {
      const relativePath = file.split("\\").join("/");
      if (owners.has(relativePath)) {
        continue;
      }

      for (const value of findHardcodedCopy(readFileSync(join(process.cwd(), file), "utf8"))) {
        offenders.push(`${relativePath}: ${value}`);
      }
    }

    assert.deepEqual(offenders, []);
  });

  it("keeps screen-local locale tables out of the tree", () => {
    const offenders: string[] = [];

    for (const file of globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() })) {
      const relativePath = file.split("\\").join("/");
      if (relativePath.startsWith("src/locale/")) {
        continue;
      }

      const source = readFileSync(join(process.cwd(), file), "utf8");
      if (LOCALE_TABLE.test(source)) {
        offenders.push(relativePath);
      }
    }

    assert.deepEqual(offenders, LOCALE_TABLE_OWNERS);
  });

  it("serves the shared copy for both languages", () => {
    assert.equal(mobileCopy.tr.workspaceServerSwitcherTitle, "Sunucuların");
    assert.equal(mobileCopy.en.workspaceServerSwitcherTitle, "Your servers");
    assert.equal(mobileCopy.tr.voiceRoomLiveTitle, "Canlı ses odası");
    assert.equal(mobileCopy.en.voiceRoomLiveTitle, "Live voice room");
    assert.equal(mobileCopy.tr.settingsWorkspaceLayoutRailOption, "Sol ray");
    assert.equal(mobileCopy.en.settingsWorkspaceLayoutRailOption, "Left rail");
  });
});
