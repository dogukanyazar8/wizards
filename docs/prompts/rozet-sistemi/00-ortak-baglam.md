# 00 — Ortak bağlam (her prompt bunu önce okur)

Bu dosya uygulanmaz; 01–09 arasındaki her prompt bu kuralları **veri kabul eder**.

---

## 1. Çalışma kuralları

- Branch `uat`. **Commit yok, push yok, rebase yok.** İş çalışma ağacında bırakılır.
- Cihaz testlerini kullanıcı yapar. Prompt'lar emülatör/cihaz koşturmaz; typecheck + node
  - jest testleri koşturur ve çıktısını rapor eder.
- **Uydurma yasak.** Katalogda olmayan rozet, eşiğe uymayan sayı, tasarım kaynağında
  olmayan renk/ölçü üretilmez.
- Tasarım kaynağı: `design_handoff/design_handoff_whispr_profil/`
  - `Whispr Profil Ekranı.dc.html` — rozet chip'leri: 1a kartı **330–332**, 1c sayfası
    **491–493**, 1d kendi kartı **629–630**.
  - `README.md` — token tablosu; rozet kutusu **28×28 r10**, glyph 14px, stroke 1.9.
  - `screenshots/1a-hizli-profil-kanal.png`, `1c-tam-profil.png`, `1e/1f` koyu tema.
- Çelişkide sıra: ekran görüntüsü > HTML inline stil > README metni.

---

## 2. Repo gerçekleri (doğrulanmış, 2026-08-05)

### Platform topolojisi — üç değil, iki kod tabanı

- `apps/desktop` = **Tauri kabuğu**. `src-tauri/tauri.conf.json` → `devUrl: http://localhost:3000`.
  Kendi UI'ı yok, `apps/web`'i yükler. **Desktop için ayrı iş yapılmaz**; web'de yapılan
  desktop'ta görünür. Desktop'a özgü tek kontrol: pencere genişliğinde popover taşması.
- `apps/mobile` = React Native / Expo, kendi kopyası.
- Backend tek: `apps/web`. Mobil de web de aynı Next.js API'sini konuşur.

### Mevcut rozet sistemi (değiştirilecek)

- Türetme: `apps/web/src/lib/social/mobile-user-profile-service.ts:129`
  `deriveMobileProfileBadges({ premiumType, registeredAt, usedInviteCount })`.
  Üç rozet: `earlyMember` (`registeredAt < WHISPR_EARLY_MEMBER_BEFORE`, varsayılan
  `2026-01-01T00:00:00.000Z`), `supporter` (`premiumType !== "NONE"`),
  `inviter` (`serverInvite.count({ createdById, uses: { gt: 0 } }) > 0`, satır 396).
- Tip: `packages/types/src/mobile-social.ts:611`
  `MobileProfileBadgeSchema = z.enum(["earlyMember","supporter","inviter"])`,
  profil alanı satır 665 `badges: z.array(...).max(8)`.
- Mobil çizim: kart `apps/mobile/src/social/profile-card/profile-card-view.tsx:292`
  (`ProfileBadgeChips`), sayfa `.../profile-page/mobile-profile-page-sections.tsx:247`.
  Glyph eşlemesi satır 50 (`star`/`bolt`/`person-plus`), tint satır 56, etiket satır 79.
- Ölçü: `.../profile-page/mobile-profile-page.styles.ts:17` (`badge: 28`, `badgeGlyph: 14`,
  `badgeRadius: 10`).
- Metin: `apps/mobile/src/locale/mobile-copy.ts:1695` (`profileBadgeEarlyMember`,
  `profileBadgeInviter`, `profileBadgeSupporter`) + `:3975` İngilizcesi.
- **Web'de rozet yok.** `apps/web/src/components/shared/user-profile-popover.tsx` (613 satır)
  hiç rozet çizmiyor; `message-item.tsx` ve `friend-card.tsx` kullanıyor.
- **Web'de tam profil sayfası yok.** `apps/web/src/app/(main)` altında yalnız `channels`.

### <a id="uyumluluk"></a>Uyumluluk kısıtı — SÖZLEŞMEYİ KIRMA

`MobileUserProfileSchema` **`.strict()`** (`mobile-social.ts:687`) ve mobil istemci onu
`parse` ediyor (`apps/mobile/src/social/mobile-social-client.ts:172`). OTA kapalı
(`app.config.js` içinde `updates` anahtarı yok), sahada 0.8.15 istemcileri var.

Sonuç, üçü de bağlayıcı:

1. `MobileUserProfileSchema`'ya **alan eklenmez**. Eklenen bilinmeyen anahtar eski
   istemcide `parse` hatası verir, kart hiç açılmaz.
2. `MobileProfileBadgeSchema` enum'una **değer eklenmez**. Bilinmeyen enum değeri aynı
   hatayı verir.
3. Profil payload'ındaki `badges` alanı **donmuştur**: yeni motordan beslenir ama yalnız
   `earlyMember | supporter | inviter` üçünü, eski sırayla döndürür. Eski istemci bugün ne
   görüyorsa aynısını görmeye devam eder.

Zengin rozet listesi **ayrı uçtan** gelir (prompt 03). Donmuş alan W4'te, 0.8.x sahadan
düştüğünde kaldırılır — o zamana kadar kaldırma önerisi bile getirilmez.

### Veri kaynakları (rozetlerin beslendiği yer)

- `UserDailyMetric` (`packages/db/prisma/schema.prisma:503`) — `@@unique([date, userId, clientType])`,
  UTC gün başlangıcı. Alanlar: `appSeconds`, `messageCount`, `dmMessageCount`,
  `fileUploadCount`, `uploadedBytes`, `voiceSeconds`, `cameraSeconds`, `screenShareSeconds`,
  `sessionCount`. Canlı yazılıyor: `apps/web/src/lib/analytics/service.ts:89`
  (`incrementUserDailyMetric`), çağıranlar `startAppSession:204`, `endAppSession:271`
  (`appSeconds`), `recordMessageCreated:290`.
  **Bir kullanıcının bir gününde birden çok satır olabilir** (clientType başına bir tane) —
  gün bazlı her sorgu `clientType` üzerinden toplamak zorundadır.
- `ServerInvite` (`schema:1009`) — `createdById`, `uses`, `maxUses`, `targetUserId`.
- `Server.ownerId` + `ServerMember` — kurucu eşiği.
- `Feedback.roadmapItemId` → `RoadmapItem.status` (`FeedbackStatus`: `REVIEWING|PLANNED|IN_PROGRESS|SHIPPED`).
- `BugReport.status` (`BugReportStatus`: `OPEN|TRIAGED|RESOLVED|DISCARDED`), `schema:1911`.
- `AdminMembership.role` (`AdminRole`: `OWNER|ADMIN|SUPPORT|ANALYST|MODERATOR`), `schema:435`.
- `User`: `registeredAt`, `premiumType` (`PremiumType`: `NONE|BASIC|FULL`), `premiumSince`,
  `emailVerified`, `twoFactorEnabled`, `isBanned`, `isBot`, `deletedAt`,
  `preferredReleaseChannel`.
- `ModerationCase` (`schema:712`) — `subjectId`, `status` (`ACTIONED` = yaptırım uygulandı).
- `AppSession` (`schema:470`) — `clientType`, `appVersion`, `startedAt`.
- `Contributor` (`schema:1503`) — **şu an yalnız `name`**, `userId` prompt 01'de eklenir.

### Bilinen bozukluklar (prompt 01/03 düzeltir)

- `deriveMobileProfileBadges` `premiumType: string` alıyor, enum değil; testi geçersiz
  `"TIER_1"` değerini kullanıyor (`mobile-user-profile-service.test.ts:13`).
- `premiumType`'ı yazan hiçbir faturalandırma akışı yok. Repo genelinde tek yazma:
  anonimleştirme sıfırlaması (`apps/web/src/lib/account/privacy-service.ts:586`).
  **`supporter` bilerek boş rozettir.** Test verisi dışında kimse taşımaz.

### Web / veri katmanı kuralları

- Prisma şeması `packages/db/prisma/schema.prisma`; generator → `../src/generated/prisma`.
- **Migration'lar yalnız `packages/db/prisma/rebaseline-migrations/` altından okunur.**
  `migrations/` klasörüne yazılan dosya sessizce hiç çalışmaz. İsim
  `YYYYMMDDHHmmss_snake_case_ad`; en son `20260731120000_encrypt_totp_secrets`.
- Mobil rota deseni: `apps/web/src/app/api/v1/mobile/<alan>/route.ts` + `route-logic.ts`.
  `route.ts` yalnız HTTP metodunu devreder; `route-logic.ts` `XRouteDependencies` tipi +
  `defaultDependencies` sabiti taşır (**DI zorunlu** — web testlerinde DB yok).
- Kimlik: `requireMobileApiUserId(request)` / `requireApiUserId()` (`@/lib/auth/api`).
- Hız sınırı: `enforceApiRateLimit(userId, action)`; `action` **kapalı union**
  (`apps/web/src/lib/api-rate-limit.ts:6`, `API_RATE_LIMITS`). Mevcut `"user:profile"`
  satır 210, `{ limit: 60, windowSeconds: 60 }`.
- Yeni rota eklerken **zorunlu üç kayıt**: `apps/web/src/app/api/v1/route-contract.test.ts`
  (gövdesiz mutasyon / kimliksiz yol listeleri), `api-rate-limit.ts` union'ı, admin ise
  `admin-route-capability.test.ts` → `ROUTE_CAPABILITY_PINS`.
- Bildirim yazma deseni: `apps/web/src/lib/feedback/feedback-service.ts:524`
  (`client.notification.create` + `NotificationType`), socket yayını
  `emitToUserRooms` (`apps/web/src/lib/socket/emitters.ts:16`).

### Mobil mimari kuralları

- Tema: `apps/mobile/src/design/palette.ts` → `themes.ts` (`lightTheme`/`darkTheme`) →
  `useTheme()`. **Bileşende ham renk literali yazılmaz.**
- İkonlar: `apps/mobile/src/design/mobile-line-icon-definitions.ts`
  (`MOBILE_LINE_ICON_NAMES`, 78 ad). Katalogun ihtiyaç duyduğu **5 ad yok**:
  `flame`, `lightbulb`, `code`, `flask`, `sparkle`. Prompt 04 ekler.
- Metin: `apps/mobile/src/locale/mobile-copy.ts`, `{ tr, en }`, düz camelCase.
  `scripts/mobile-copy-parity.test.ts` iki dilin anahtar kümesini karşılaştırır.
  `mobile-design-contract.test.ts` ürün ekranlarında `mobileCopy.tr` doğrudan erişimini
  yasaklar → daima `const copy = mobileCopy[locale]`.
- `maxFontSizeMultiplier` literal ve **≥ 2** olmak zorunda. Rozet chip'inde metin yok
  (yalnız glyph + `accessibilityLabel`), `+N` chip'i metin taşır → kuralı uygular.
- Yeni rota eklerken **beş dosya birlikte** güncellenir: `mobile-navigation-types.ts`,
  `mobile-navigator.tsx`, `mobile-screen-containers.tsx`, `mobile-linking.ts`,
  `mobile-navigation-ref.ts`. Aksi hâlde `mobile-deep-link-contract.test.ts` kırmızı.
- Sheet'ler tek pencere `kit/overlay-host.tsx` üzerinden açılır, ayrı `Modal` açılmaz.

### Web istemci kuralları

- Metin: `apps/web/src/lib/locale/messages/tr.ts` + `en.ts`, **düz noktalı anahtar**
  sözlüğü (`"profile.memberSince": "{date} tarihinden beri üye"`), kullanım
  `const { t } = useI18n()` (`@/components/providers/locale-provider`).
- Veri: `@tanstack/react-query`. İkon seti `lucide-react`. Animasyon `framer-motion`.
- Popover portal + `framer-motion` ile çiziliyor; rozet satırı aynı dosyaya girer.

---

## 3. Mimari — üç katman

| Katman      | Nerede                                             | Rozetler                                                                                                    |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **DERIVED** | okuma anında hesaplanır, satır yazılmaz            | `earlyMember`, `veteran`, `staff`, `verified`, `supporter`                                                  |
| **AWARDED** | `UserBadge` satırı; değerlendirici yazar           | `inviter`, `founder`, `ideaShipped`, `bugHunter`, `streak`, `regular`, `voice`, `broadcaster`, `betaTester` |
| **GRANTED** | `UserBadge` satırı; admin yazar, audit log zorunlu | `contributor`, `event`                                                                                      |

Bağlayıcı kurallar:

- **Okuma yolunda aggregate sorgu yok.** Profil/rozet okuması: 1 indeksli `UserBadge`
  select + `User` satırından türetme. `UserDailyMetric` **okuma yolunda taranmaz**.
- Değerlendirici **idempotent**: aynı olayı iki kez işlemek ikinci satır yaratmaz
  (`@@unique([userId, badge])`), kademe yalnız yukarı gider.
- Değerlendirici **asla isteği bloklamaz**: tetikleyici çağrısı hata verirse yutulur ve
  `logError` ile kaydedilir; mesaj gönderimi rozet yüzünden başarısız olmaz.

---

## 4. KANONİK KATALOG — 16 rozet, 28 kademe

Bu tablo tek doğruluk kaynağıdır. `packages/types/src/badges.ts` bunu birebir kodlar.
Eşik değiştirmek isteyen prompt **değiştiremez**; bu dosya güncellenir.

### A. Kimlik — DERIVED, kalıcı

| id            | kademe | koşul                                                                       | glyph      | tint    |
| ------------- | ------ | --------------------------------------------------------------------------- | ---------- | ------- |
| `staff`       | 1      | `AdminMembership` var **ve** rolü `ANALYST` değil                           | `shield`   | indigo  |
| `verified`    | 1      | `emailVerified && twoFactorEnabled` **ve** `ACTIONED` moderasyon vakası yok | `check`    | mavi    |
| `earlyMember` | 1      | `registeredAt < WHISPR_EARLY_MEMBER_BEFORE`                                 | `star`     | lavanta |
| `veteran`     | 1/2/3  | hesap yaşı ≥ **1 / 2 / 3** yıl                                              | `calendar` | lavanta |

### B. Katkı — AWARDED (`contributor` GRANTED)

| id            | kademe | koşul                                             | glyph         | tint    |
| ------------- | ------ | ------------------------------------------------- | ------------- | ------- |
| `inviter`     | 1/2/3  | kabul edilmiş davet ≥ **1 / 10 / 50**             | `person-plus` | yeşil   |
| `founder`     | 1/2    | sahibi olduğu **tek** sunucuda ≥ **25 / 100** üye | `servers`     | mor     |
| `ideaShipped` | 1      | `Feedback.roadmapItem.status = SHIPPED` ≥ 1       | `lightbulb`\* | turuncu |
| `bugHunter`   | 1/2    | `BugReport.status = RESOLVED` ≥ **1 / 5**         | `bug`         | kırmızı |
| `contributor` | 1      | `Contributor.userId` eşleşmesi (admin grant)      | `code`\*      | nötr    |

### C. Aktiflik — AWARDED

| id            | kademe | koşul                                                     | glyph         | tint    |
| ------------- | ------ | --------------------------------------------------------- | ------------- | ------- |
| `streak`      | 1/2/3  | **ardışık** aktif gün ≥ **7 / 30 / 100**                  | `flame`\*     | turuncu |
| `regular`     | 1/2/3  | mesaj attığı **farklı gün** ≥ **30 / 100 / 365**          | `chat-bubble` | yeşil   |
| `voice`       | 1/2    | toplam `voiceSeconds` ≥ **36 000 / 360 000** (10s / 100s) | `mic`         | mavi    |
| `broadcaster` | 1      | toplam `screenShareSeconds` ≥ **18 000** (5s)             | `video`       | mor     |

### D. Ticari — DERIVED

| id          | kademe | koşul                                                      | glyph  | tint    |
| ----------- | ------ | ---------------------------------------------------------- | ------ | ------- |
| `supporter` | 1/2    | `premiumType != NONE`; kademe 2 = `premiumSince` ≥ 180 gün | `bolt` | turuncu |

### E. Etkinlik

| id           | kademe | katman  | koşul                                                             | glyph       | tint     |
| ------------ | ------ | ------- | ----------------------------------------------------------------- | ----------- | -------- |
| `betaTester` | 1      | AWARDED | `preferredReleaseChannel = BETA` **ve** o kanalda ≥1 `AppSession` | `flask`\*   | mavi     |
| `event`      | 1      | GRANTED | admin verir, `expiresAt` **zorunlu**                              | `sparkle`\* | değişken |

\* `MOBILE_LINE_ICON_NAMES` içinde **yok**, prompt 04 ekler.

### Tanımlar (yoruma açık bırakılmaz)

- **Aktif gün** = o UTC gününde `sum(appSeconds) ≥ 60` olan gün. Tüm `clientType`
  satırları toplanır.
- **Mesaj günü** = o UTC gününde `sum(messageCount + dmMessageCount) > 0` olan gün.
  Mesaj **sayısı** hiçbir rozette kullanılmaz — spam farming'i kırmak için gün sayılır.
- **Kabul edilmiş davet** = `ServerInvite.uses` toplamı; `targetUserId = createdById`
  olan satırlar (kendine davet) hariç.
- **Ardışık gün** = `UserBadgeProgress.streakDays`; bir gün atlanırsa 1'e sıfırlanır.
  Kademe **düşmez** (bir kez kazanılan `streak` kademesi kalıcıdır); ilerleme sıfırlanır.
- **`founder` tek sunucuda** = üye eşiği tek bir sunucuda karşılanmalı, sunucular toplanmaz.

### Öncelik sırası (kart 3 chip gösterir)

```
staff > verified > supporter > earlyMember > event > ideaShipped > contributor
      > founder > streak > inviter > bugHunter > regular > voice > broadcaster
      > betaTester > veteran
```

Eşitlik bozucular: önce kademe (yüksek önde), sonra `earnedAt` (eski önde), sonra id
alfabetik. Sıralama **tamamen deterministik** olmalı — aynı kullanıcı her açılışta aynı
üç chip'i görür.

### Tint token'ları

Mevcut üç tint `theme.profileCard.badge{Early,Supporter,Inviter}{Surface,Border,Icon}`
olarak duruyor. Katalog **dört yeni tint** istiyor: `mavi`, `mor`, `kırmızı`, `nötr`.
Prompt 04 bunları `palette.ts` içinde **yeni bir `profileBadge` grubu** açarak ekler ve
mevcut üçünü oraya taşır (eski anahtarlar geriye dönük alias olarak korunur).
Açık tema kaynak değerleri handoff README token tablosundan:
mavi `#E0F0FA`/`#2B7AC7`, mor `#F3E8FA`/`#8A46C7`, kırmızı `#FCE9E9`/`#E05252`,
nötr `#F6F7FB`/`#E7E9F4`/`#6B7194`. Koyu tema karşılıkları mevcut koyu rozet
token'larının desenini izler (yüzey `rgba(<icon>, .12)`, kenarlık `.24`).

### İptal matrisi

| olay                                         | sonuç                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `User.isBanned = true`                       | tüm rozetler **gizlenir** (satır silinmez)                              |
| `User.deletedAt` dolu                        | tüm rozetler gizlenir                                                   |
| `ModerationCase.status = ACTIONED` (subject) | `inviter`, `founder`, `contributor`, `verified` **iptal** (`revokedAt`) |
| `premiumType → NONE`                         | `supporter` düşer (DERIVED, kendiliğinden)                              |
| `twoFactorEnabled → false`                   | `verified` düşer (DERIVED)                                              |
| sunucu üye sayısı eşiğin altına düşer        | `founder` kademesi **düşer** (tek istisna)                              |
| `event.expiresAt` geçti                      | rozet okumada filtrelenir                                               |

---

## 5. Metin (i18n) kuralı — iki platform, tek metin

**Rozet adı ve açıklaması `packages/types/src/badges.ts` içinde `tr` + `en` olarak
katalogda durur.** Mobil `mobile-copy.ts` ve web `messages/tr.ts` bu metinleri
**kopyalamaz**; ikisi de katalogdan okur. Gerekçe: "kullanıcılar farklı içerik görmeyecek"
kısıtı iki ayrı sözlükte drift'e dayanmaz.

Uygulama sözlüklerine yalnız **çerçeve metni** girer (rozete özgü olmayan):
"Rozetler", "Tümünü gör", "Sonraki kademe", "Kazanıldı", "%N kullanıcıda".

Üslup: ikinci tekil şahıs, samimi. Rozet adı büyük harfle başlar, cümle değildir
("Erken üye"). Açıklama tek cümle, nokta ile biter ("Whispr'ın ilk günlerinden beri buradasın.").

---

## 6. Test ve doğrulama komutları

Tümü **paket dizininden** çalışır (repo kökünden `tsx` çözülmüyor).

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

`apps/web` içinden web node testi:

```bash
node --test --import tsx src/lib/badges/badge-service.test.ts
```

`apps/mobile` içinden mobil node testi:

```bash
node --test --import tsx scripts/<ad>.test.ts
```

`apps/mobile` içinden bileşen testi:

```bash
npx jest component-tests/<ad>.test.tsx
```

Migration eklendikten sonra:

```bash
pnpm --filter @wizards/db exec prisma generate
```

### Tuzaklar

- `typecheck` **pnpm ile** çalıştırılmalı. `npm run typecheck` altında runner
  `+ '11.16.0' - 'Version 7.0.2'` diyerek derlemeye başlamadan ölür.
- RNTL 14 asenkron: `render()` ve `fireEvent.*` promise döner. **Await edilmezse** aynı
  dosyadaki sonraki testler bozuk ağaç render eder ve testler tek tek geçip toplu kırılır.
- UAT veritabanına dışarıdan bağlanılamaz; migration yalnız deployment'ta uygulanır.
  Uygulanmış migration seti = son SUCCESS deployment'ın commit'i.
- `@wizards/types` kaynaktan çözülür (`exports` → `./src/index.ts`), build adımı yok;
  `dist/` import edilmiyor.

---

## 7. Yapılmayacaklar

- `MobileUserProfileSchema`'ya alan eklemek veya `MobileProfileBadgeSchema` enum'unu
  genişletmek. (§2 [Uyumluluk](#uyumluluk))
- Okuma yolunda `UserDailyMetric` taramak.
- Rozet metnini iki sözlüğe kopyalamak.
- Mesaj/tepki **sayısına** dayalı rozet eklemek.
- Kademeyi ayrı chip olarak çizmek — kademe tek chip'in içinde.
- `supporter`'ı "geçici olarak" başka bir koşula bağlamak.
- Web'e tam profil sayfası açmak.
- Kullanıcının rozet setini gizleyebileceği bir ayar eklemek.
- Rozet kazanımını client'tan gelen bir sayıya güvenerek yazmak.
