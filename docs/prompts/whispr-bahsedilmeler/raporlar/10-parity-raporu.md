# Dalga 3 / Ş9 — parity ve kabul raporu

Tarih: 2026-08-21
Dal: `uat`
Sonuç: **SOURCE PASS · ÖNCEKİ BROWSER PASS · TODO KAPANIŞ ODAK KAPILARI PASS**

Tarayıcı ön koşulu için `apps/web/.env` içindeki `E2E_TEST_MODE` yalnız ölçüm süresince
`true` yapıldı. İş bitiminde `false` değerine döndü; dosyanın SHA-256 değeri başlangıçla aynı:
`A62F996ED3518602C1960A5CEC24EEFA8A0855028EA6D0A2377851A9827E8786`.

## 1. Yapılanlar

- Referans HTML ölçülerini `MENTIONS_METRICS` ile karşılaştıran
  `src/lib/mentions/parity.test.ts` eklendi.
- `e2e/specs/mentions/mentions.spec.ts` eklendi: 12 kabul akışı, 11 durum × 2 tema × 6
  çözünürlük matrisi, ilk boya istek bütçesi, ray/akış ayrışması, 200 kart sanallaştırma/FPS
  ve canlı bahsetme kaydırma koruması. Playwright statik listeleme: **8 test**.
- Genel `notification:new` içindeki `MENTION`, açık Bahsedilmeler ekranında liste/sayaç/özet
  sorgularını yeniliyor; üstte değilken yeni-bahsetme şeridini artırıyor. Üretimde
  `publishMentionCreated` çağıranı olmadığı için bu, gerçek kanal fan-out'unun kullandığı yol.
- `<1100px` panel kırılımındaki `max-[1099px]` / `min-[1100px]` sınıfları eşdeğer rem media
  eşiklerine çevrildi. Mentions dizinlerinde arbitrary px taraması artık temiz.
- Kesin ölü kod listesi kaldırıldı. Üretim çağıranı kalmadığı `rg` ve parity testiyle korumalı.
- `a11y.spec.ts` içindeki Bahsedilmeler bloğu `/mentions` + `mentions-feed-header` üzerinden
  WCAG A/AA axe taramasına dahil.

## 2. Ölü kod temizliği

| Hedef                                                                                                      | Sonuç                            |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `lib/home/mentions-service.ts` + testi                                                                     | Silindi                          |
| `fetchHomeMentions`, `homeQueryKeys.mentions`                                                              | Silindi                          |
| Eski home `MentionsResponseSchema`, `HomeMentionItemSchema`, `MentionsQuerySchema`, `MentionsFilterSchema` | Silindi                          |
| `parseMentionsFilter` + eski test iddiası                                                                  | Silindi                          |
| Eski `mentions.filter.*` çeviri anahtarları                                                                | Yok; geri dönmesi testle engelli |

Rota katmanındaki yerel `MentionsQuerySchema` yeni API'nin giriş doğrulamasıdır; eski home
sözleşmesi değildir ve korunmuştur.

## 3. Parity, token ve ölçek

`mentions parity — ölçü sözlüğü ↔ referans HTML` testleri kolon, ray, başlık, sekme, kart,
menü, yanıt kutusu, modal ve boş durumun bağlayıcı ölçülerini gerçek
`Bahsedilmeler.dc.html` metnine karşı doğruluyor. `metrics.test.ts` ayrıca bağlam paneli açıkken
akışın **456px** olduğunu doğruluyor.

Statik taramalar:

```text
ARBITRARY_PX_CLEAN
COLOR_LITERAL_CLEAN
FONT_LITERAL_CLEAN
ZOOM_OUTLINE_CLEAN
```

Kök ölçek sözleşmesi mevcut `useUiScale` testlerinde 16/18/24/32 adımlarının tamamında geçti.
Hairline, ikon `em` ve ölçü `rem` dönüşümleri `mentions metrics — dönüşümler` testlerinde geçti.

### Kayıtlı SPEC sapmaları

Nihai otorite HTML; SPEC bu üç alanda sessiz:

| Alan                          | HTML değeri | Karar           |
| ----------------------------- | ----------: | --------------- |
| `sidebar.kindRowPillFontSize` |      `11px` | HTML kullanıldı |
| `card.kindBadgeLetterSpacing` |     `.02em` | HTML kullanıldı |
| `emptyState.buttonPaddingX`   |      `17px` | HTML kullanıldı |

## 4. Erişilebilirlik ve kırılımlar

Kaynak/render testleri kart `article`, gerçek butonlar, ikon etiketleri, feed işaretlemesi,
klavye kısayolları, menü/modal `Escape` ve focus geri dönüş sözleşmelerini kapsıyor.
`<1100px` panel CSS overlay; `<960px` ray mevcut drawer mekanizmasını kullanıyor. JavaScript
genişlik okuması eklenmedi.

Kullanıcı onayıyla yalnız `postgresql://localhost:5432/wizards_e2e` reset/rebaseline edildi.
Eski E2E verisi silindi; runtime kaynağı olan `packages/db/prisma/rebaseline-migrations`
üzerindeki **37/37 migration**, son olarak `20260821120000_mentions_screen`, uygulandı. Son durum
`Database schema is up to date!`; seed yeniden üretildi. Geliştirme DB'si `wizards` dokunulmadı.

Gerçek axe kapısı **20/20 PASS**; `/mentions` taraması critical/serious WCAG A/AA ihlali
bulmadı. Mentions Playwright paketi **8/8 PASS (1.6m)**. Yerel Playwright sunucusu güncel
kaynağı `NODE_ENV=development`, CI ise üretim build'ini `NODE_ENV=production` ile sunuyor;
bu sözleşme **2/2 PASS**.

İlk `?modal=settings` yüklemesindeki hydration mismatch, reducer'ın SSR ve istemcide aynı sabit
başlangıç durumundan açılmasıyla kapandı. Geçiş anındaki çift DOM locator'ları mevcut
`visibleTestId` yardımcısına taşındı.

## 5. Performans

### 5.1 Salt-okunur güncel ölçüm

Yerel `wizards@localhost:5432` şeması güncel; fakat veri hacmi performans kararı için küçük:

```text
Message=4 · MessageMention=0 · DMMessage=19 · DMMessageMention=0
Notification=27 · MentionState=0 · Channel=16
```

30 günlük liste, 20 ardışık okuma: median **7.417ms**, p95 **8.083ms**. `EXPLAIN ANALYZE`:

```text
window=30d  Planning Time: 4.703 ms · Execution Time: 0.565 ms
window=all  Planning Time: 8.969 ms · Execution Time: 0.585 ms
DM           Planning Time: 4.020 ms · Execution Time: 0.185 ms
```

Bu küçük tabloda planlayıcının seq scan seçmesi doğrudur; ölçek kanıtı sayılmaz.

### 5.2 300k ölçek kanıtı ve karar

Ş3'ün aynı sorgu için işlem içinde üretip geri aldığı sentetik hacim ölçümü hâlâ geçerli kaynak
kanıttır:

```text
Message=300004 · MessageMention=306000 · Notification=152729
MentionState=60000 · DMMessage=20019 · DMMessageMention=5000

window=30d list   Execution Time: 38.662 ms
window=30d counts Execution Time: 36.128 ms
window=all        Execution Time: 85.483 ms
```

30 günlük planda büyük tablolarda seq scan yok; kabul eşiği p95 `<120ms` karşılanıyor.
`window=all`, `Message` ve `Notification` üzerinde Parallel Seq Scan kullanıyor. Bugünkü 85ms
nedeniyle bu şeritte doğruluk riski taşıyan hızlı değişiklik yapılmadı. Karar: üretim telemetry
ile izlenmeli; büyümeden önce nav rozeti için kullanıcı bazlı, transaction/outbox ile güncellenen
bir aggregate tasarlanmalı. TTL cache tek başına doğruluk kaynağı olmamalı.

DM dalı sentetik planda `DMParticipant → DMMessage → DMMessageMention` ile konuşmanın 20.008
mesajını sürüyor; ölçüm yaklaşık **6.7ms**, fakat maliyet konuşma boyuyla büyüyor. `m.createdAt`
filtresi eklenmedi: sonradan oluşturulan mention satırını sessizce kaybedebilir. Güvenli aday,
`DMMessageMention(userId, createdAt)` kümesini `MATERIALIZED` CTE ile önce daraltıp sonra mesaja
join etmek; ayrı API şeridinde iki milyon mesajlık konuşmayla benchmark edilmelidir.

200 kart sanallaştırma/FPS, bağımsız rayın gecikmiş ağ davranışı, ilk boya **≤3** istek ve
`notification:new` kaydırma telafisi E2E'de PASS. FPS kabul eşiği `>=55`; DOM'da aynı anda
`<80` kart kaldı. Tarayıcının native scroll anchoring'i ile ölçümlü telafinin iki kez
uygulanmaması için akışta `overflow-anchor:none` açıkça tanımlandı. Rol fan-out source olarak
gönderim yan etkisinden ayrılmıştır.

## 6. Dokuz TODO kapanışı

|   # | Dosya / konu                                    | Sonuç                                                                                                                                                         |
| --: | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | `mentions-query.ts` · adsız grup DM             | KAPALI. Katılımcılar tek toplu sorguyla yükleniyor; gerçek, yerelleştirilmiş grup başlığı üretiliyor.                                                         |
|   2 | `mentions-query.ts` · thread kapalı             | KAPALI. Kök mesajda `threadClosedAt/threadClosedById`, yetkili kapat/aç API'si ve kapalı thread'e yazma reddi var. `open` gerçek kalıcı durumdan türetiliyor. |
|   3 | `mentions-service.ts` · `@herkes` i18n          | KAPALI. Wire değeri dil bağımsız `@everyone`; görünen etiket istemcide yerelleştiriliyor.                                                                     |
|   4 | `reply-target.ts` · `messageId`                 | KAPALI. `Mention.messageId` zorunlu sözleşme alanı; hedef URL ayrıştırmasına bağlı değil.                                                                     |
|   5 | `mention-reply-box.tsx` · emoji/dosya           | KAPALI. Gerçek `EmojiPicker`, UploadThing ek yükleme/validasyon, ek-only gönderim ve sunucu ACK sonrası temizleme var. Hata/timeout taslağı koruyor.          |
|   6 | `mentions-page.tsx` · filtre × kaynak sayı      | KAPALI. Liste yanıtı aynı filtre/kaynak/arama kapsamının kesin `total` değerini taşıyor; başlık her görünümde bunu kullanıyor.                                |
|   7 | `mentions-page.tsx` · summary avatar            | KAPALI. Yanıt kutusu authenticated runtime'daki gerçek kullanıcı/avatar verisini kullanıyor.                                                                  |
|   8 | `mentions-page.tsx` · boş seçili kaynak başlığı | KAPALI. Liste yanıtı sonuç boşken de doğrulanmış `sourceTitle` taşıyor.                                                                                       |
|   9 | `mentions-rail-container.tsx` · roller          | KAPALI. Sayaç sözleşmesi yetkili `roleNames` projection'ını taşıyor; ray gerçek rol adlarını gösteriyor.                                                      |

## 7. Kapanmayan mimari kısıtlar

- Kart menüsü kendi konum kabuğunu çiziyor; satırlar `ContextMenuItem`. Paylaşılan
  `ui/context-menu.tsx` portal/viewport koordinatı ve `min-w-52`/`rounded-2xl` dayatıyor.
- Paylaşılan `Modal`, opsiyonel `headerIcon` sözleşmesiyle referanstaki 38px zil kutusunu çiziyor;
  diğer modal çağıranlarının varsayılan davranışı değişmedi.
- `Modal`, `document` yokken `null`; form gövdesinin `MentionSettingsForm` olarak ayrıca dışa
  açık olması render testi ve SSR ayrımı için korunuyor.

## 8. PROMPT kabul listesi

PROMPT başlığı “16” diyor; dosyada **17** madde var. Aşağıda 17'si de raporlandı.

|   # | Kabul                                    | Durum                  | Kanıt                                                                                                                                                    |
| --: | ---------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Sol taraf değişmedi                      | PASS (şerit sahipliği) | Bu şerit `server-rail`, `app-nav-panel`, kullanıcı barına yazmadı. Worktree'de önceden var olan başka WIP ayrıdır.                                       |
|   2 | Aktif nav + canlı sayaç                  | PASS                   | Source/query/socket testleri ve gerçek realtime E2E PASS.                                                                                                |
|   3 | Yalnız token renkleri                    | PASS                   | `COLOR_LITERAL_CLEAN`; metrics renk taşımıyor testi.                                                                                                     |
|   4 | Outfit/Figtree yalnız token              | PASS                   | `FONT_LITERAL_CLEAN`; sabit component font adı yok.                                                                                                      |
|   5 | Ray içerik ve ölçüler                    | PASS                   | metrics/render + iki tema/altı çözünürlük matrisi PASS.                                                                                                  |
|   6 | Akış başlığı                             | PASS                   | render/metrics, 456px ve tarayıcı matrisi PASS.                                                                                                          |
|   7 | Kart durumları                           | PASS                   | MentionCard render ve iki tema E2E matrisi PASS.                                                                                                         |
|   8 | Üç kart eylemi                           | PASS                   | Okundu, kaldır, sonra oku, yanıt ve bağlam gerçek E2E PASS.                                                                                              |
|   9 | Dört satırlı menü                        | PASS                   | render/klavye + viewport taşma E2E PASS.                                                                                                                 |
|  10 | Satır içi yanıt                          | PASS                   | Gerçek kanal gönderimi; emoji, dosya, ek-only gönderim ve ACK hata/timeout taslak koruması odak testlerde PASS. Önceki temel gönderim E2E PASS.          |
|  11 | 326px bağlam paneli                      | PASS                   | Gerçek ±2 bağlam ve navigasyon E2E PASS.                                                                                                                 |
|  12 | 496px ayarlar modalı                     | PASS                   | Kalıcılık/paylaşılan URL ve iki tema matrisi PASS; referans zil başlığı paylaşılan `headerIcon` ile tamamlandı.                                          |
|  13 | Boş durum + mark-all                     | PASS                   | 20 toggle, tümünü okundu ve geri alma E2E PASS; ilgisiz bildirim okunmadı.                                                                               |
|  14 | Zaman/kaynak gruplama                    | PASS                   | grouping/routes + gerçek UI matrisi PASS.                                                                                                                |
|  15 | İki tema                                 | PASS                   | `theme-dark` + `theme-light` matrisi tamamlandı.                                                                                                         |
|  16 | 1360/1920/2560/3840 + 4K                 | PASS                   | 1360, 1600, 1920, 2560, 3840 ve 5120 matrisinde taşma/kırpılma yok.                                                                                      |
|  17 | Metinler + tip/lint/test/render testleri | PASS (odak)            | TODO kapanış seti `295/295`; web/types/mobile typecheck ve web lint PASS. Önceki tam unit `4101 pass · 0 fail · 1 skip`; post-kapanış tam suite NOT RUN. |

## 9. Kapılar

| Komut                                                                    | Sonuç                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm --filter @wizards/web typecheck`                                   | PASS                                                                                             |
| `pnpm --filter @wizards/web lint`                                        | PASS · config `10/10`, ESLint temiz                                                              |
| Web TODO kapanış unit/service/socket seti                                | PASS · `168/168`                                                                                 |
| Thread lifecycle + mobil thread-follow API route'ları                    | PASS · `5/5`                                                                                     |
| `@wizards/types` typecheck + odak şema testleri                          | PASS · `45/45`                                                                                   |
| Prisma generate + mentions/messages şema testleri                        | PASS · `51/51`                                                                                   |
| `@wizards/mobile` typecheck + odak testler                               | PASS · `26/26`                                                                                   |
| `@wizards/mobile lint:hooks`                                             | PASS · `0` hata; görev dışı mevcut `20` uyarı                                                    |
| `pnpm --filter @wizards/web test`                                        | Post-kapanış NOT RUN. Önceki tam koşu: `4102` toplam, `4101` pass, `0` fail, `1` skip.           |
| `playwright test e2e/specs/a11y --project=chromium`                      | PASS · `20/20`                                                                                   |
| `playwright test e2e/specs/mentions/mentions.spec.ts --project=chromium` | PASS · `8/8` · `1.6m`                                                                            |
| Playwright `--list e2e/specs/mentions/mentions.spec.ts`                  | PASS · 8 test                                                                                    |
| Yeni TODO kapanış davranışlarının browser kabulü                         | NOT RUN · `.env`/E2E DB yeniden değiştirilmedi; yukarıdaki browser kanıtı önceki dalga koşusudur |
| `graphify update .`                                                      | PASS · `29743` node, `70345` edge, `1307` community; HTML görseli boyut sınırıyla atlandı        |

Yeni `thread_lifecycle` migration'ı üretildi ve statik/generate kapılarından geçti; hiçbir DB'ye
uygulanmadı. Commit, push, deploy ve geliştirme DB mutasyonu yapılmadı.
