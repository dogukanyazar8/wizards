/**
 * Ayarlar penceresinin içerik ağacı — güncel sayımlar SETTINGS_TREE_COUNTS içinde.
 *
 * `design_handoff/app_new/ayarlar-paketi/referans/Ayarlar-referans.dc.html` içindeki `SET` dizisinden
 * **birebir** çıkarıldı; sıralama, gruplama ve metin referansın kendisidir. Bu dosya Ş7–Ş10'un
 * tek girdi kaynağıdır: hiçbir bölüm kendi satır listesini elle yazmaz, yoksa "166 satırın hepsi
 * çizili mi" sorusunun tek bir cevabı kalmaz.
 *
 * Ağaç **metin taşımaz**, i18n anahtarı taşır. Referanstaki Türkçe dizeler
 * `lib/locale/messages/tr.ts` içinde birebir durur ve `settings-screen-copy.test.ts` ikisini
 * karşılaştırır.
 *
 * Referansta veri olan yerler anahtar değil **alan adı** taşır (`descriptionData`, `titleData`,
 * `badgeData`). `ae` satırının açıklaması `dogukan@whispr.app`, `s2`'ninki `10 kod · 8 tanesi
 * kullanılmadı` — bunlar çeviri değil, hesabın kendisi. Sözlüğe yazılsalardı demo veri ürüne
 * sızardı; burada Ş7–Ş10'a "bu satırın alt metnini şu alandan doldur" diyen bir işaret olur.
 *
 * ## Aynı anahtarın iki kez geçtiği yerler
 *
 * - `nd2`, `na5`, `na6`, `nq1`, `ns1` — Genel sekmesi ile ayrıntı sekmesinde **aynı** durumdur
 *   (tuzak #4). `sharedTabs` diğer geçişin sekmesini adlandırır. `np4` bu listede **yoktur**:
 *   panelin `Mesaj içeriğini göster` satırı `na6`'dan ayrı bir tercihtir.
 * - `o1` / `o2` — Hesabım › Güvenlik ile Hakkında'da rastlantısal olarak aynı harfi taşıyor.
 *   İkisi de durum tutmayan satırlar (`custom` ve `action`), bu yüzden çakışma zararsızdır;
 *   `tree.test.ts` bunu bir kural olarak sabitler.
 *
 * Hareket tercihi Medya sekmesinde tek bir kontrolle sunulur.
 */

import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";
import { PROFILE_BIO_MAX_LENGTH, PROFILE_STATUS_MAX_LENGTH } from "@wizards/types";

/** SPEC §4.4 — on üç kontrol tipi. Her ayar için elle markup yazmak yasak. */
export type SettingsControlType =
  | "toggle"
  | "lockedToggle"
  | "select"
  | "segment"
  | "slider"
  | "input"
  | "textarea"
  | "action"
  | "risky"
  | "sound"
  | "jump"
  | "nav"
  | "custom";

/** PLAN §7.2 — yirmi özel blok yuvası. */
export type SettingsBlockKey =
  | "hero"
  | "profileEmoji"
  | "connections"
  | "secEvents"
  | "sessions"
  | "badges"
  | "mic"
  | "camera"
  | "themes"
  | "themeGrid"
  | "msgPreview"
  | "notifSummary"
  | "exceptions"
  | "shortcuts"
  | "perms"
  | "diag"
  | "about"
  | "version"
  | "whatsNew"
  | "contributors";

/** SPEC §5.1 — satır içinde açılan üç riskli akış. Aynı anda yalnız biri açık (tuzak #12). */
export type SettingsRiskyBlockKey = "email" | "phone" | "password" | "twoFactor" | "deleteAccount";

/**
 * Ton **token adının kısaltmasıdır**, renk değil: tüketici `--success` / `--warning` /
 * `--danger` / `--info` / `--text-muted` token'ına çevirir.
 */
export type SettingsTone = "success" | "warning" | "danger" | "muted" | "info";

export type SettingsActionDef = {
  labelKey: string;
  kind?: "primary" | "danger";
  disabled?: boolean;
};

export type SettingsRowDef = {
  /** Native-only controls stay out of shared web settings surfaces. */
  desktopOnly?: boolean;
  /** Referanstaki anahtar (`pn`, `nt3`, `ns1` …). Bölüm içinde tekildir. */
  key: string;
  type: SettingsControlType;
  /** `custom` satırlarında yok: özel blok kendi başlığını çizer. */
  titleKey?: string;
  descriptionKey?: string;
  /** Açıklama çalışma zamanı verisiyse anahtar değil, alanın adı. */
  descriptionData?: string;
  badgeKey?: string;
  badgeData?: string;
  tone?: SettingsTone;
  /** `toggle` / `sound` → boolean · `select` / `segment` → seçenek dizini · `slider` → sayı. */
  defaultValue?: boolean | number | string;
  /** `select` / `segment` seçeneklerinin i18n anahtarları. */
  options?: readonly string[];
  /**
   * Ekran paylaşımı K2 — çalışma zamanı kapısına bağlı seçenek: seçenek dizini → kapalıyken
   * çizilecek açıklamanın anahtarı. Hangi seçeneğin **o an** kapalı olduğunu ağaç bilemez;
   * bölüm şeridi söyler (`e1` için `screenShare4kAllowed`). Anahtar `collectSettingsCopyKeys()`
   * ile sözlük sözleşmesine girer.
   */
  optionGateKeys?: Readonly<Record<number, string>>;
  /** `slider`: [min, max, birim]. Birim referanstaki biçimiyle (` ms`, ` px`, `%`). */
  range?: readonly [number, number, string];
  actions?: readonly SettingsActionDef[];
  /** `input` önekinin anahtarı (`@`). */
  prefixKey?: string;
  /** `textarea` sayacının üst sınırı. */
  maxLength?: number;
  sound?: { profile: "whispr" | "classic"; volume: number };
  navLabelKey?: string;
  riskyBlock?: SettingsRiskyBlockKey;
  block?: SettingsBlockKey;
  target?: { section: SettingsSection; tab: SettingsTab };
  /** Tuzak #4 — aynı anahtarın geçtiği **diğer** sekmeler. */
  sharedTabs?: readonly SettingsTab[];
  /** SPEC_DEVIATIONS #4 — iki anahtarın paylaştığı tek tercih. */
  stateKey?: string;
  /** `lockedToggle`: sunucu her zaman `true` döner, PATCH'te gelirse 400. */
  locked?: true;
  /** SPEC_DEVIATIONS #9 — satır kendi başlığı altında çizilir, grubunu terk etmeden. */
  ownGroupTitleKey?: string;
};

export type SettingsGroupDef = {
  /** SPEC_DEVIATIONS #8 — hero ve Hakkında'nın ilk grubu başlıksız. */
  titleKey?: string;
  titleData?: string;
  noteKey?: string;
  noteData?: string;
  rows: readonly SettingsRowDef[];
};

export type SettingsTabDef = {
  key: SettingsTab;
  labelKey: string;
  groups: readonly SettingsGroupDef[];
};

export type SettingsSectionDef = {
  key: SettingsSection;
  labelKey: string;
  leadKey: string;
  /** SPEC §4.1 — sol navigasyonun üç grup etiketi. */
  group: "user" | "app" | "info";
  icon: string;
  /** K11 — yalnız Tauri çalışma zamanında listeye girer. */
  desktopOnly?: true;
  tabs: readonly SettingsTabDef[];
};

export const SETTINGS_TREE: readonly SettingsSectionDef[] = [
  {
    key: "account",
    labelKey: "settings.section.account.label",
    leadKey: "settings.section.account.lead",
    group: "user",
    icon: "user",
    tabs: [
      {
        key: "profile",
        labelKey: "settings.tab.account.profile",
        groups: [
          {
            rows: [
              {
                key: "hero",
                type: "custom",
                block: "hero",
              },
            ],
          },
          {
            titleKey: "settings.group.account.profile.2.title",
            noteKey: "settings.group.account.profile.2.note",
            rows: [
              {
                key: "pn",
                type: "input",
                titleKey: "settings.row.pn.title",
              },
              {
                key: "pu",
                type: "input",
                titleKey: "settings.row.pu.title",
                descriptionKey: "settings.row.pu.description",
                prefixKey: "settings.row.pu.prefix",
              },
              {
                key: "pbio",
                type: "textarea",
                titleKey: "settings.row.pbio.title",
                maxLength: PROFILE_BIO_MAX_LENGTH,
              },
            ],
          },
          {
            titleKey: "settings.group.account.profile.3.title",
            rows: [
              {
                key: "pp",
                type: "select",
                titleKey: "settings.row.pp.title",
                defaultValue: 1,
                options: [
                  "settings.option.pp.1",
                  "settings.option.pp.2",
                  "settings.option.pp.3",
                  "settings.option.pp.4",
                ],
              },
              {
                key: "ps",
                type: "custom",
                block: "profileEmoji",
                defaultValue: "",
                maxLength: PROFILE_STATUS_MAX_LENGTH,
                titleKey: "settings.row.ps.title",
                descriptionKey: "settings.row.ps.description",
              },
              {
                key: "px",
                type: "select",
                titleKey: "settings.row.px.title",
                defaultValue: 3,
                options: [
                  "settings.option.px.1",
                  "settings.option.px.2",
                  "settings.option.px.3",
                  "settings.option.px.4",
                  "settings.option.px.5",
                ],
              },
            ],
          },
        ],
      },
      {
        key: "account",
        labelKey: "settings.tab.account.account",
        groups: [
          {
            titleKey: "settings.group.account.account.1.title",
            rows: [
              {
                key: "ae",
                type: "action",
                riskyBlock: "email",
                titleKey: "settings.row.ae.title",
                descriptionData: "email",
                badgeKey: "settings.row.ae.badge",
                tone: "success",
                actions: [{ labelKey: "settings.action.ae.1" }],
              },
              {
                key: "ap",
                type: "action",
                riskyBlock: "phone",
                titleKey: "settings.row.ap.title",
                descriptionData: "phone",
                badgeKey: "settings.row.ap.badge",
                tone: "warning",
                actions: [
                  { labelKey: "settings.action.ap.1" },
                  { labelKey: "settings.action.ap.2", disabled: true },
                ],
              },
              {
                key: "apw",
                type: "risky",
                titleKey: "settings.row.apw.title",
                descriptionData: "passwordChangedAt",
                riskyBlock: "password",
              },
            ],
          },
          {
            titleKey: "settings.group.account.account.2.title",
            rows: [
              {
                key: "cn",
                type: "custom",
                block: "connections",
              },
            ],
          },
        ],
      },
      {
        key: "privacy",
        labelKey: "settings.tab.account.privacy",
        groups: [
          {
            titleKey: "settings.group.account.privacy.1.title",
            rows: [
              {
                key: "g1",
                type: "select",
                titleKey: "settings.row.g1.title",
                defaultValue: 1,
                options: ["settings.option.g1.1", "settings.option.g1.2", "settings.option.g1.3"],
              },
              {
                key: "g2",
                type: "select",
                titleKey: "settings.row.g2.title",
                defaultValue: 1,
                options: ["settings.option.g2.1", "settings.option.g2.2", "settings.option.g2.3"],
              },
              {
                key: "g7",
                type: "toggle",
                titleKey: "settings.row.g7.title",
                descriptionKey: "settings.row.g7.description",
                defaultValue: false,
              },
            ],
          },
          {
            titleKey: "settings.group.account.privacy.2.title",
            rows: [
              {
                key: "g3",
                type: "select",
                titleKey: "settings.row.g3.title",
                defaultValue: 2,
                options: [
                  "settings.option.g3.1",
                  "settings.option.g3.2",
                  "settings.option.g3.3",
                  "settings.option.g3.4",
                ],
              },
              {
                key: "g4",
                type: "select",
                titleKey: "settings.row.g4.title",
                defaultValue: 1,
                options: [
                  "settings.option.g4.1",
                  "settings.option.g4.2",
                  "settings.option.g4.3",
                  "settings.option.g4.4",
                ],
              },
              {
                key: "g5",
                type: "toggle",
                titleKey: "settings.row.g5.title",
                defaultValue: true,
              },
              {
                key: "g6",
                type: "toggle",
                titleKey: "settings.row.g6.title",
                descriptionKey: "settings.row.g6.description",
                defaultValue: true,
              },
            ],
          },
        ],
      },
      {
        key: "security",
        labelKey: "settings.tab.account.security",
        groups: [
          {
            titleKey: "settings.group.account.security.1.title",
            noteKey: "settings.group.account.security.1.note",
            rows: [
              {
                key: "s1",
                type: "risky",
                titleKey: "settings.row.s1.title",
                descriptionKey: "settings.row.s1.description",
                riskyBlock: "twoFactor",
              },
              {
                key: "s2",
                type: "action",
                titleKey: "settings.row.s2.title",
                descriptionData: "recoveryCodes",
                actions: [
                  { labelKey: "settings.action.s2.1" },
                  { labelKey: "settings.action.s2.2" },
                  { labelKey: "settings.action.s2.3" },
                ],
              },
              {
                key: "s4",
                type: "action",
                titleKey: "settings.row.s4.title",
                descriptionKey: "settings.row.s4.description",
                actions: [{ labelKey: "settings.action.s4.1", kind: "danger" }],
              },
            ],
          },
          {
            titleKey: "settings.group.account.security.2.title",
            rows: [
              {
                key: "s3",
                type: "custom",
                block: "secEvents",
              },
            ],
          },
          {
            titleKey: "settings.group.account.security.3.title",
            noteData: "sessionCount",
            rows: [
              {
                key: "o1",
                type: "custom",
                block: "sessions",
              },
              {
                key: "o2",
                type: "action",
                titleKey: "settings.row.o2.title",
                descriptionKey: "settings.row.o2.description",
                actions: [
                  { labelKey: "settings.action.o2.1" },
                  { labelKey: "settings.action.o2.2" },
                ],
              },
            ],
          },
        ],
      },
      {
        key: "badges",
        labelKey: "settings.tab.account.badges",
        groups: [
          {
            titleData: "badgeProgress",
            noteKey: "settings.group.account.badges.1.note",
            rows: [
              {
                key: "r1",
                type: "custom",
                block: "badges",
              },
            ],
          },
        ],
      },
      {
        key: "data",
        labelKey: "settings.tab.account.data",
        groups: [
          {
            titleKey: "settings.group.account.data.1.title",
            rows: [
              {
                key: "d1",
                type: "action",
                titleKey: "settings.row.d1.title",
                descriptionData: "lastExport",
                badgeKey: "settings.row.d1.badge",
                tone: "success",
                actions: [
                  { labelKey: "settings.action.d1.1", kind: "primary" },
                  { labelKey: "settings.action.d1.2" },
                ],
              },
            ],
          },
          {
            titleKey: "settings.group.account.data.2.title",
            rows: [
              {
                key: "d3",
                type: "risky",
                titleKey: "settings.row.d3.title",
                descriptionKey: "settings.row.d3.description",
                riskyBlock: "deleteAccount",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "av",
    labelKey: "settings.section.av.label",
    leadKey: "settings.section.av.lead",
    group: "app",
    icon: "mic",
    tabs: [
      {
        key: "audio",
        labelKey: "settings.tab.av.audio",
        groups: [
          {
            titleKey: "settings.group.av.audio.1.title",
            rows: [
              {
                key: "i1",
                type: "select",
                titleKey: "settings.row.i1.title",
                defaultValue: 0,
                options: [
                  "settings.option.i1.1",
                  "settings.option.i1.2",
                  "settings.option.i1.3",
                  "settings.option.i1.4",
                ],
              },
              {
                key: "i3",
                type: "custom",
                block: "mic",
              },
              {
                key: "i4",
                type: "toggle",
                titleKey: "settings.row.i4.title",
                descriptionKey: "settings.row.i4.description",
                defaultValue: false,
              },
              {
                key: "i5",
                type: "segment",
                titleKey: "settings.row.i5.title",
                defaultValue: 0,
                options: ["settings.option.i5.1", "settings.option.i5.2"],
              },
              {
                key: "i6",
                type: "slider",
                titleKey: "settings.row.i6.title",
                defaultValue: 120,
                range: [0, 500, " ms"],
              },
            ],
          },
          {
            titleKey: "settings.group.av.audio.2.title",
            rows: [
              {
                key: "u1",
                type: "select",
                titleKey: "settings.row.u1.title",
                defaultValue: 0,
                options: [
                  "settings.option.u1.1",
                  "settings.option.u1.2",
                  "settings.option.u1.3",
                  "settings.option.u1.4",
                ],
              },
              {
                key: "u3",
                type: "slider",
                titleKey: "settings.row.u3.title",
                defaultValue: 78,
                range: [0, 100, "%"],
              },
              {
                key: "u2",
                type: "action",
                titleKey: "settings.row.u2.title",
                descriptionKey: "settings.row.u2.description",
                actions: [{ labelKey: "settings.action.u2.1" }],
              },
            ],
          },
          {
            titleKey: "settings.group.av.audio.3.title",
            noteKey: "settings.group.av.audio.3.note",
            rows: [
              {
                key: "p7",
                type: "select",
                titleKey: "settings.row.p7.title",
                descriptionKey: "settings.row.p7.description",
                defaultValue: 0,
                options: ["settings.option.p7.1", "settings.option.p7.2", "settings.option.p7.3"],
              },
              {
                key: "p4",
                type: "toggle",
                titleKey: "settings.row.p4.title",
                defaultValue: true,
              },
              {
                key: "p5",
                type: "toggle",
                titleKey: "settings.row.p5.title",
                defaultValue: false,
              },
            ],
          },
        ],
      },
      {
        key: "camera",
        labelKey: "settings.tab.av.camera",
        groups: [
          {
            titleKey: "settings.group.av.camera.1.title",
            rows: [
              {
                key: "k1",
                type: "select",
                titleKey: "settings.row.k1.title",
                defaultValue: 0,
                options: ["settings.option.k1.1", "settings.option.k1.2", "settings.option.k1.3"],
              },
              {
                key: "k2",
                type: "custom",
                block: "camera",
              },
              {
                key: "k3",
                type: "toggle",
                titleKey: "settings.row.k3.title",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.av.camera.2.title",
            rows: [
              {
                key: "k4",
                type: "action",
                titleKey: "settings.row.k4.title",
                descriptionKey: "settings.row.k4.description",
                badgeKey: "settings.row.k4.badge",
                tone: "danger",
                actions: [
                  { labelKey: "settings.action.k4.1", kind: "primary" },
                  { labelKey: "settings.action.k4.2" },
                ],
              },
            ],
          },
        ],
      },
      {
        key: "screen-share",
        labelKey: "settings.tab.av.screen-share",
        groups: [
          {
            titleKey: "settings.group.av.screen-share.1.title",
            rows: [
              // Ekran paylaşımı K4 — kalite üç eksen: `e1` katman, `e8` kare hızı, `e9` mod.
              {
                key: "e1",
                type: "segment",
                titleKey: "settings.row.e1.title",
                defaultValue: 1,
                options: [
                  "settings.option.e1.1",
                  "settings.option.e1.2",
                  "settings.option.e1.3",
                  "settings.option.e1.4",
                ],
                // K2 — 4K yalnız `screenShare4kAllowed` iken seçilebilir.
                optionGateKeys: { 3: "settings.option.e1.4.disabled" },
              },
              {
                key: "e8",
                type: "segment",
                titleKey: "settings.row.e8.title",
                defaultValue: 2,
                options: ["settings.option.e8.1", "settings.option.e8.2", "settings.option.e8.3"],
              },
              {
                key: "e9",
                type: "segment",
                titleKey: "settings.row.e9.title",
                defaultValue: 0,
                options: ["settings.option.e9.1", "settings.option.e9.2"],
              },
              // K20 — varsayılanlar store'dan (`voice-store.ts`): `e2` kapalı, `e3` %100.
              {
                key: "e2",
                type: "toggle",
                titleKey: "settings.row.e2.title",
                defaultValue: false,
              },
              {
                key: "e3",
                type: "slider",
                titleKey: "settings.row.e3.title",
                defaultValue: 100,
                range: [0, 100, "%"],
              },
            ],
          },
          {
            titleKey: "settings.group.av.screen-share.2.title",
            rows: [
              {
                key: "e4",
                type: "toggle",
                titleKey: "settings.row.e4.title",
                descriptionKey: "settings.row.e4.description",
                defaultValue: true,
              },
              {
                key: "e5",
                type: "toggle",
                titleKey: "settings.row.e5.title",
                descriptionKey: "settings.row.e5.description",
                defaultValue: true,
              },
              {
                key: "e7",
                type: "action",
                titleKey: "settings.row.e7.title",
                descriptionData: "activeShare",
                actions: [
                  { labelKey: "settings.action.e7.1" },
                  { labelKey: "settings.action.e7.2" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "appearance",
    labelKey: "settings.section.appearance.label",
    leadKey: "settings.section.appearance.lead",
    group: "app",
    icon: "palette",
    tabs: [
      {
        key: "theme",
        labelKey: "settings.tab.appearance.theme",
        groups: [
          {
            titleKey: "settings.group.appearance.theme.1.title",
            rows: [
              {
                key: "t1",
                type: "custom",
                block: "themes",
              },
            ],
          },
          {
            titleKey: "settings.group.appearance.theme.2.title",
            noteKey: "settings.group.appearance.theme.2.note",
            rows: [
              {
                key: "t2",
                type: "custom",
                block: "themeGrid",
              },
            ],
          },
        ],
      },
      {
        key: "text",
        labelKey: "settings.tab.appearance.text",
        groups: [
          {
            titleKey: "settings.group.appearance.text.1.title",
            rows: [
              {
                key: "m1",
                type: "select",
                titleKey: "settings.row.m1.title",
                defaultValue: 3,
                options: [
                  "settings.option.m1.1",
                  "settings.option.m1.2",
                  "settings.option.m1.3",
                  "settings.option.m1.4",
                ],
              },
              {
                key: "m2",
                type: "slider",
                titleKey: "settings.row.m2.title",
                defaultValue: 15,
                range: [12, 22, " px"],
              },
              {
                key: "m3",
                type: "segment",
                titleKey: "settings.row.m3.title",
                defaultValue: 0,
                options: ["settings.option.m3.1", "settings.option.m3.2"],
              },
              {
                key: "m4",
                type: "toggle",
                titleKey: "settings.row.m4.title",
                descriptionKey: "settings.row.m4.description",
                defaultValue: false,
              },
            ],
          },
          {
            titleKey: "settings.group.appearance.text.2.title",
            noteKey: "settings.group.appearance.text.2.note",
            rows: [
              {
                key: "m5",
                type: "custom",
                block: "msgPreview",
              },
            ],
          },
        ],
      },
      {
        key: "media",
        labelKey: "settings.tab.appearance.media",
        groups: [
          {
            titleKey: "settings.group.appearance.media.1.title",
            rows: [
              {
                key: "v1",
                type: "toggle",
                titleKey: "settings.row.v1.title",
                defaultValue: true,
              },
              {
                key: "v2",
                type: "toggle",
                titleKey: "settings.row.v2.title",
                defaultValue: true,
              },
              {
                key: "v3",
                type: "toggle",
                titleKey: "settings.row.v3.title",
                defaultValue: true,
              },
              {
                key: "v4",
                type: "toggle",
                titleKey: "settings.row.v4.title",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.appearance.media.2.title",
            rows: [
              {
                key: "v7",
                type: "toggle",
                titleKey: "settings.row.v7.title",
                descriptionKey: "settings.row.v7.description",
                defaultValue: false,
                stateKey: "reduceMotion",
              },
            ],
          },
        ],
      },
      {
        key: "layout",
        labelKey: "settings.tab.appearance.layout",
        groups: [
          {
            titleKey: "settings.group.appearance.layout.1.title",
            noteKey: "settings.group.appearance.layout.1.note",
            rows: [
              {
                key: "y1",
                type: "slider",
                titleKey: "settings.row.y1.title",
                defaultValue: 74,
                range: [60, 92, " px"],
              },
              {
                key: "y2",
                type: "slider",
                titleKey: "settings.row.y2.title",
                defaultValue: 44,
                range: [36, 56, " px"],
              },
              {
                key: "y3",
                type: "slider",
                titleKey: "settings.row.y3.title",
                defaultValue: 252,
                range: [200, 300, " px"],
              },
              {
                key: "y4",
                type: "slider",
                titleKey: "settings.row.y4.title",
                defaultValue: 100,
                range: [70, 100, "%"],
              },
              {
                key: "y5",
                type: "toggle",
                titleKey: "settings.row.y5.title",
                defaultValue: true,
              },
              {
                key: "y6",
                type: "action",
                titleKey: "settings.row.y6.title",
                descriptionKey: "settings.row.y6.description",
                actions: [{ labelKey: "settings.action.y6.1" }],
              },
            ],
          },
        ],
      },
      {
        key: "accessibility",
        labelKey: "settings.tab.appearance.accessibility",
        groups: [
          {
            titleKey: "settings.group.appearance.accessibility.1.title",
            rows: [
              {
                key: "x2",
                type: "toggle",
                titleKey: "settings.row.x2.title",
                defaultValue: false,
              },
              {
                key: "x3",
                type: "toggle",
                titleKey: "settings.row.x3.title",
                defaultValue: true,
              },
              {
                key: "x4",
                type: "slider",
                titleKey: "settings.row.x4.title",
                defaultValue: 100,
                range: [85, 130, "%"],
              },
            ],
          },
        ],
      },
      {
        key: "language",
        labelKey: "settings.tab.appearance.language",
        groups: [
          {
            titleKey: "settings.group.account.privacy.4.title",
            rows: [
              {
                key: "l1",
                type: "segment",
                titleKey: "settings.row.l1.title",
                defaultValue: 0,
                options: ["settings.option.l1.1", "settings.option.l1.2"],
              },
              {
                key: "l2",
                type: "select",
                titleKey: "settings.row.l2.title",
                defaultValue: 0,
                options: [
                  "settings.option.l2.1",
                  "settings.option.l2.2",
                  "settings.option.l2.3",
                  "settings.option.l2.4",
                ],
              },
              {
                key: "l3",
                type: "select",
                titleKey: "settings.row.l3.title",
                defaultValue: 1,
                options: [
                  "settings.option.l3.1",
                  "settings.option.l3.2",
                  "settings.option.l3.3",
                  "settings.option.l3.4",
                ],
              },
              {
                key: "l4",
                type: "segment",
                titleKey: "settings.row.l4.title",
                defaultValue: 2,
                options: ["settings.option.l4.1", "settings.option.l4.2", "settings.option.l4.3"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "notifications",
    labelKey: "settings.section.notifications.label",
    leadKey: "settings.section.notifications.lead",
    group: "app",
    icon: "bell",
    tabs: [
      {
        key: "general",
        labelKey: "settings.tab.notifications.general",
        groups: [
          {
            titleKey: "settings.group.notifications.general.1.title",
            noteKey: "settings.group.notifications.general.1.note",
            rows: [
              {
                key: "b1",
                type: "select",
                titleKey: "settings.row.b1.title",
                defaultValue: 1,
                options: ["settings.option.b1.1", "settings.option.b1.2", "settings.option.b1.3"],
              },
              {
                key: "nd2",
                type: "select",
                titleKey: "settings.row.nd2.title",
                descriptionKey: "settings.row.nd2.description",
                defaultValue: 1,
                options: [
                  "settings.option.nd2.1",
                  "settings.option.nd2.2",
                  "settings.option.nd2.3",
                ],
                sharedTabs: ["surfaces"],
              },
              {
                key: "na5",
                type: "action",
                titleKey: "settings.row.na5.title",
                descriptionKey: "settings.row.na5.description",
                badgeKey: "settings.row.na5.badge",
                tone: "danger",
                actions: [
                  { labelKey: "settings.action.na5.1", kind: "primary" },
                  { labelKey: "settings.action.na5.2" },
                ],
                sharedTabs: ["surfaces"],
              },
              {
                key: "na6",
                type: "toggle",
                titleKey: "settings.row.na6.title",
                descriptionKey: "settings.row.na6.description",
                defaultValue: false,
                sharedTabs: ["surfaces"],
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.general.2.title",
            rows: [
              {
                key: "ns1",
                type: "sound",
                titleKey: "settings.row.ns1.title",
                defaultValue: true,
                sound: { profile: "whispr", volume: 60 },
                sharedTabs: ["sounds"],
              },
              {
                key: "nq1",
                type: "toggle",
                titleKey: "settings.row.nq1.title",
                descriptionKey: "settings.row.nq1.description",
                defaultValue: true,
                sharedTabs: ["quiet-hours"],
              },
              {
                key: "nqx",
                type: "jump",
                titleKey: "settings.row.nqx.title",
                descriptionKey: "settings.row.nqx.description",
                actions: [{ labelKey: "settings.action.nqx.1" }],
                target: { section: "notifications", tab: "quiet-hours" },
              },
            ],
          },
        ],
      },
      {
        key: "surfaces",
        labelKey: "settings.tab.notifications.surfaces",
        groups: [
          {
            titleKey: "settings.group.notifications.surfaces.1.title",
            rows: [
              {
                key: "ns0",
                type: "custom",
                block: "notifSummary",
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.surfaces.2.title",
            noteKey: "settings.group.notifications.surfaces.2.note",
            rows: [
              {
                key: "na1",
                type: "toggle",
                titleKey: "settings.row.na1.title",
                descriptionKey: "settings.row.na1.description",
                defaultValue: true,
              },
              {
                key: "na2",
                type: "toggle",
                titleKey: "settings.row.na2.title",
                defaultValue: false,
              },
              {
                key: "na3",
                type: "toggle",
                titleKey: "settings.row.na3.title",
                descriptionKey: "settings.row.na3.description",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.surfaces.3.title",
            noteKey: "settings.group.notifications.surfaces.3.note",
            rows: [
              {
                key: "nd1",
                type: "toggle",
                titleKey: "settings.row.nd1.title",
                defaultValue: true,
              },
              {
                key: "nd2",
                type: "select",
                titleKey: "settings.row.nd2.title",
                defaultValue: 1,
                options: [
                  "settings.option.nd2.1",
                  "settings.option.nd2.2",
                  "settings.option.nd2.3",
                ],
                sharedTabs: ["general"],
              },
              {
                key: "nd3",
                type: "toggle",
                titleKey: "settings.row.nd3.title",
                descriptionKey: "settings.row.nd3.description",
                defaultValue: true,
              },
              {
                key: "nd4",
                type: "toggle",
                titleKey: "settings.row.nd4.title",
                descriptionKey: "settings.row.nd4.description",
                defaultValue: false,
              },
              {
                key: "na6",
                type: "toggle",
                titleKey: "settings.row.na6.title",
                descriptionKey: "settings.row.na6.description",
                defaultValue: false,
                sharedTabs: ["general"],
              },
              {
                key: "na5",
                type: "action",
                titleKey: "settings.row.na5.title",
                descriptionKey: "settings.row.na5.description",
                badgeKey: "settings.row.na5.badge",
                tone: "danger",
                actions: [
                  { labelKey: "settings.action.na5.1", kind: "primary" },
                  { labelKey: "settings.action.na5.2" },
                ],
                sharedTabs: ["general"],
              },
            ],
          },
        ],
      },
      {
        key: "types",
        labelKey: "settings.tab.notifications.types",
        groups: [
          {
            titleKey: "settings.group.notifications.types.1.title",
            rows: [
              {
                key: "nt1",
                type: "toggle",
                titleKey: "settings.row.nt1.title",
                descriptionKey: "settings.row.nt1.description",
                defaultValue: true,
              },
              {
                key: "nt2",
                type: "toggle",
                titleKey: "settings.row.nt2.title",
                descriptionKey: "settings.row.nt2.description",
                defaultValue: true,
              },
              {
                key: "nt3",
                type: "toggle",
                titleKey: "settings.row.nt3.title",
                descriptionKey: "settings.row.nt3.description",
                defaultValue: true,
              },
              {
                key: "nt4",
                type: "toggle",
                titleKey: "settings.row.nt4.title",
                descriptionKey: "settings.row.nt4.description",
                defaultValue: false,
              },
              {
                key: "nt5",
                type: "toggle",
                titleKey: "settings.row.nt5.title",
                descriptionKey: "settings.row.nt5.description",
                defaultValue: true,
              },
              {
                key: "nt6",
                type: "toggle",
                titleKey: "settings.row.nt6.title",
                descriptionKey: "settings.row.nt6.description",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.types.2.title",
            noteKey: "settings.group.notifications.types.2.note",
            rows: [
              {
                key: "nt7",
                type: "toggle",
                titleKey: "settings.row.nt7.title",
                descriptionKey: "settings.row.nt7.description",
                defaultValue: true,
              },
              {
                key: "nt8",
                type: "toggle",
                titleKey: "settings.row.nt8.title",
                descriptionKey: "settings.row.nt8.description",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.types.3.title",
            rows: [
              {
                key: "nt9",
                type: "toggle",
                titleKey: "settings.row.nt9.title",
                defaultValue: true,
              },
              {
                key: "nt10",
                type: "toggle",
                titleKey: "settings.row.nt10.title",
                defaultValue: true,
              },
              {
                key: "nt11",
                type: "toggle",
                titleKey: "settings.row.nt11.title",
                defaultValue: true,
              },
              {
                key: "nt12",
                type: "toggle",
                titleKey: "settings.row.nt12.title",
                defaultValue: false,
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.types.4.title",
            noteKey: "settings.group.notifications.types.4.note",
            rows: [
              {
                key: "nt13",
                type: "lockedToggle",
                titleKey: "settings.row.nt13.title",
                descriptionKey: "settings.row.nt13.description",
                badgeKey: "settings.row.nt13.badge",
                locked: true,
                defaultValue: true,
              },
              {
                key: "nt14",
                type: "lockedToggle",
                titleKey: "settings.row.nt14.title",
                descriptionKey: "settings.row.nt14.description",
                badgeKey: "settings.row.nt14.badge",
                locked: true,
                defaultValue: true,
              },
              {
                key: "nt15",
                type: "toggle",
                titleKey: "settings.row.nt15.title",
                descriptionKey: "settings.row.nt15.description",
                defaultValue: true,
              },
              {
                key: "nt16",
                type: "toggle",
                titleKey: "settings.row.nt16.title",
                defaultValue: false,
              },
            ],
          },
        ],
      },
      {
        key: "quiet-hours",
        labelKey: "settings.tab.notifications.quiet-hours",
        groups: [
          {
            titleKey: "settings.group.notifications.quiet-hours.1.title",
            noteKey: "settings.group.notifications.quiet-hours.1.note",
            rows: [
              {
                key: "nq1",
                type: "toggle",
                titleKey: "settings.row.nq1.title",
                descriptionKey: "settings.row.nq1.descriptionShort",
                defaultValue: true,
                sharedTabs: ["general"],
              },
              {
                key: "nq2",
                type: "select",
                titleKey: "settings.row.nq2.title",
                defaultValue: 2,
                options: [
                  "settings.option.nq2.1",
                  "settings.option.nq2.2",
                  "settings.option.nq2.3",
                  "settings.option.nq2.4",
                ],
              },
              {
                key: "nq3",
                type: "select",
                titleKey: "settings.row.nq3.title",
                defaultValue: 2,
                options: [
                  "settings.option.nq3.1",
                  "settings.option.nq3.2",
                  "settings.option.nq3.3",
                  "settings.option.nq3.4",
                ],
              },
              {
                key: "nq4",
                type: "select",
                titleKey: "settings.row.nq4.title",
                defaultValue: 0,
                options: [
                  "settings.option.nq4.1",
                  "settings.option.nq4.2",
                  "settings.option.nq4.3",
                ],
              },
              {
                key: "nq5",
                type: "toggle",
                titleKey: "settings.row.nq5.title",
                descriptionKey: "settings.row.nq5.description",
                defaultValue: true,
              },
            ],
          },
        ],
      },
      {
        key: "sounds",
        labelKey: "settings.tab.notifications.sounds",
        groups: [
          {
            titleKey: "settings.group.notifications.sounds.1.title",
            noteKey: "settings.group.notifications.sounds.1.note",
            rows: [
              {
                key: "ns1",
                type: "sound",
                titleKey: "settings.row.ns1.title",
                defaultValue: true,
                sound: { profile: "whispr", volume: 60 },
                sharedTabs: ["general"],
              },
              {
                key: "ns2",
                type: "sound",
                titleKey: "settings.row.ns2.title",
                defaultValue: true,
                sound: { profile: "classic", volume: 80 },
              },
            ],
          },
          {
            titleKey: "settings.group.notifications.sounds.2.title",
            rows: [
              {
                key: "ns3",
                type: "sound",
                titleKey: "settings.row.ns3.title",
                defaultValue: true,
                sound: { profile: "whispr", volume: 50 },
              },
              {
                key: "ns4",
                type: "sound",
                titleKey: "settings.row.ns4.title",
                defaultValue: true,
                sound: { profile: "whispr", volume: 50 },
              },
              {
                key: "ns5",
                type: "action",
                titleKey: "settings.row.ns5.title",
                descriptionKey: "settings.row.ns5.description",
                actions: [{ labelKey: "settings.action.ns5.1" }],
              },
            ],
          },
        ],
      },
      {
        key: "panel",
        labelKey: "settings.tab.notifications.panel",
        groups: [
          {
            titleKey: "settings.group.notifications.panel.1.title",
            noteKey: "settings.group.notifications.panel.1.note",
            rows: [
              {
                key: "np1",
                type: "segment",
                titleKey: "settings.row.np1.title",
                descriptionKey: "settings.row.np1.description",
                defaultValue: 2,
                options: [
                  "settings.option.np1.1",
                  "settings.option.np1.2",
                  "settings.option.np1.3",
                  "settings.option.np1.4",
                ],
              },
              {
                key: "np2",
                type: "toggle",
                titleKey: "settings.row.np2.title",
                defaultValue: true,
              },
              {
                key: "np3",
                type: "segment",
                titleKey: "settings.row.np3.title",
                descriptionKey: "settings.row.np3.description",
                defaultValue: 1,
                options: [
                  "settings.option.np3.1",
                  "settings.option.np3.2",
                  "settings.option.np3.3",
                  "settings.option.np3.4",
                  "settings.option.np3.5",
                ],
              },
              {
                key: "np4",
                type: "toggle",
                titleKey: "settings.row.np4.title",
                descriptionKey: "settings.row.np4.description",
                defaultValue: false,
              },
              {
                key: "np5",
                type: "toggle",
                titleKey: "settings.row.np5.title",
                defaultValue: true,
              },
            ],
          },
        ],
      },
      {
        key: "exceptions",
        labelKey: "settings.tab.notifications.exceptions",
        groups: [
          {
            titleKey: "settings.group.notifications.exceptions.1.title",
            noteKey: "settings.group.notifications.exceptions.1.note",
            rows: [
              {
                key: "ne0",
                type: "custom",
                block: "exceptions",
              },
              {
                key: "ne1",
                type: "segment",
                titleKey: "settings.row.ne1.title",
                defaultValue: 1,
                options: [
                  "settings.option.ne1.1",
                  "settings.option.ne1.2",
                  "settings.option.ne1.3",
                  "settings.option.ne1.4",
                ],
                ownGroupTitleKey: "settings.group.notifications.exceptions.defaults.title",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "desktop",
    labelKey: "settings.section.desktop.label",
    leadKey: "settings.section.desktop.lead",
    group: "app",
    icon: "monitor",
    desktopOnly: true,
    tabs: [
      {
        key: "app",
        labelKey: "settings.tab.desktop.app",
        groups: [
          {
            titleKey: "settings.group.desktop.app.1.title",
            rows: [
              {
                key: "w1",
                type: "action",
                titleKey: "settings.row.w1.title",
                actions: [{ labelKey: "settings.action.desktopApp.manage" }],
              },
              {
                key: "w2",
                type: "action",
                titleKey: "settings.row.w2.title",
                actions: [{ labelKey: "settings.action.desktopApp.manage" }],
              },
              {
                key: "w8",
                type: "action",
                titleKey: "settings.row.w8.title",
                descriptionKey: "settings.row.w8.description",
                actions: [{ labelKey: "settings.action.desktopApp.manage" }],
              },
            ],
          },
          {
            titleKey: "settings.group.desktop.app.2.title",
            rows: [
              {
                key: "w4",
                type: "toggle",
                titleKey: "settings.row.w4.title",
                descriptionKey: "settings.row.w4.description",
                defaultValue: true,
              },
              {
                key: "w5",
                type: "toggle",
                titleKey: "settings.row.w5.title",
                defaultValue: true,
              },
              {
                key: "w6",
                type: "toggle",
                titleKey: "settings.row.w6.title",
                descriptionKey: "settings.row.w6.description",
                defaultValue: true,
              },
              {
                key: "w7",
                type: "segment",
                titleKey: "settings.row.w7.title",
                defaultValue: 0,
                options: ["settings.option.w7.1", "settings.option.w7.2"],
              },
            ],
          },
        ],
      },
      {
        key: "shortcuts",
        labelKey: "settings.tab.desktop.shortcuts",
        groups: [
          {
            titleKey: "settings.group.desktop.shortcuts.1.title",
            noteKey: "settings.group.desktop.shortcuts.1.note",
            rows: [
              {
                key: "q1",
                type: "toggle",
                titleKey: "settings.row.q1.title",
                defaultValue: true,
              },
              {
                key: "q2",
                type: "custom",
                block: "shortcuts",
              },
            ],
          },
        ],
      },
      {
        key: "overlay",
        labelKey: "settings.tab.desktop.overlay",
        groups: [
          {
            titleKey: "settings.group.desktop.overlay.1.title",
            rows: [
              {
                key: "z1",
                type: "toggle",
                titleKey: "settings.row.z1.title",
                descriptionKey: "settings.row.z1.description",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.desktop.overlay.2.title",
            rows: [
              {
                key: "z2",
                type: "toggle",
                titleKey: "settings.row.z2.title",
                defaultValue: true,
              },
              {
                key: "z5",
                type: "toggle",
                titleKey: "settings.row.z5.title",
                descriptionKey: "settings.row.z5.description",
                defaultValue: false,
              },
              {
                key: "z3",
                type: "segment",
                titleKey: "settings.row.z3.title",
                defaultValue: 3,
                options: [
                  "settings.option.z3.1",
                  "settings.option.z3.2",
                  "settings.option.z3.3",
                  "settings.option.z3.4",
                ],
              },
              {
                key: "z4",
                type: "segment",
                titleKey: "settings.row.z4.title",
                defaultValue: 1,
                options: ["settings.option.z4.1", "settings.option.z4.2", "settings.option.z4.3"],
              },
              {
                key: "z6",
                type: "toggle",
                titleKey: "settings.row.z6.title",
                defaultValue: true,
              },
              {
                key: "z7",
                type: "nav",
                titleKey: "settings.row.z7.title",
                descriptionData: "perGameOverlayCount",
                navLabelKey: "settings.action.z7.1",
              },
              {
                key: "z8",
                type: "action",
                titleKey: "settings.row.z8.title",
                descriptionKey: "settings.row.z8.description",
                actions: [
                  { labelKey: "settings.action.z8.1" },
                  { labelKey: "settings.action.z8.2" },
                  { labelKey: "settings.action.z8.3" },
                ],
              },
            ],
          },
        ],
      },
      {
        key: "permissions",
        labelKey: "settings.tab.desktop.permissions",
        groups: [
          {
            titleKey: "settings.group.desktop.permissions.1.title",
            rows: [
              {
                key: "j1",
                type: "custom",
                block: "perms",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "updates",
    labelKey: "settings.section.updates.label",
    leadKey: "settings.section.updates.lead",
    group: "info",
    icon: "refresh",
    tabs: [
      {
        key: "updates",
        labelKey: "settings.tab.desktop.updates",
        groups: [
          {
            titleKey: "settings.group.desktop.updates.1.title",
            rows: [
              {
                key: "h1",
                type: "action",
                titleKey: "settings.row.h1.title",
                descriptionData: "desktopVersion",
                badgeKey: "settings.row.h1.badge",
                tone: "success",
                actions: [{ labelKey: "settings.action.h1.1", kind: "primary" }],
              },
              {
                key: "h2",
                type: "segment",
                titleKey: "settings.row.h2.title",
                defaultValue: 0,
                options: ["settings.option.h2.1", "settings.option.h2.2"],
              },
              {
                key: "h4",
                desktopOnly: true,
                type: "toggle",
                titleKey: "settings.row.h4.title",
                descriptionKey: "settings.row.h4.description",
                defaultValue: true,
              },
            ],
          },
          {
            titleKey: "settings.group.about.about.2.title",
            rows: [
              {
                key: "o2",
                type: "custom",
                block: "version",
              },
            ],
          },
          {
            titleData: "appVersion",
            rows: [
              {
                key: "o4",
                type: "custom",
                block: "whatsNew",
              },
              {
                key: "o5",
                type: "nav",
                titleKey: "settings.row.o5.title",
                descriptionKey: "settings.row.o5.description",
                navLabelKey: "settings.action.o5.1",
              },
            ],
          },
          {
            titleKey: "settings.group.desktop.updates.2.title",
            rows: [
              {
                key: "n3",
                desktopOnly: true,
                type: "custom",
                block: "diag",
              },
              {
                key: "n4",
                desktopOnly: true,
                type: "action",
                titleKey: "settings.row.n4.title",
                descriptionKey: "settings.row.n4.description",
                actions: [
                  { labelKey: "settings.action.n4.1" },
                  { labelKey: "settings.action.n4.2" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "about",
    labelKey: "settings.section.about.label",
    leadKey: "settings.section.about.lead",
    group: "info",
    icon: "info",
    tabs: [
      {
        key: "about",
        labelKey: "settings.tab.about.about",
        groups: [
          {
            rows: [
              {
                key: "o1",
                type: "custom",
                block: "about",
              },
            ],
          },
          {
            titleKey: "settings.group.about.about.4.title",
            rows: [
              {
                key: "o6",
                type: "custom",
                block: "contributors",
              },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Referanstan sayılan hacim. `tree.test.ts` bunları ağaca karşı doğrular; ağaç ile sayım aynı
 * dosyada durur ki bir satır eklendiğinde iki yerde birden yalan söylemek gereksin.
 */
export const SETTINGS_TREE_COUNTS = {
  sections: 7,
  tabs: 28,
  groups: 55,
  // 151 + `e8` + `e9` (ekran paylaşımı K4).
  rows: 153,
  controlTypes: 13,
  blocks: 20,
  risky: 3,
  sharedRowKeys: 5,
} as const;

/** Tuzak #4 — Genel sekmesi ile ayrıntı sekmesinin paylaştığı beş anahtar. */
export const SETTINGS_SHARED_ROW_KEYS = ["nd2", "na5", "na6", "nq1", "ns1"] as const;

/** Tuzak #5 — kilitli iki tür. Kolonları yoktur; sunucu her zaman `true` döner. */
export const SETTINGS_LOCKED_ROW_KEYS = ["nt13", "nt14"] as const;

/** Bölüm başına sekme sayısı — `6 / 3 / 5 / 7 / 5 / 1`. */
export const SETTINGS_TAB_COUNTS: Readonly<Record<SettingsSection, number>> = {
  account: 6,
  av: 3,
  appearance: 6,
  notifications: 7,
  desktop: 4,
  updates: 1,
  about: 1,
};

export function findSettingsSection(key: SettingsSection): SettingsSectionDef | undefined {
  return SETTINGS_TREE.find((section) => section.key === key);
}

export function findSettingsTab(
  section: SettingsSection,
  tab: SettingsTab,
): SettingsTabDef | undefined {
  return findSettingsSection(section)?.tabs.find((entry) => entry.key === tab);
}

/** Ağacın her satırını bölüm ve sekme bağlamıyla birlikte gezer. Arama indeksi bunu tüketir. */
export function* walkSettingsRows(): Generator<{
  section: SettingsSectionDef;
  tab: SettingsTabDef;
  group: SettingsGroupDef;
  row: SettingsRowDef;
}> {
  for (const section of SETTINGS_TREE) {
    for (const tab of section.tabs) {
      for (const group of tab.groups) {
        for (const row of group.rows) {
          yield { section, tab, group, row };
        }
      }
    }
  }
}

/** Ağacın taşıdığı bütün i18n anahtarları — kopya denetiminin girdisi. */
export function collectSettingsCopyKeys(): string[] {
  const keys = new Set<string>();

  for (const section of SETTINGS_TREE) {
    keys.add(section.labelKey);
    keys.add(section.leadKey);

    for (const tab of section.tabs) {
      keys.add(tab.labelKey);

      for (const group of tab.groups) {
        if (group.titleKey) keys.add(group.titleKey);
        if (group.noteKey) keys.add(group.noteKey);

        for (const row of group.rows) {
          if (row.titleKey) keys.add(row.titleKey);
          if (row.descriptionKey) keys.add(row.descriptionKey);
          if (row.badgeKey) keys.add(row.badgeKey);
          if (row.prefixKey) keys.add(row.prefixKey);
          if (row.navLabelKey) keys.add(row.navLabelKey);
          if (row.ownGroupTitleKey) keys.add(row.ownGroupTitleKey);
          for (const option of row.options ?? []) keys.add(option);
          for (const gateKey of Object.values(row.optionGateKeys ?? {})) keys.add(gateKey);
          for (const action of row.actions ?? []) keys.add(action.labelKey);
        }
      }
    }
  }

  return [...keys];
}
