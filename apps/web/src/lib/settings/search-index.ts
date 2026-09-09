/**
 * Ayarlar araması — indeksin **kendisi değil**, indeksi üreten yer.
 *
 * Sapma #7: referans HTML statik bir `SET_HITS` dizisi taşıyor ve o dizi var olmayan bir sekmeye
 * (`'notif', 'ozet'`) işaret ediyor. Sabit bir isabet listesi ağaçtan bir gün sonra ayrışır ve
 * kullanıcıyı boş bir sekmeye götürür; bu yüzden burada tek bir dizi yok, `SETTINGS_TREE`
 * üzerinde bir gezinti var. Ağaca satır eklendiği an indeks o satırı da tanır.
 *
 * İndeks **metin taşır**, anahtar değil: eşleme çözülmüş metin üzerinde yapılır, çünkü kullanıcı
 * `settings.row.nd1.title` yazmıyor, `bildirim` yazıyor. Anahtarlar da kayıtta durur — sonuç
 * satırının `Bölüm › Grup` yolu onlardan kurulur, sabit Türkçe metinden değil.
 */

import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";
import { walkSettingsRows } from "@/lib/settings/tree";

/** `(key, values?) => string` — `locale-provider`'ın `t`'si. */
export type SettingsTranslator = (key: string, values?: Record<string, number | string>) => string;

export type SettingsSearchEntry = {
  rowKey: string;
  section: SettingsSection;
  tab: SettingsTab;
  /** Sonuç yolunun ilk parçası. */
  sectionLabelKey: string;
  /** Grubu başlıksız satırlarda yolun ikinci parçası. */
  tabLabelKey: string;
  /**
   * `custom` satırlarının kendi başlığı yoktur (özel blok kendi başlığını çizer); onlarda grup
   * başlığı, o da yoksa sekme etiketi kullanılır. Kayıt böylece her zaman gösterilebilir bir
   * ada sahip olur ve 169 satırın hiçbiri indeksin dışında kalmaz.
   */
  titleKey: string;
  descriptionKey?: string;
  groupTitleKey?: string;
  /** Eşleme için normalize edilmiş başlık. */
  title: string;
  /** Normalize edilmiş açıklama; yoksa boş dize. */
  description: string;
  /** Normalize edilmiş grup başlığı; yoksa boş dize. */
  group: string;
  /** Normalize edilmiş seçenek etiketleri, boşlukla birleşik. */
  options: string;
  /** Eşleme için normalize edilmiş metin: başlık + açıklama + grup başlığı + seçenekler. */
  haystack: string;
  /** Ağaçtaki sıra — eşit skorların kırıcısı. */
  order: number;
};

/**
 * Türkçe uyumlu normalizasyon (§6'daki tuzak).
 *
 * `"İ".toLowerCase()` çoğu ortamda `i` + `U+0307` (birleşik nokta) üretir, `"I".toLowerCase()`
 * ise `i` verir ama Türkçede `ı` olmalıdır. `toLocaleLowerCase("tr")` ikinci yarıyı düzeltir,
 * birinciyi düzeltmez — geriye biri noktalı biri noktasız iki `i` kalır ve `BILDIRIM` yazan
 * kullanıcı `bildirim` satırını bulamaz.
 *
 * Üç adım bunu kapatır: `tr` küçültme → `ı`'yı `i`'ye katla → NFD ayrıştır ve birleşik işaretleri
 * (nokta, sedilla, breve, umlaut) düşür. `ş/ğ/ç/ö/ü` üçüncü adımda ASCII karşılığına iner;
 * `ı` ayrıştırılamayan tek harf olduğu için elle katlanır.
 */
const COMBINING_MARKS = /\p{M}/gu;
const DOTLESS_I = /ı/gu;

export function normalizeSettingsSearchText(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .replace(DOTLESS_I, "i")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Sözlükte karşılığı olmayan anahtar `t` tarafından kendisi olarak döner; onu metin sayma. */
function translated(t: SettingsTranslator, key: string | undefined): string {
  if (!key) return "";

  const value = t(key);

  return value === key ? "" : value;
}

/**
 * `SETTINGS_TREE`'nin 169 satırının tamamı için bir kayıt üretir. Sıra ağacın sırasıdır ve
 * `order` alanı onu sabitler: eşit skorlu iki sonucun hangisinin önce çıkacağı bu yüzden
 * `Array.prototype.sort`'un kararlılığına değil, açık bir sayıya bağlıdır.
 */
export function buildSettingsSearchIndex(t: SettingsTranslator): SettingsSearchEntry[] {
  const entries: SettingsSearchEntry[] = [];

  for (const { section, tab, group, row } of walkSettingsRows()) {
    const titleKey = row.titleKey ?? group.titleKey ?? tab.labelKey;
    const title = translated(t, titleKey);
    const description = translated(t, row.descriptionKey);
    const groupTitle = translated(t, group.titleKey);
    const options = (row.options ?? []).map((option) => translated(t, option)).join(" ");

    const entry: SettingsSearchEntry = {
      description: normalizeSettingsSearchText(description),
      group: normalizeSettingsSearchText(groupTitle),
      haystack: normalizeSettingsSearchText(
        [title, description, groupTitle, options].filter(Boolean).join(" "),
      ),
      options: normalizeSettingsSearchText(options),
      order: entries.length,
      rowKey: row.key,
      section: section.key,
      sectionLabelKey: section.labelKey,
      tab: tab.key,
      tabLabelKey: tab.labelKey,
      title: normalizeSettingsSearchText(title),
      titleKey,
      ...(row.descriptionKey ? { descriptionKey: row.descriptionKey } : {}),
      ...(group.titleKey ? { groupTitleKey: group.titleKey } : {}),
    };

    entries.push(entry);
  }

  return entries;
}
