export const DEFAULT_APP_ICON_ID = "wave-5";

export const APP_ICON_OPTIONS = [
  {
    id: "wave-5",
    src: "/app-icons/wave-5.png",
    labelKey: "settings.appearance.icons.wave5",
  },
  {
    id: "wave-4",
    src: "/app-icons/wave-4.png",
    labelKey: "settings.appearance.icons.wave4",
  },
  {
    id: "wave-3",
    src: "/app-icons/wave-3.png",
    labelKey: "settings.appearance.icons.wave3",
  },
  {
    id: "wave-2",
    src: "/app-icons/wave-2.png",
    labelKey: "settings.appearance.icons.wave2",
  },
  {
    id: "wave-1",
    src: "/app-icons/wave-1.png",
    labelKey: "settings.appearance.icons.wave1",
  },
  {
    id: "wave-0",
    src: "/app-icons/wave-0.png",
    labelKey: "settings.appearance.icons.wave0",
  },
] as const;

export type AppIconId = (typeof APP_ICON_OPTIONS)[number]["id"];

export function isAppIconId(value: unknown): value is AppIconId {
  return (
    typeof value === "string" &&
    APP_ICON_OPTIONS.some((option) => option.id === value)
  );
}

export function getAppIconById(iconId: string | null | undefined) {
  return (
    APP_ICON_OPTIONS.find((option) => option.id === iconId) ??
    APP_ICON_OPTIONS.find((option) => option.id === DEFAULT_APP_ICON_ID) ??
    APP_ICON_OPTIONS[0]
  );
}
