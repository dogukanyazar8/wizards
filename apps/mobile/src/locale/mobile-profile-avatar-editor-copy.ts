import type { MobileLocale } from "./mobile-copy";

type MobileProfileAvatarEditorLabels = Readonly<{
  failed: string;
  picker: string;
  ready: string;
  retry: string;
  syncFailed: string;
  syncing: string;
  uploading: string;
}>;

export const mobileProfileAvatarEditorCopy: Readonly<
  Record<MobileLocale, MobileProfileAvatarEditorLabels>
> = {
  en: {
    picker: "Choose avatar",
    ready: "Avatar ready.",
    retry: "Retry avatar upload",
    failed: "Avatar upload could not be completed.",
    syncFailed: "Avatar could not be synchronized.",
    syncing: "Avatar updated. It may take a moment to sync locally.",
    uploading: "Uploading avatar...",
  },
  tr: {
    picker: "Avatar seç",
    ready: "Avatar hazır.",
    retry: "Avatar yüklemeyi tekrar dene",
    failed: "Avatar yüklemesi tamamlanamadı.",
    syncFailed: "Avatar eşitlenemedi.",
    syncing: "Avatar güncellendi. Yerel olarak eşitlenmesi biraz zaman alabilir.",
    uploading: "Avatar yükleniyor...",
  },
};
