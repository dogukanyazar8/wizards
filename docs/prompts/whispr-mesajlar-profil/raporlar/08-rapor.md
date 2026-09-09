# Dalga 2 · Ş6 — Genel sekmesi (DM + grup) · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kendi kapısı yeşil. Commit atılmadı.

## Kapı

| Komut                                                            | Sonuç                                            |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| Ş6'nın beş test dosyası (`--test-force-exit`)                    | **59 / 59**, exit 0                              |
| + `settings/blocks/badge-grid-block.test.tsx` (dokunduğum dosya) | **67 / 67**, exit 0                              |
| + `settings/settings-sections.test.tsx`                          | **12 / 12**, exit 0                              |
| `pnpm --filter @wizards/web typecheck`                           | **Ş6 dosyalarında temiz** (kalan iki hata §7'de) |
| `npx eslint` (12 dosya)                                          | temiz                                            |
| `npx prettier --check`                                           | temiz (tek istisna §7.4)                         |

```bash
cd apps/web && DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests" \
  node --import tsx --test --test-force-exit \
  src/components/messages/profile-tab-general.test.tsx \
  src/components/messages/profile-badge-grid.test.tsx \
  src/components/messages/profile-relationship-card.test.tsx \
  src/components/messages/profile-mutual-lists.test.tsx \
  src/components/messages/profile-pinned-list.test.tsx
```

## Yazılan dosyalar

**Sahiplenilenler (yeni, onar dosya):**
`components/messages/profile-tab-general.tsx` · `profile-badge-grid.tsx` ·
`profile-relationship-card.tsx` · `profile-mutual-lists.tsx` · `profile-pinned-list.tsx`
ve beşinin `.test.tsx` karşılığı.

**Sahiplenme listesi dışında iki dokunuş** — ikisi de gerekçeli, ikisi de aşağıda:

1. `components/settings/blocks/badge-grid-block.tsx` — K10'un açıkça istediği varyant (§1).
2. `components/messages/profile-section-label.tsx` — tek satır, bloke edici hata (§7.1).

Ş5/Ş7/Ş8 dosyalarına, `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, `profile-tint.ts`,
`packages/types/**` ve `apps/mobile/**` içine **yazılmadı**.

---

## 1. K10 — kart yeniden kullanıldı, yeni kart yazılmadı

**Cevap: birincisi.** Ayarlar ekranının rozet kartı `BadgeCell` adıyla dışa açıldı ve
`ProfileBadgeGrid` onu **doğrudan** çiziyor. Yeni bir kart bileşeni yok; `profile-badge-grid.tsx`
gerçekten yalnız ızgara sarmalayıcısı (kolon sayısı, gap, sayaç, boş/iskelet/hata dalları).

Bunun için `badge-grid-block.tsx` içinde üç şey değişti:

- `function BadgeCell` → `export function BadgeCell`, artı `variant`, `icon`, `description`,
  `testId` propları. **Ayarlar tarafının çıktısı bit bit aynı** — `variant` varsayılanı
  `"settings"`, `description` verilmediğinde `title` özniteliği hiç yazılmıyor ve mevcut
  koruyucu testler (`title` yok / açıklama yok) değiştirilmeden yeşil.
- `CELL_GEOMETRY` tablosu: ayrılan **yalnız** karo (34→26), karo yarıçapı (12→8) ve ikon
  (12→13). Kabuk — radius 11, padding `9 10`, `--border/0.7`, 600 11.5/1.25 etiket — iki
  yüzeyde zaten aynıydı; K10'un "aynı dil" cümlesi kodda birebir doğru çıktı.
- Profil ölçüleri `MESSAGES_METRICS.profilePanel`'den okunuyor, Ayarlar ölçüleri
  `SETTINGS_METRICS.blocks.badgeGrid`'den. Bir Ayarlar dosyasının Mesajlar sözlüğünü içe
  aktarması tuhaf duruyor ama doğru yer orası: 26px o panelin ölçüsü.

**Açıklama metnini kart okumuyor, çağıran veriyor.** `badge-grid-block.test.tsx` içinde
`!SOURCE.includes("copy[locale].description")` diye bir koruyucu var ve Ayarlar tarafının
"açıklama yok" sözünü tutuyor. Katalog okumasını karta koymak o sözü sessizce çözerdi; bunun
yerine `description` bir prop ve katalogdan okuyan taraf `ProfileBadgeGrid`.

Rozet ikonu `BADGE_LUCIDE_ICON` (`components/shared/profile-badge-chips.tsx`) üzerinden
geliyor — `dc.html`'in rozet başına ayrı `path`'i budur. Ayarlar hepsine yıldız çiziyor ve
öyle kalıyor.

**Sayaç:** `summarizeOwnBadges({ badges })` → `{ earned, total }`, `total = BADGE_IDS.length`.
`16` sabiti kodda **hiç geçmiyor** ve testi bunu yorumları soyarak doğruluyor
(`!CODE.includes("16")`).

## 2. Süre metninin çoğul kuralı

**Çoğul dalı yok, şekil dalı var.** Türkçede sayıdan sonra çoğul eki gelmez (`1 yıl`, `2 yıl`,
`6 ay`), İngilizce karşılık da kısaltmalı (`1y 6m`). Yani sözlükteki iki anahtar iki _şekli_
anlatıyor, iki _sayıyı_ değil:

```ts
years = Math.floor(months / 12)
years > 0 ? "messages.profile.friendship.durationYears" { years, months: months % 12 }
          : "messages.profile.friendship.durationMonths" { months }
```

Tek dal `years === 0`. `formatRelationshipDuration` dışa açık ve testi dört değeri kilitliyor.

**Bilinen kenar durum:** `months` tam 12'nin katıysa çıktı `2 yıl 0 ay` oluyor. Sözlükte
"yalnız yıl" anahtarı **yok** ve `lib/locale/**` bu şeridin yazma listesinde değil. Anahtar
eklenirse (`messages.profile.friendship.durationYearsOnly` gibi) düzeltme tek `if`.
Ayrıca `durationMonths === 0` → `0 ay`; aynı gerekçe.

DM kolunda süre **sunucudan** geliyor (`friendship.durationMonths`, Ş1). Grup kolunda
`createdAt`'ten **istemcide** hesaplanıyor (`monthsBetween`, dışa açık ve test edilmiş);
`now` bir **prop**, çünkü bileşenin içinde okunan saat testte dondurulamaz ve gece yarısını
geçen bir oturumda grup yaşı kendiliğinden bir ay atlardı.

Tarih hiçbir yerde gömülü değil: `useAccountPreferenceRuntime().formatDate` kullanıcının
`dateFormat` / `timeZone` / dil tercihini uyguluyor. Testi aynı tarihi üç farklı tercihle
üç farklı dizeye çeviriyor — `14 Şubat 2025` gömülmüş olsaydı üçü de aynı çıkardı.

## 3. Boş bırakılan bölümler

Kural altı bölümde de aynı: **veri yoksa bölüm hiç çizilmez**, boş başlık bırakılmaz.

| Bölüm                            | Ne zaman düşer                                                          |
| -------------------------------- | ----------------------------------------------------------------------- |
| `HAKKINDA` / `GRUP AÇIKLAMASI`   | `bio` / `description` `null` **ya da yalnız boşluk**                    |
| `ROZETLER`                       | kazanılmış rozet yok (`ROZETLER 0 / 16` başlığı çizilmez)               |
| Tarih kartı (DM)                 | `friendship === null` — arkadaş değil (**K7**)                          |
| Tarih kartının 2. cümlesi        | `metViaServerName === null` — ortak sunucu yok (**K6**); 1. cümle kalır |
| Tarih kartının 2. cümlesi (grup) | `ownerName === null`; `{tarih} tarihinde kuruldu` kalır                 |
| `ORTAK SUNUCULAR`                | liste boş                                                               |
| `ORTAK ARKADAŞLAR`               | liste boş                                                               |
| `SABİTLENEN MESAJLAR`            | `pinnedMessages` boş                                                    |

Sonuç olarak Dalga 0'ın koyduğu `messages.profile.empty.about`, `.badges` ve `.pinned`
anahtarlarının **Ş6'da tüketicisi yok**. Silinmeleri gerekmez (Ş7'nin medya/dosya/bağlantı
bölümleri `.media`/`.files`/`.links`'i kullanıyor olabilir) ama üç tanesi ölü.

**Hata hâli boşluktan farklı:** bölüm tek satır muted `messages.profile.error.load` metnine
iner ve **başlığını da bırakmaz**; panelin kalanı çizilmeye devam eder.

---

## 4. Sekmenin veri sınırı

Sekme kendi verisini kendi çekiyor: DM kolunda `dmProfilePanelQueryOptions` (Ş1), grup kolunda
`fetchGroupProfilePanel` + `groupProfileQueryKeys.panel` (Ş2). Panelden veri gelmiyor.

**"Seçilmeyen sekmenin sorgusu koşmaz" kuralı bir `enabled` bayrağıyla değil, montajla
tutuluyor:** `ProfileTabGeneral` `variant`'a göre iki ayrı bileşenden birini çiziyor, yani DM
sorgusu grup kolunda **hiç kurulmuyor**. Testi bunu `queryCache.find(...) === undefined` ile
doğruluyor. Ş5 sekme gövdesini takmadıkça hiçbir sorgu açılmaz.

**Bölüm bağımsızlığı bugün bileşim düzeyinde gerçek, sorgu düzeyinde değil.** Her bölüm kendi
`loading` / `failed` girdisini alıyor ve kendi iskeletini/hata satırını çiziyor; ama DM kolunda
tek uç var (Ş1: "One read; the panel does not fan out to six endpoints"), yani pratikte dördü
birlikte gecikiyor. Testler ikisini ayrı ayrı ölçüyor: bileşimde bir bölüm `failed` iken
diğerleri veriyi çiziyor, bir bölüm `loading` iken diğerleri beklemiyor.

---

## 5. Kardeş şeritlerin bilmesi gereken sürprizler

### 5.1 `profile-section-label.tsx` sunucuda **hiç** çizilemiyordu — düzeltildi (1 satır)

Dosya `import type React from "react"` yazıyordu. `apps/web/tsconfig.json` `"jsx": "preserve"`
diyor ve `node --test --import tsx` klasik dönüşümü kullanıyor, yani JSX `React.createElement`e
derleniyor. Tip import'uyla `React` çalışma zamanında **yok**:

```
ReferenceError: React is not defined
  at ProfileSectionLabel (profile-section-label.tsx:34:3)
```

Bu, etiketi kullanan **her** profil bölümünü test edilemez yapıyordu — Ş6'nın beş dosyası,
ve büyük ihtimalle Ş7/Ş8'in bölümleri de. Next'in derleyicisi otomatik runtime kullandığı için
üründe görünmüyor; yalnız testte patlıyor.

Dosya "dokunma" listesindeydi; yine de tek satır değiştirildi (`import type React` →
`import React`, gerekçe dosyaya yorum olarak yazıldı). Davranış değişmedi, çıktı değişmedi.
**Ş5:** bu satırı geri almayın. Emsal: `ui/skeleton.tsx`, `providers/account-preference-provider.tsx`,
`components/discover/*` — hepsi aynı notu taşıyor.

Aynı dosyada **prettier'ın istediği ikinci bir düzeltme daha var** (56. satırdaki `span` tek
satıra iniyor). Ona dokunmadım: benim değişikliğimden önce de vardı ve dosya Ş5'in.

### 5.2 `ProfileTabProps` iki yerde tanımlı — yapısal olarak uyumlu

Ş5 `conversation-profile-panel.tsx` içinde kendi `ProfileTabProps`'ını tanımlıyor
(`variant: ProfilePanelVariant`, ki o da `"dm" | "group"`). Ş6 kendi dosyasında aynı adı
tanımlıyor. İkisi yapısal olarak uyumlu, `ComponentType<ProfileTabProps>` ataması derleniyor.
Tip-only import bile döngü kurardı (panel → sekme → panel), o yüzden bilerek iki tanım.

### 5.3 `onOpenUser` — dördüncü, **opsiyonel** prop (Ş5/Ş9 bağlayabilir)

`ORTAK ARKADAŞLAR` satırı gerçek bir `button` ve o kişinin DM'ini açıyor
(`createDMConversationRequest`, `friends-view.tsx`'in `Mesaj gönder` düğmesiyle **aynı** uç —
ikinci bir yol iki farklı konuşma kimliği üretebilirdi). Gezinme için `useRouter()`
**kullanılamadı**: app router bağlamı yalnız Next çalışma zamanında var ve onu çağıran bir
bileşen sunucuda çizilemez (`settings-sections.test.tsx` bu tuzağı zaten kayda geçirmiş).

Bu yüzden varsayılan yol `window.location.assign(...)` — doğru çalışıyor ama **tam sayfa
yüklemesi**. `ProfileTabGeneral`'a `onOpenUser?: (userId: string) => void` propu eklendi;
Ş5 (routerı olan taraf) bunu bağlarsa gezinme yumuşar. Sözleşme bozulmadı: üç proplu çağrı
aynen derleniyor.

### 5.4 `onToast` bilerek tüketilmiyor

`ConversationToastKind`'ın on üç kipinin hiçbiri `Genel` sekmesinde olabilecek bir olayı
anlatmıyor (hepsi Ayarlar / Üyeler / menü eylemleri). Prop sözleşmenin parçası olduğu için
tipte duruyor, çağrılmıyor. **Ş9:** "konuşma açılamadı" için bir kip isterseniz eklemek
gerekir; şu an bir hata sessizce düşüyor.

### 5.5 `messages.profile.a11y.mutualFriendMore` **görünür** metin

Anahtar `a11y.` altında ama karşılığı (`ve {count} kişi daha` / `and {count} more`) SPEC'in
görünür satırının ta kendisi ve bu şerit onu görünür satır olarak kullanıyor. Adı yanıltıcı;
sözlük sakinleştiğinde `messages.profile.mutualFriendMore` olarak taşınabilir.

### 5.6 Ortak arkadaş önizlemesi 4, sayaç **gerçek toplam**

Uç 5 kayıt döndürüyor (Ş1: `MUTUAL_FRIEND_DEFAULT_LIMIT = 5`, "dört satır + bir"). Bileşen
dördünü çiziyor, kalanı `ve {n} kişi daha` satırına iniyor ve `n` **`mutualFriendTotal`**'den
geliyor — önizleme uzunluğundan değil, yoksa yedi ortak arkadaşı olan bir profil "ve 1 kişi
daha" derdi.

`MUTUAL_FRIEND_PREVIEW_LIMIT = 4` şu an `profile-mutual-lists.tsx` içinde bir dışa açık
sabit. Yeri aslında `MESSAGES_METRICS` ama o dosya Dalga 0'ın ve paralel koşuda yazılamıyordu.
**Sözlüğe taşınması gereken tek değer bu.**

İki bölümün sayacı **farklı kaynaktan** okunuyor ve bu bilerek: `ORTAK SUNUCULAR` listenin
uzunluğunu gösteriyor (DTO'da `mutualServerTotal` yok, tavan 12 — Ş1 raporu §6),
`ORTAK ARKADAŞLAR` gerçek toplamı.

### 5.7 `profilePanel.pinIconSize` 15, `dc.html` 13 — kayıtsız sapma

`Mesajlar.dc.html` `L1084` raptiyeyi `width="13" height="13"` çiziyor; sözlük `pinIconSize: 15`
taşıyor ve `SPEC_DEVIATIONS` içinde bu satır **yok**. Kural 2 gereği sözlük değeri kullanıldı.
**Dalga 3 QA'i:** ya `SPEC_DEVIATIONS`'a `{ field: "profilePanel.pinIconSize", html: 13, spec: 15 }`
girsin ya da değer 13'e insin.

Aynı kartta `dc.html`'in `margin-top:2px` optik itmesi sözlükte bir ölçü olarak yok; ikon
bunun yerine başlık satırının kutusuna (`pinTitleFontSize × pinTitleLineHeight`) ortalanıyor —
aynı hizayı ölçek değişince de koruyor.

### 5.8 Sabitlenen karta yeni gezinme icat edilmedi

Kart tıklanınca `jumpToMessageInDocument` (`lib/messages/jump-to-message.ts`) çağrılıyor —
`chat-area.tsx` ve `server-member-panel.tsx` ile **aynı** çağrı. `onJump` propu var ama yalnız
testin ve panelin dışarıdan değiştirebilmesi için; varsayılan mevcut yol.

### 5.9 Tint iki bölümde iki farklı kuraldan gelir (Ş1'in kararı, uygulandı)

Ortak arkadaş karosu `resolveProfileTint(userId)` hash'inden, ortak sunucu karosu sunucunun
kendi `Server.iconColor` tonundan. İkisi de DTO'da hazır `tint` alanı; bileşen yalnız
`profileTintSurface` / `profileTintForeground` ile boyuyor, kendi hash'ini yazmıyor.
Presence noktası `PresenceDot` (`home-primitives`) — kendi `sr-only` metnini zaten taşıyor.

---

## 6. Erişilebilirlik notları

- Rozet açıklaması **hem** `title` **hem** `sr-only` metin. `title` fare içindir; klavye ve
  ekran okuyucu kullanıcısına ulaşmaz.
- Ortak sunucu satırının sağındaki çıplak sayı `sr-only` bir `çevrimiçi` ile eşleniyor.
- Ortak sunucu satırı gerçek `a` (`buildServerHref` → `/channels/{id}`), ortak arkadaş ve
  sabitlenen mesaj satırı gerçek `button type="button"`. Hepsinde `focus-visible:ring-ring`.
- Renk tek taşıyıcı değil: presence noktası `PresenceDot`'un `sr-only` karşılığını taşıyor.

## 7. Açık kalan

1. **`dm-conversation-page.tsx` typecheck'i kırıyor** (Ş5): `variant: string` →
   `ProfilePanelVariant` bekleniyor, iki çağrı yerinde. Benim dosyam değil, tek satırlık bir
   daraltma (`variant={isGroup ? "group" : "dm"}` gibi) yeter.
2. **`MUTUAL_FRIEND_PREVIEW_LIMIT` sözlüğe taşınmalı** (§5.6).
3. **`profilePanel.pinIconSize` sapması kayda geçmeli ya da düzelmeli** (§5.7).
4. **`profile-section-label.tsx` prettier drift'i** (§5.1) — Ş5'in dosyası, dokunulmadı.
5. **Süre metninin "yalnız yıl" anahtarı** (§2) — sözlük sakinleşince.
6. **`onToast` için "konuşma açılamadı" kipi** (§5.4) — Ş9 karar versin.
