const MAX_USERNAME_LENGTH = 32;
const USERNAME_SANITIZE_REGEX = /[^a-zA-Z0-9_]/g;

const TURKISH_USERNAME_TRANSLITERATION: Record<string, string> = {
  "\u00e7": "c",
  "\u00c7": "C",
  "\u011f": "g",
  "\u011e": "G",
  "\u0131": "i",
  I: "I",
  "\u0130": "I",
  "\u00f6": "o",
  "\u00d6": "O",
  "\u015f": "s",
  "\u015e": "S",
  "\u00fc": "u",
  "\u00dc": "U",
};

export { MAX_USERNAME_LENGTH };

export function buildUsernameCandidate(baseUsername: string, suffix = "") {
  const safeBase = normalizeUsername(baseUsername);
  const safeSuffix = suffix.replace(USERNAME_SANITIZE_REGEX, "_").slice(0, MAX_USERNAME_LENGTH - 2);
  const sliceLength = MAX_USERNAME_LENGTH - safeSuffix.length;

  return `${safeBase.slice(0, Math.max(sliceLength, 2))}${safeSuffix}`;
}

export function normalizeUsername(rawValue: string): string {
  const asciiValue = rawValue
    .replace(
      /[\u00e7\u00c7\u011f\u011e\u0131I\u0130\u00f6\u00d6\u015f\u015e\u00fc\u00dc]/g,
      (character) => TURKISH_USERNAME_TRANSLITERATION[character] ?? character,
    )
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const normalized = asciiValue
    .toLowerCase()
    .replace(USERNAME_SANITIZE_REGEX, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_USERNAME_LENGTH);

  if (normalized.length >= 2) {
    return normalized;
  }

  return `whispr_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
