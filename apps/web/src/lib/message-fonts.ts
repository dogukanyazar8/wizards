export const DEFAULT_MESSAGE_FONT_ID = "outfit";

export const MESSAGE_FONT_OPTIONS = [
  {
    family: "var(--font-message-open-sans), var(--font-sans), sans-serif",
    id: "open-sans",
    label: "Open Sans",
  },
  {
    family: "var(--font-message-inter), var(--font-sans), sans-serif",
    id: "inter",
    label: "Inter",
  },
  {
    family: "var(--font-message-raleway), var(--font-sans), sans-serif",
    id: "raleway",
    label: "Raleway",
  },
  {
    family: "var(--font-message-outfit), var(--font-sans), sans-serif",
    id: "outfit",
    label: "Outfit",
  },
] as const;

export type MessageFontId = (typeof MESSAGE_FONT_OPTIONS)[number]["id"];

const MESSAGE_FONT_IDS = new Set<string>(MESSAGE_FONT_OPTIONS.map((option) => option.id));

export function isMessageFontId(value: unknown): value is MessageFontId {
  return typeof value === "string" && MESSAGE_FONT_IDS.has(value);
}

export function normalizeMessageFontId(value: unknown): MessageFontId {
  return isMessageFontId(value) ? value : DEFAULT_MESSAGE_FONT_ID;
}

export function getMessageFontFamily(value: unknown) {
  const fontId = normalizeMessageFontId(value);
  return (
    MESSAGE_FONT_OPTIONS.find((option) => option.id === fontId)?.family ??
    MESSAGE_FONT_OPTIONS.find((option) => option.id === DEFAULT_MESSAGE_FONT_ID)?.family ??
    "var(--font-sans), sans-serif"
  );
}

export function applyMessageFontToDocument(value: unknown) {
  if (typeof document === "undefined") {
    return;
  }

  const target = document.body ?? document.documentElement;
  target.style.setProperty("--whispr-message-font", getMessageFontFamily(value));
}
