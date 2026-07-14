import type { MobileLocale } from "../locale/mobile-locale-preferences";
import { MOBILE_AVATAR_TINT_SLOT_COUNT } from "./palette";
import type { MobileAvatarTint, MobileTheme } from "./themes";

function hashMobileAvatarId(id: string): number {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getMobileAvatarTint(id: string, theme: MobileTheme): MobileAvatarTint {
  if (id.trim().length === 0) {
    throw new Error("Mobile avatar tint requires a non-empty identity ID.");
  }

  const { avatarTints } = theme;
  if (avatarTints.length !== MOBILE_AVATAR_TINT_SLOT_COUNT) {
    throw new Error(
      `Mobile avatar theme must define exactly ${MOBILE_AVATAR_TINT_SLOT_COUNT} stable avatar tints.`,
    );
  }

  const tint = avatarTints[hashMobileAvatarId(id) % MOBILE_AVATAR_TINT_SLOT_COUNT];
  if (!tint) {
    throw new Error("Mobile avatar tint lookup failed for the active theme.");
  }

  return tint;
}

export function getMobileAvatarInitials(name: string, locale: MobileLocale): string {
  const normalizedName = name.normalize("NFC").trim();
  if (!normalizedName) {
    return "?";
  }

  const words = normalizedName.split(/\s+/u);
  const firstWord = words[0] ?? "";
  const firstWordCodePoints = Array.from(firstWord);
  const uppercaseFirstWord = firstWord.toLocaleUpperCase(locale);
  const isUppercaseAcronym =
    firstWordCodePoints.length > 1 &&
    firstWord === uppercaseFirstWord &&
    firstWord !== firstWord.toLocaleLowerCase(locale);

  const rawInitials =
    words.length === 1 || isUppercaseAcronym
      ? firstWordCodePoints.slice(0, 2).join("")
      : [firstWordCodePoints[0], Array.from(words[1] ?? "")[0]].filter(Boolean).join("");

  return rawInitials.toLocaleUpperCase(locale);
}
