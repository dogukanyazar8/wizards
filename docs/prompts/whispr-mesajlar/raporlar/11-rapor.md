# Dalga 3 · Ş9 — Parity, denetim, güvenlik, kabul — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

Bu tur **yeni özellik yazmadı**. Ölçtü, borç kapattı, kanıt üretti — ve bir şeyi ilk kez
gerçekten koştu: migration'ları.

---

## 0. Migration'lar gerçek bir veritabanında koştu

Dalga 0'dan beri yazılan iki migration hiç uygulanmamıştı; UAT veritabanına dışarıdan
bağlanılamıyor ve rapora her seferinde "koşulmadı" diye yazılmıştı. Bu turda makinede
**yerel bir Postgres** ve hazır bir `wizards_e2e` veritabanı bulundu:

```
Applying migration `20260820120000_messages_screen`
Applying migration `20260820180000_dm_thread_also_send`
All migrations have been successfully applied.
```

Uygulandıktan sonra şema **doğrulandı** (sadece "hata vermedi" değil):

| Kontrol                                                          | Sonuç                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| `Poll` · `PollOption` · `PollVote` · `DMPinnedMessage` tabloları | dördü de var                                           |
| `DMMessage.alsoSentToChannel`                                    | `boolean`, varsayılan `false`                          |
| `DMConversation.avatarColor`                                     | `varchar(16)`                                          |
| `UserSettings.friendsSort`                                       | var                                                    |
| `GroupHistoryVisibility`                                         | `NONE · LAST_24H · LAST_7D · LAST_30D · ALL`           |
| `DMMessage_conversationId_alsoSentToChannel_createdAt_idx`       | var                                                    |
| `Poll_single_owner_check`                                        | `CHECK (num_nonnulls("dmMessageId", "messageId") = 1)` |

Ve **sapma taraması**: `prisma migrate diff` çıktısında `Poll`, `Pinned`, `alsoSent`,
`friendsSort`, `avatarColor`, `LAST_7D` geçmiyor — yani bu iki migration şemayla birebir.

> Çıktıda başka sapmalar **var** ve onlar bizim değil: yerel geçmişte olmayan iki eski
> migration (`wsp_appearance_layer`, `friend_invites`) bu veritabanında uygulanmış. Önceden
> var olan bir yerel ayrışma; bu paketin ürünü değil ve bu pakette çözülmedi.

---

## 1. Denetim borçları **sıfırlandı**

| Kapsam                | Önce              | Sonra     |
| --------------------- | ----------------- | --------- |
| `components/chat`     | copy 3 · token 17 | **0 · 0** |
| `components/dm`       | copy 0 · token 2  | **0 · 0** |
| `components/friends`  | 0 · 0             | 0 · 0     |
| `components/messages` | 0 · 0             | 0 · 0     |
| `lib/messages`        | 0 · 0             | 0 · 0     |

Bütçe iki yönlü olduğu için tavanları indirmemek testi kırardı; borç kapandıkça tavan
indirildi.

**Gerçek düzeltmeler:** `text-slate-*` sınıfları (7) token'lara, `message-attachments`'ın
`rgba()` gradyanı `hsl(var(--backdrop)/α)`'ya, `dm-conversation`'ın boşta noktası
`--warning` token'ına geçti (sabit üçlü kullanıcının temasıyla değişmiyordu ve koyu temada
kendi başına parlıyordu).

**Taşınamayanlar gerekçeyle izin listesine alındı, bütçeye saklanmadı:**

- **Dört onaltılık değer imleç SVG'lerinin** (`image-lightbox`). Bir `data:` URI'sinin içindeki
  SVG'nin CSS bağlamı yoktur: `var(--primary)` orada çözülmez, ham metin olarak kalır ve
  tarayıcı imleci hiç çizmez. Bunlar "token'a taşınmamış" değil, **taşınamaz** renklerdir.
- **Üç Türkçe parça bir ayrıştırıcının girdi dilbilgisi** (`parsePollBlock`'un `dk`, `saat`,
  `gün` birimleri). Sözlüğe taşınamazlar: sözlük çeviriyi değiştirdiğinde eski mesajlar
  okunamaz hâle gelirdi. Bunun için `copy-audit`'e **kapalı** bir izin listesi eklendi — her
  girdi birebir alıntı, yaklaşık eşleşme yok, yani kapı yeni bir sabit metni içeri almaz.

---

## 2. Arbitrary px: 1148 → 964

```
Önce:  1148 değer / 118 dosya
Sonra:  964 değer /  96 dosya   (Faz 0 tabanı 1208 / 120 — taban −244, dosya −24)
```

`components/chat` ve `components/dm`'in **152** arbitrary px değeri rem'e taşındı
(`N/16 rem`; ×1'de birebir aynı, üst ölçeklerde büyüyor — zaten amaç bu) ve iki klasör
eslint kuralının kapsamına alındı.

**Kuralda bir hata bulundu ve düzeltildi.** Desen `min-[420px]:block` gibi **medya
varyantlarını** da yakalıyordu; onlar fiziksel görünüm alanı genişliğidir ve kök font
boyutuyla ölçeklenmemeleri gerekir. Lookbehind (`(?<!min)(?<!max)`) ikisini dışlıyor,
`min-h-[36px]` yakalanmaya devam ediyor.

---

## 3. Ölü kod silindi

| Dosya                                               | Neden                                                      |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `components/dm/dm-sidebar.tsx` (+ testi)            | Mesajlar kendi rayını kullanıyor; tek referans bir yorumdu |
| `components/friends/friends-sidebar.tsx`            | Aynı; tek çağıran `ChannelSidebar`'ın detay-yok dalıydı    |
| `components/messages/messages-layout.tsx` (+ testi) | **Kullanılmıyordu**                                        |

`messages-layout.tsx` ilginç bir vakaydı: Ş1 onu yazdı, Ş7 kendi panel kabuğunu
(`messages-side-panel.tsx`) yazdı ve `chat-area` doğrudan onu monte etti. Aynı işin iki
uygulaması vardı ve biri hiç çağrılmıyordu. Kullanılan tutuldu, kullanılmayan silindi —
ama silinen tarafın **perdesi** (`backdrop`) gerçek bir davranıştı ve `chat-area`'ya taşındı:
overlay hâlinde altındaki sohbet tıklanabilir kalsaydı, kullanıcı görünmeyen bir satıra basıp
paneli kapatmadan başka bir sohbete geçebilirdi.

`ChannelSidebar`'ın detay-yok dalı artık boş bir yüzey çiziyor. Eskiden orada arkadaş listesi
vardı; Mesajlar kendi rotasına taşınınca bu, **sunucu** sütununda alakasız bir ekran oldu.

---

## 4. Güvenlik doğrulaması (§6)

`lib/messages/messages-security.test.ts` (+14 test). Her madde bir **sunucu tarafı** kararına
bakıyor; istemcinin bir düğmeyi çizmemesi kontrol sayılmıyor.

| §   | Madde                                        | Nerede kanıtlandı                                       |
| --- | -------------------------------------------- | ------------------------------------------------------- |
| 6.1 | Katılımcı olmayan anketi okuyamaz/oy veremez | `lib/polls/service.test.ts` (mevcut, gerçek çağrı)      |
| 6.2 | Anonim ankette kimlik dönmez                 | `lib/polls/service.test.ts` (mevcut)                    |
| 6.3 | Arama başkasının konuşmasını döndürmez       | **yeni** — katılımcılık `WHERE` değil **`JOIN`** koşulu |
| 6.3 | `historyFromAt` öncesi mesaj dönmez          | **yeni**                                                |
| 6.4 | Sabit yetkisi zorlanır                       | `lib/dm/pins-service.test.ts` (mevcut)                  |
| 6.5 | Öneri ucu engelleneni döndürmez              | `lib/friends/suggestions-service.test.ts` (mevcut)      |
| 6.6 | 65 elemanlı dalga formu → 400                | **yeni** — tavan zod şemasında                          |
| 6.7 | 250 üye / 50 sabit / 6 seçenek               | **yeni** — paylaşılan sabitler, kopya tavan yok         |
| 6.8 | Yeni yazma uçları hız sınırı kaydında        | `route-contract.test.ts` ✔ 25/25                        |

İki ek madde bu turda eklendi çünkü Dalga 3'ten sonra yazıldılar: **iletme** yolunun kaynak
yetkisi (404, 403 değil — 403 bir kimliğin gerçek olduğunu doğrulardı) ve **davet edilebilir
sunucu** ucunun izni sunucuda çözmesi.

---

## 5. E2E spec'leri yazıldı — **koşulamadı**

| Dosya                                          | Kapsam                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| `e2e/specs/design/messages-parity.spec.ts`     | 6 çözünürlük × 2 tema × 11 durum = **132** kombinasyon |
| `e2e/specs/design/messages-responsive.spec.ts` | Üç kırılım eşiği + klavye + panel dışlayıcılığı        |
| `e2e/specs/a11y/messages-a11y.spec.ts`         | axe A+AA, iki tema, klavye turu, hareket azaltma       |

Parity spec'i Ana Sayfa matrisinin **aynı** yardımcılarını kullanıyor; ikinci bir parity
altyapısı iki farklı "taşma yok" tanımı demek olurdu. Küçük dokunma hedefleri için **kapalı**
bir istisna listesi var: listede olmayan yeni bir küçük hedef testi kırar.

Spec'ler için `chat-area`'ya iki çapa eklendi (`messages-screen-root`, `messages-main`) —
parity ana alanın asgari genişliğini (§1.2: 782, panel açıkken 442) ölçebilsin diye.

### Neden koşulamadı

Playwright'ın `webServer` yapılandırması yerelde `reuseExistingServer: true` ve makinede
**zaten çalışan** bir dev sunucusu var (`:3000`). Playwright onu yeniden kullanıyor; o sunucu
Playwright'ın e2e ortam değişkenlerini (`APP_URL`, `AUTH_URL`, `E2E_TEST_MODE`) taşımıyor ve
oturum açma isteği CSRF kapısında duruyor:

```
E2E auth helper failed with 403: {"error":"Cross-site API request blocked","code":"CSRF_BLOCKED"}
```

Bu bir **ortam** durumu, kodda bir kusur değil. Başkasının süreci olduğu için kapatılmadı.
Çözüm ya o sunucuyu durdurmak ya Playwright'a ayrı bir port vermek; ikisi de kullanıcının
kararı.

Ortamın geri kalanı **hazır ve doğrulandı**: `check-e2e-env` yeşil, Postgres ve Redis açık,
veritabanı migrate edilmiş durumda.

---

## 6. Ölçülemeyenler (§5 performans, §7 görsel)

Performans bütçesi ve görsel karşılaştırma **ölçülmedi**. İkisi de çalışan bir tarayıcı
istiyor; üstelik yerelde Playwright `pnpm dev` başlatıyor (üretim derlemesi değil) ve dev
modunda alınan sayılar bütçeyle karşılaştırılamaz — React geliştirme kipinde iki kez render
ediyor, kod küçültülmemiş. Uydurma bir sayı yazmaktansa ölçülmediğini yazmak doğru.

Saf ölçüm testi (`message-list-performance.test.ts`) paketin geri kalanıyla birlikte yeşil.

---

## 7. Kabul kriterleri

Kod tarafından **kanıtlanabilen** maddeler ✔, tarayıcı isteyenler ⏳.

| Kriter                                                         | Durum                                          |
| -------------------------------------------------------------- | ---------------------------------------------- |
| Ray 276 + ana alan + panel 340; modallar kabuk içinde          | ✔ sözlük + birim testleri                      |
| Sunucu rayı ve kullanıcı barı değişmedi                        | ✔                                              |
| 11 durum birbirini doğru kapatıyor                             | ✔ `reduceMessagesScreen` + `toggleSearchPanel` |
| Ray: butonlar, arama, gruplar, rozet, presence, aktif satır    | ✔ 21 + 13 test                                 |
| Arkadaşlar: 4 sekme, satır menüsü, bölümler, öneriler          | ✔ 18 test                                      |
| Sohbet: başlık, sabit şeridi, ayraç, hover şeridi, tepki, menü | ✔ 16 + 9 + 8 test                              |
| Bestekar: `Aa` şeridi, kısayollar, emoji/GIF/ses/anket         | ✔ 14 test                                      |
| Canlı anket: oy taşınıyor, kendi oyu işaretli                  | ✔ 12 test                                      |
| Grup kurma iki adımı                                           | ✔ 8 test                                       |
| Thread ve arama panelleri                                      | ✔ 10 test                                      |
| Boş durum + 3 hızlı erişim                                     | ✔ 9 test                                       |
| Açık/koyu temada kaydırma yok, metin kırpılmıyor               | ⏳ spec yazıldı, koşulmadı                     |
| Tüm metinler birebir, placeholder yok                          | ✔ copy sözleşmesi + denetim                    |
| Tip kontrolü, lint, testler                                    | ✔                                              |
| Sesli mesaj uçtan uca                                          | ⏳ tarayıcı gerekiyor                          |
| Anonim ankette kimlik sızmıyor                                 | ✔                                              |
| 250 üyeli grup ölçümleri                                       | ⏳ ölçülmedi                                   |
| Ana Sayfa parity matrisi yeşil                                 | ⏳ koşulmadı                                   |
| Denetimler `skip`siz yeşil                                     | ✔ **borç sıfır**                               |

---

## 8. Kapı çıktısı

```
prisma migrate deploy              ✔ 2 migration uygulandı, sapma yok
pnpm typecheck                     ✔ 5/5
pnpm lint                          ✔ 5/5
pnpm --filter @wizards/web test    ✔ 3615 / 3615
pnpm --filter @wizards/types test  ✔ 435 / 435
pnpm --filter @wizards/db test     ✔ 78 / 78
pnpm --filter @wizards/mobile test ✔ 1950 / 1950
node scripts/quality/count-arbitrary-px.mjs   1148 → 964
```

---

## 9. Açık kalanlar

1. **E2E koşulmadı** (§5). Üç yeni spec yazıldı ve tip kontrolünden geçti; çalıştırmak için
   `:3000`'deki dev sunucusunun durdurulması ya da Playwright'a ayrı bir port verilmesi gerek.
2. **Performans bütçesi ölçülmedi** (§5). Üretim derlemesi + soğuk önbellek istiyor.
3. **Görsel karşılaştırma yapılmadı** (§7). `screens/*.png` ile yan yana koyma işi tarayıcı ister.
4. **UAT/prod veritabanına migration uygulanmadı.** Yerelde doğrulandı; canlıya uygulama ayrı
   bir karar ve ayrı bir erişim.
5. **`graphify update .`** hâlâ `WinError 5` veriyor (dosya kilidi) — ortam sorunu, kod değil.
6. **`DMConversation.pinnedMessageId` / `pinnedById` / `pinnedAt`** kolonları artık okunmuyor
   (yerini `DMPinnedMessage` aldı) ama **düşürülmedi**: aynı sürümde hem yazıp hem düşürmek,
   geri alınamayan bir dağıtım demek. Kolon düşürme bir sonraki pakete.
