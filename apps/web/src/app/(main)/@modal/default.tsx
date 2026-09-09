/**
 * `@modal` yuvasının eşleşmeyen hâli.
 *
 * Yuva her rotada çözülmek zorunda; `/home` gibi yakalanmamış bir adreste hiçbir şey çizilmez.
 * Bu dosya olmadan Next tam sayfa yüklemelerinde yuvayı çözemez ve 404 verir.
 */
export default function SettingsModalSlotDefault() {
  return null;
}
