# Dalga 0 · Ş0 — Sözleşme katmanı

**Ön koşul:** yok. **Paralel:** yok — bu şerit tek başına koşar, kapısı geçmeden Dalga 1 başlamaz.

Bu şerit **hiç ekran çizmez.** Migration, paylaşılan tipler, ölçü sözlüğü, içerik ağacı, i18n
iskeleti ve parity kapısını kurar. Sonraki 13 şerit bu dosyaları **okur ve tüketir**; hiçbiri
burada dondurulan sözleşmeyi tartışmaz.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `packages/db/prisma/schema.prisma` (düzenlenir)
- `packages/db/prisma/rebaseline-migrations/20260824090000_settings_notifications_screen/migration.sql` (yeni)
- `packages/db/prisma/schema-settings-screen.test.mjs` (yeni — şema sözleşme testi, mevcut
  `schema-*.test.mjs` deseni)
- `packages/types/src/settings.ts` (yeni) + `packages/types/src/index.ts` (ihracat)
- `apps/web/src/lib/settings/metrics.ts` (yeni) + `metrics.test.ts` + `parity.test.ts`
- `apps/web/src/lib/settings/tree.ts` (yeni — 6 × 27 × 58 × 170 içerik ağacı) + `tree.test.ts`
- `apps/web/src/lib/settings/navigation.ts` (**yeniden yazılır**) + `navigation.test.ts`
- `apps/web/src/lib/locale/messages/tr.ts` + `en.ts` (~420 anahtar)
- `apps/web/src/lib/locale/settings-screen-copy.test.ts` (yeni)

**Okunur, yazılmaz:** `lib/home/metrics.ts`, `lib/events/metrics.ts`, `lib/mentions/parity.test.ts`,
`design_handoff/ayarlar-paketi/**`.

---

## İş

### 1. Migration — `20260824090000_settings_notifications_screen`

> **Konum:** `packages/db/prisma/rebaseline-migrations/`. Prisma **bu** klasörü okur.

#### 1.1 Yeni enum'lar

```prisma
enum NotificationLevelPreference { ALL  IMPORTANT  OFF }
enum SystemNotificationMode      { ALL  MENTIONS   OFF }
enum SoundProfile                { WHISPR  CLASSIC }
enum SecurityEventKind {
  LOGIN_NEW_DEVICE  PASSWORD_CHANGED  FAILED_LOGIN
  TWO_FACTOR_ENABLED  TWO_FACTOR_DISABLED
  SESSION_REVOKED  RECOVERY_CODES_REGENERATED  EMAIL_CHANGED
}
```

#### 1.2 `SecurityEvent`

```prisma
model SecurityEvent {
  id        String            @id @default(uuid())
  userId    String
  kind      SecurityEventKind
  /// Ham IP saklanmaz; `AdminAuditLog.ipHash` ile aynı tuzlu hash şeması.
  ipHash    String?           @db.VarChar(64)
  userAgent String?
  location  String?
  metadata  Json?
  createdAt DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

`User` tarafına `securityEvents SecurityEvent[]` ilişkisi eklenir.

#### 1.3 `UserNotificationSettings` — eklenen kolonlar

Mevcut 12 kolon **korunur**, hiçbiri düşürülmez.

| Kolon                                                                               | Tip                                | Varsayılan                | Tasarım karşılığı                                                |
| ----------------------------------------------------------------------------------- | ---------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `level`                                                                             | `NotificationLevelPreference`      | `IMPORTANT`               | 560 px radyo kartları + Genel `b1`                               |
| `systemMode`                                                                        | `SystemNotificationMode`           | `MENTIONS`                | `nd2` (paylaşılan)                                               |
| `systemPreview`                                                                     | `Boolean`                          | `false`                   | `na6` (paylaşılan)                                               |
| `inAppToast`                                                                        | `Boolean`                          | `true`                    | `na1`                                                            |
| `systemWhileOpen`                                                                   | `Boolean`                          | `false`                   | `na2`                                                            |
| `appBadge`                                                                          | `Boolean`                          | `true`                    | `na3`                                                            |
| `deliveryInApp`                                                                     | `Boolean`                          | `true`                    | `nd1`                                                            |
| `deliveryPush`                                                                      | `Boolean`                          | `true`                    | `nd3`                                                            |
| `deliveryEmail`                                                                     | `Boolean`                          | `false`                   | `nd4`                                                            |
| `typeDm`                                                                            | `Boolean`                          | `true`                    | `nt1`                                                            |
| `typeMentionSelf`                                                                   | `Boolean`                          | `true`                    | `nt2` → mevcut `mentionSelf` ile **aynı kolon değil**, bkz. §1.5 |
| `typeMentionRole`                                                                   | `Boolean`                          | `true`                    | `nt3`                                                            |
| `typeMentionEveryone`                                                               | `Boolean`                          | `false`                   | `nt4`                                                            |
| `typeThreadReplies`                                                                 | `Boolean`                          | `true`                    | `nt5`                                                            |
| `typeMessageReplies`                                                                | `Boolean`                          | `true`                    | `nt6`                                                            |
| `typeIncomingCall`                                                                  | `Boolean`                          | `true`                    | `nt7`                                                            |
| `typeVoiceInvite`                                                                   | `Boolean`                          | `true`                    | `nt8`                                                            |
| `typeFriendRequest`                                                                 | `Boolean`                          | `true`                    | `nt9`                                                            |
| `typeServerInvite`                                                                  | `Boolean`                          | `true`                    | `nt10`                                                           |
| `typeEvents`                                                                        | `Boolean`                          | `true`                    | `nt11` → mevcut `eventNotifications` ile eşlenir (§1.5)          |
| `typeBadges`                                                                        | `Boolean`                          | `false`                   | `nt12`                                                           |
| `typeAnnouncements`                                                                 | `Boolean`                          | `true`                    | `nt15`                                                           |
| `typeProductUpdates`                                                                | `Boolean`                          | `false`                   | `nt16`                                                           |
| `quietHoursAllowCalls`                                                              | `Boolean`                          | `true`                    | `nq5`                                                            |
| `soundNotificationEnabled` · `soundNotificationProfile` · `soundNotificationVolume` | `Boolean` · `SoundProfile` · `Int` | `true` · `WHISPR` · `60`  | `ns1`                                                            |
| `soundCallEnabled` · `soundCallProfile` · `soundCallVolume`                         | ↑                                  | `true` · `CLASSIC` · `80` | `ns2`                                                            |
| `soundJoinEnabled` · `soundJoinProfile` · `soundJoinVolume`                         | ↑                                  | `true` · `WHISPR` · `50`  | `ns3`                                                            |
| `soundLeaveEnabled` · `soundLeaveProfile` · `soundLeaveVolume`                      | ↑                                  | `true` · `WHISPR` · `50`  | `ns4`                                                            |
| `panelCount`                                                                        | `Int`                              | `5`                       | `np1`                                                            |
| `panelAutoClose`                                                                    | `Boolean`                          | `true`                    | `np2`                                                            |
| `panelDurationSec`                                                                  | `Int`                              | `10`                      | `np3`                                                            |
| `panelShowContent`                                                                  | `Boolean`                          | `false`                   | `np4` — **`systemPreview`den ayrı**                              |
| `panelShowSource`                                                                   | `Boolean`                          | `true`                    | `np5`                                                            |
| `defaultMuteDuration`                                                               | `String` `@db.VarChar(16)`         | `"8h"`                    | `ne1`                                                            |

**`typeSecurity` ve `typeModeration` kolonu YOKTUR** — kilitli türler sunucu tarafında sabit
`true`. Kolonu eklemek "kilitli" iddiasını yalan yapardı (tuzak #5).

Sorgu indeksi: `@@index([deliveryPush])` **eklenmez** — tek kolonlu boolean indeksi seçicilik
taşımaz. Bunun yerine gönderim yolu `userId IN (...)` ile okur.

#### 1.4 `UserSettings` — eklenen kolonlar

| Kolon                      | Tip                        | Varsayılan | Karşılık                                |
| -------------------------- | -------------------------- | ---------- | --------------------------------------- |
| `idleTimeoutMinutes`       | `Int`                      | `10`       | K9 — menüden taşınan tercih             |
| `highContrast`             | `Boolean`                  | `false`    | `x2`                                    |
| `strongFocusRings`         | `Boolean`                  | `true`     | `x3`                                    |
| `uiTextScale`              | `Int`                      | `100`      | `x4` (85–130)                           |
| `screenReaderDescriptions` | `Boolean`                  | `true`     | `x6`                                    |
| `followSystemA11y`         | `Boolean`                  | `true`     | `x7`                                    |
| `reduceMotion`             | `Boolean`                  | `false`    | `v7` **=** `x1` (sapma #4, tek anahtar) |
| `appIcon`                  | `String` `@db.VarChar(24)` | `"whispr"` | `n1`                                    |
| `mainContentWidth`         | `Int`                      | `100`      | `y4` (70–100)                           |
| `serverIconSize`           | `Int`                      | `44`       | `y2` (36–56)                            |
| `showMemberPanelByDefault` | `Boolean`                  | `true`     | `y5`                                    |
| `linkPreviews`             | `Boolean`                  | `true`     | `v2`                                    |
| `pttReleaseMs`             | `Int`                      | `120`      | `i6`                                    |

`enableTTS` zaten var → `v8` **=** `x5` (sapma #4).

#### 1.5 Geri doldurma (idempotent, tek yönlü)

```sql
UPDATE "UserNotificationSettings" SET
  "panelCount"               = COALESCE((SELECT "notificationLimit"      FROM "UserSettings" s WHERE s."userId" = "UserNotificationSettings"."userId"), 5),
  "panelAutoClose"           = COALESCE((SELECT "notificationAutoClose"  FROM "UserSettings" s WHERE s."userId" = "UserNotificationSettings"."userId"), true),
  "soundNotificationEnabled" = "notificationSound",
  "soundNotificationProfile" = CASE WHEN "notificationSoundFile" LIKE '%whispr%' THEN 'WHISPR' ELSE 'CLASSIC' END,
  "systemMode"               = CASE "desktopMentionMode" WHEN 'ALL' THEN 'ALL' WHEN 'OFF' THEN 'OFF' ELSE 'MENTIONS' END,
  "deliveryPush"             = "mobileNotifications",
  "deliveryEmail"            = "emailNotifications",
  "typeMentionSelf"          = "mentionSelf",
  "typeThreadReplies"        = "mentionThreadReplies",
  "typeMentionEveryone"      = NOT "suppressEveryoneMentions",
  "typeMentionRole"          = NOT "suppressRoleMentions",
  "typeEvents"               = "eventNotifications";

UPDATE "UserNotificationSettings" u SET "level" =
  CASE (SELECT s."defaultNotifications" FROM "UserSettings" s WHERE s."userId" = u."userId")
    WHEN 'ALL_MESSAGES' THEN 'ALL' WHEN 'NOTHING' THEN 'OFF' ELSE 'IMPORTANT' END;
```

**Eski kolonlar bir sürüm daha yazılmaya devam eder** (`desktopNotifications` yorumundaki kural).
Düşürme ayrı migration; bu pakette yok.

#### 1.6 Şema sözleşme testi

`schema-settings-screen.test.mjs` — mevcut `schema-*.test.mjs` deseninde:
yeni enum'ların değer kümesi, `SecurityEvent` alanları ve indeksi, `UserNotificationSettings`
üzerinde `typeSecurity`/`typeModeration` kolonunun **bulunmadığı**, ters mantıklı iki kolonun
hâlâ var olduğu.

---

### 2. Paylaşılan tipler — `packages/types/src/settings.ts`

SPEC §7'deki tipler **birebir** karşılanır. Zod şeması + türetilmiş TS tipi (projedeki desen).

```ts
export const NotifKindSchema = z.enum(["mention", "reply", "event", "system"]);
export const AppNotificationSchema = z.object({ … });   // SPEC §7
export const NotificationPrefsSchema = z.object({ … });  // SPEC §7 + §5.4
export const NotificationPrefsPatchSchema = NotificationPrefsSchema.deepPartial();
export const NotificationExceptionSchema = z.object({
  id: z.string(), scope: z.enum(["server", "channel", "dm"]),
  name: z.string(), level: z.string(), mutedUntil: z.string().nullable(),
});
export const SecurityEventSchema = z.object({ … });
export const UserSettingsSchema = z.object({ … });        // SPEC §7 `UserSettings`
```

**Sunucu metin göndermez, enum ve sayı gönderir.** SPEC §7'deki `level: string` gibi serbest metin
alanları enum'a çevrilir; görüntülenecek Türkçe metni istemci i18n ile kurar. Bu sapma dosya
başında yorumla kayda geçer (Etkinlikler paketinde kurulan kural).

`NotificationPrefsPatchSchema` **kilitli türleri kabul etmez**: `typeSecurity` / `typeModeration`
anahtarları şemada yoktur, `.strict()` ile gelirse ayrıştırma başarısız olur.

---

### 3. Ölçü sözlüğü — `lib/settings/metrics.ts`

`lib/events/metrics.ts` deseni: **renk taşımaz**, yalnız ölçü / yarıçap / boşluk / ağırlık /
satır yüksekliği / süre. `pxToRem`, `pxToEm`, `hairline` `lib/home/metrics.ts`'ten yeniden ihraç
edilir.

Bloklar ve zorunlu asgari alanlar (değerler **referanstan** okunur, SPEC ikinci otorite):

| Blok          | İçerik                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `panel`       | `width:400`, `radius:20`, `top:50`, `maxHeight:640`, başlık padding `16/18/13`, sayaç `minWidth:20`/`height:19`/`radius:7`, sekme `height:30`/`radius:10`, liste padding `8/10/12`, satır padding `10/11`/`radius:14`, tür ikonu `32`/`radius:11`, okunmamış nokta `7`, alt padding `12/16` |
| `prefsDialog` | `width:560`, `radius:22`, zil kutusu `38`, radyo kartı padding `11/12`/`radius:14`, hızlı tercih `radius:14`, anahtar `40×23`                                                                                                                                                               |
| `userMenu`    | `width:308`, `radius:20`, `left:82`, `bottom:14`, DND ikon `32`, anahtar `40×23`, süre çipi `height:27`/`radius:9`, cihaz satırı padding `9/10`/`radius:12`/ikon `28`, ölçer 14 segment                                                                                                     |
| `window`      | `1180×800`, `radius:24`                                                                                                                                                                                                                                                                     |
| `nav`         | `width:250`, üst padding `18/16/12`, arama `height:34`/`radius:11`, satır padding `8/10`/`radius:10`/ikon `16`, alt kart padding `11/12`/avatar `34`/çıkış `28`                                                                                                                             |
| `header`      | padding `14/24`, kapat `31`, kayıt noktası `6`                                                                                                                                                                                                                                              |
| `tabs`        | padding `0/22`, sekme `height:38`/`padding:0 12`, aktif çubuk `2`                                                                                                                                                                                                                           |
| `body`        | içerik kolonu `maxWidth:720`, padding `22/24/28`, grup boşluğu `9`, kap `radius:16`                                                                                                                                                                                                         |
| `row`         | padding `13/15`, ayırıcı `1`, açıklama `maxWidth:400`, kontrol ekseni bitişi `1081`                                                                                                                                                                                                         |
| `controls`    | anahtar `38×22`/topuz `16`, açılır menü düğmesi `210×34`/`radius:10`, menü `radius:12`/`maxHeight:222`/**yön eşiği `236`**, metin alanı `260`/`radius:10`, kaydırıcı bloğu `220`, eylem düğmesi `height:32`                                                                                 |
| `saveBar`     | padding `12/24`                                                                                                                                                                                                                                                                             |
| `blocks`      | 20 özel bloğun geometrisi — hero banner `132`/avatar `80`/halka `5`/`marginTop:-42`/durum noktası `17`/kamera düğmesi `28`; QR `104`; kamera önizleme `220` 16:9; tema kartı önizleme `62`; tema swatch `18`; iskelet `96/150/112/64`                                                       |
| `motion`      | geçiş `0.16`, arama kenarı `0.18`                                                                                                                                                                                                                                                           |

`SPEC_DEVIATIONS` dizisi `00-ortak-baglam.md` §4'teki **dokuz** kaydı gerekçesiyle taşır.

`metrics.test.ts`: sözlükte renk sızıntısı olmadığını (`hsl(`, `#`, `rgb(` araması), her
sayısal değerin pozitif olduğunu ve `SPEC_DEVIATIONS`'ın dokuz kayıt taşıdığını doğrular.

---

### 4. Parity kapısı — `lib/settings/parity.test.ts`

`lib/mentions/parity.test.ts` deseni: referans `.dc.html` okunur, sözlük değerlerinin **inline
`style` metni** aranır.

```ts
const referencePath = new URL(
  "../../../../../design_handoff/ayarlar-paketi/referans/Ayarlar-referans.dc.html",
  import.meta.url,
);
```

En az beş grup iddia:

1. Dört yüzeyin genişliği (`400`, `560`, `308`, `1180`) ve yarıçapları.
2. Sol nav genişliği + satır geometrisi + arama alanı yüksekliği.
3. Alt sekme şeridi ve içerik kolonu (`720`) ölçüleri.
4. Satır ve kontrol geometrisi (anahtar `38×22`, açılır menü `210×34`, eylem düğmesi `32`).
5. Hero bloğu ölçüleri (banner `132`, avatar `80`, halka `5`).

---

### 5. İçerik ağacı — `lib/settings/tree.ts`

Referanstaki `SET` dizisi **birebir** tipli bir ağaca çevrilir. Bu dosya bölüm şeritlerinin
(Ş7–Ş10) tek girdi kaynağıdır; hiçbir bölüm kendi satır listesini elle yazmaz.

```ts
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

export type SettingsRowDef = {
  key: string; // referanstaki anahtar (pn, nt3, ns1 …)
  type: SettingsControlType;
  titleKey: string; // settings.*
  descriptionKey?: string;
  badgeKey?: string; // "Doğrulandı", "Kilitli", "Önerilen" …
  tone?: "success" | "warning" | "danger" | "muted" | "info";
  defaultValue?: unknown;
  options?: readonly string[]; // select / segment seçenek anahtarları
  range?: readonly [number, number, string]; // slider: min, max, birim
  actions?: readonly { labelKey: string; kind?: "primary" | "danger" }[];
  block?: SettingsBlockKey; // type === "custom"
  target?: { section: SettingsSection; tab: SettingsTab }; // type === "jump"
  sharedWith?: readonly string[]; // paylaşılan anahtarlar (nd2, na5, na6, nq1, ns1)
  locked?: true; // typeSecurity / typeModeration
};

export type SettingsGroupDef = {
  titleKey?: string;
  noteKey?: string;
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
  group: "user" | "app" | "info";
  icon: string;
  desktopOnly?: true; // yalnız "desktop"
  tabs: readonly SettingsTabDef[];
};
export const SETTINGS_TREE: readonly SettingsSectionDef[];
```

`tree.test.ts` sayımları **kilitler**:

- 6 bölüm, sekme sayıları `6 / 3 / 5 / 7 / 5 / 1`.
- 58 grup, 170 satır.
- 20 benzersiz `block` anahtarı, 3 `risky` satır.
- `sharedWith` taşıyan 5 anahtar (`nd2`, `na5`, `na6`, `nq1`, `ns1`) **iki** sekmede geçiyor ve
  her iki geçişte `type` + `defaultValue` aynı.
- `np4` `sharedWith` taşımıyor (tuzak #4).
- `locked` yalnız `nt13` ve `nt14`.
- Her `titleKey` / `descriptionKey` sözlükte var (i18n testiyle kesişir).
- Hiçbir `jump.target` var olmayan bir sekmeye gitmiyor (sapma #7'nin kökü).

---

### 6. Rota çözücü — `lib/settings/navigation.ts` (yeniden yazılır)

```ts
export type SettingsSection = "account" | "av" | "appearance" | "notifications" | "desktop" | "about";
export type SettingsTab = /* 27 değer, birleşim */;

export function buildSettingsHref(section: SettingsSection, tab?: SettingsTab): string;   // /settings/account/profile
export function resolveSettingsRoute(section?: string, tab?: string): { section; tab };   // geçersizde ilk sekmeye düşer
export function migrateLegacySettingsQuery(params: URLSearchParams): string | null;       // ?section=&panel= → yeni yol
```

`migrateLegacySettingsQuery` eski 19 `SettingsPanelKey` değerinin **tamamını** yeni sekmelere
eşler; eşleşmeyen değer `null` döner ve çağıran `/settings/account/profile`'a düşer.
Eski özel dal (`section=about&panel=desktop` → `desktop/desktopDiagnostics`) korunur:
yeni karşılığı `desktop/updates`.

`navigation.test.ts` 19 eski değerin hepsi için eşleme iddiası taşır.

---

### 7. i18n iskeleti

~**420** anahtar, iki önek: `settings.*` ve `notif.*`. TR metinleri SPEC ve referanstaki metnin
**birebir aynısı** — kısaltma, yeniden yazım, "iyileştirme" yasak. EN karşılıkları aynı turda.

Anahtar şeması:

```
settings.nav.{user,app,info}
settings.section.{account,av,appearance,notifications,desktop,about}.{label,lead}
settings.tab.<section>.<tab>
settings.group.<section>.<tab>.<n>.{title,note}
settings.row.<key>.{title,description,badge}
settings.option.<key>.<n>
settings.action.<key>.<n>
settings.block.<blockKey>.*
notif.panel.*  ·  notif.prefs.*  ·  notif.menu.*
```

SPEC §8'deki 40 örnek anahtar **bu şemaya uydurulur** ama metinleri değişmez.

`settings-screen-copy.test.ts`:

- `SETTINGS_TREE` içindeki **her** `titleKey`, `descriptionKey`, `badgeKey`, `option`, `action`
  anahtarı `tr.ts` ve `en.ts` içinde var.
- TR metinler referanstaki dizeyle **birebir** eşleşiyor (dosyadan okunan `SET` metinleriyle
  karşılaştırma — spot kontrol değil, tam tarama).
- `tr.ts` ve `en.ts` anahtar kümeleri **aynı**.
- `settings.` / `notif.` önekinde ölü anahtar yok.

---

## Kabul

- [ ] Migration `packages/db/prisma/rebaseline-migrations/` altında ve yerel DB'de **koştu**.
- [ ] `pnpm --filter @wizards/db db:generate` temiz; `schema-settings-screen.test.mjs` yeşil.
- [ ] `UserNotificationSettings` üzerinde `typeSecurity` / `typeModeration` kolonu **yok**.
- [ ] Geri doldurma iki kez koşturulduğunda aynı sonucu veriyor (idempotent).
- [ ] Ters mantıklı iki kolon (`suppressEveryoneMentions`, `suppressRoleMentions`) hâlâ duruyor ve
      geri doldurma bunları **doğru** çeviriyor (`NOT`).
- [ ] `packages/types/src/settings.ts` SPEC §7'nin tamamını karşılıyor; `NotificationPrefsPatchSchema`
      kilitli tür anahtarlarını **kabul etmiyor**.
- [ ] `lib/settings/metrics.ts` renk taşımıyor; `SPEC_DEVIATIONS` **dokuz** kayıt.
- [ ] `parity.test.ts` referans HTML'e karşı yeşil; en az beş iddia grubu.
- [ ] `tree.test.ts` `6 / 3-5-6-7-5-1 / 58 / 170 / 20 / 3 / 5` sayımlarını kilitliyor.
- [ ] `navigation.test.ts` 19 eski `SettingsPanelKey` değerinin hepsini eşliyor.
- [ ] `settings-screen-copy.test.ts` tam tarama yapıyor ve yeşil; TR metinler referansla birebir.
- [ ] Hiçbir ekran dosyası değişmedi — bu şerit yalnız sözleşme kurdu.

## Kapı

```
pnpm --filter @wizards/db db:generate && pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/01-s0-rapor.md`
