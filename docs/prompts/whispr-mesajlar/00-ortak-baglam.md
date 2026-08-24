# 00 · Ortak bağlam — Mesajlar paketi

**Bu dosya uygulanmaz, okunur.** Her şerit buradaki kuralları, kararları ve tuzakları bildiğini
varsayar.

---

## 1. Doğrulanmış gerçekler (kod tabanı, 2026-08-20, `uat`)

Bu tablo taranarak doğrulandı; tahmin yok. Şeritler buna güvenebilir.

| Konu                  | Bugünkü durum                                                                                                                                                                                                                                                                                                                 | Dosya                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Kabuk 2. sütun seçimi | `selectSecondaryColumn(pathname)` → `nav` \| `dm` \| `channels`. `/channels*` → `dm`, ama `dm` dalı da `ChannelSidebar`'a düşüyor; `AppNavPanel` yalnız `nav` dalında                                                                                                                                                         | `lib/home/secondary-column.ts`, `components/shell/wizards-shell.tsx:601`                                                           |
| Gezinme paneli        | `AppNavPanel`, genişlik `HOME_METRICS.panel.width = 272`, nav satırı 14.5, sunucu satırı 13.5                                                                                                                                                                                                                                 | `components/shell/app-nav-panel.tsx`, `lib/home/metrics.ts:96`                                                                     |
| Mesajlar rotası       | Nav satırı `/channels`; `/channels/@me` → `FriendsView`, `/channels/@me/[id]` → `DMConversationPage`                                                                                                                                                                                                                          | `components/shell/app-nav-panel.tsx:54`                                                                                            |
| Okunmamış tek kaynak  | `useUnreadCounters({conversations, currentUserId})` → `{dm, mentions}`                                                                                                                                                                                                                                                        | `hooks/use-unread-counters.ts`                                                                                                     |
| Ölçek motoru          | `selectUiScale({width,height})` → 16/18/24/32px kök font; `useUiScale` uygular                                                                                                                                                                                                                                                | `lib/home/scale.ts`, `hooks/use-ui-scale.ts`                                                                                       |
| Ölçü sözlüğü          | `HOME_METRICS` + `pxToRem` / `pxToEm` / `hairline`                                                                                                                                                                                                                                                                            | `lib/home/metrics.ts`                                                                                                              |
| Token denetimi        | `HOME_TOKEN_AUDIT_SCOPE` + `HOME_TOKEN_AUDIT_ALLOWLIST` (grup swatch'ları için iki `hsl()` üçlüsü **zaten** listede)                                                                                                                                                                                                          | `lib/home/token-audit.ts`                                                                                                          |
| Metin denetimi        | `HOME_COPY_AUDIT_SCOPE` — kapsamda Türkçe karakter = hata                                                                                                                                                                                                                                                                     | `lib/home/copy-audit.ts`                                                                                                           |
| Arbitrary-px lint     | `no-restricted-syntax`, dosya kapsamı listeli                                                                                                                                                                                                                                                                                 | `apps/web/eslint.config.mjs:62`                                                                                                    |
| Parity yardımcıları   | `applyParityTheme`, `expectNoOverflow`, `expectNoClippedText`, `readRootFontSize`, `collectUndersizedTapTargets`, `MIN_TAP_TARGET_PX`                                                                                                                                                                                         | `e2e/helpers/design-parity.ts`                                                                                                     |
| Parity matrisi örneği | 6 çözünürlük × 2 tema                                                                                                                                                                                                                                                                                                         | `e2e/specs/design/home-parity.spec.ts`                                                                                             |
| DM veri modeli        | `DMConversation` (type DM\|GROUP_DM, permAddMembers, historyVisibility, disappearingAfter, **tek** `pinnedMessageId`), `DMParticipant` (role, notifyLevel, unreadCount, `pinnedAt`, `historyFromAt`, `pinnedStripDismissedId`), `DMMessage` (replyToId, `threadParentId`, clientNonce, systemType, `content_search` tsvector) | `packages/db/prisma/schema.prisma:1531`                                                                                            |
| Grup kurma            | İki adımlı diyalog **zaten var**, saf mantık `@wizards/types/group-dm-selection`                                                                                                                                                                                                                                              | `components/dm/group-create-dialog.tsx`                                                                                            |
| Grup tavanı           | `GROUP_DM_MAX_PARTICIPANTS = 32`, `GROUP_AVATAR_COLORS` = 5 sabit hex                                                                                                                                                                                                                                                         | `packages/types/src/group-dm.ts:13`, `group-dm-settings.ts:31`                                                                     |
| Geçmiş görünürlüğü    | enum `NONE \| LAST_24H \| LAST_30D \| ALL`, varsayılan `LAST_30D`                                                                                                                                                                                                                                                             | `schema.prisma:363`                                                                                                                |
| Davet bağlantısı      | `GroupInvite`, `enabled` varsayılan **false** (karar K2)                                                                                                                                                                                                                                                                      | `schema.prisma:1673`                                                                                                               |
| Anket                 | **Yok.** Bugünkü "anket" mesaj metnine gömülü markdown + `1️⃣2️⃣3️⃣` tepkileriyle oy                                                                                                                                                                                                                                             | `components/chat/message-item.tsx:47` (`parsePollBlock`)                                                                           |
| Mesaj arama           | Konuşma başına uç + **yüzen popover**; servis yazar/tarih filtresini zaten destekliyor                                                                                                                                                                                                                                        | `app/api/v1/dm/[conversationId]/messages/search`, `lib/messages/search-service.ts:111`, `components/chat/message-search-panel.tsx` |
| Thread                | DM tarafında uçtan uca var (`threadParentId`, `use-thread-messages.ts`, `ThreadPanel`)                                                                                                                                                                                                                                        | `components/chat/thread-panel.tsx`                                                                                                 |
| Bestekar              | 9 araçlı biçimlendirme şeridi **var**, açıkken üst köşe yarıçapı düzleşiyor                                                                                                                                                                                                                                                   | `components/chat/message-input.tsx:229,1250`                                                                                       |
| Sesli mesaj (web)     | **Pasif** — `chat.input.voiceMessageUnavailable`                                                                                                                                                                                                                                                                              | `components/chat/message-input.tsx:1616`                                                                                           |
| Arkadaşlar            | 5 sekme (`online \| all \| pending \| add \| blocked`); öneri listesi ve sıralama kontrolü yok                                                                                                                                                                                                                                | `components/friends/friends-view.tsx:56`                                                                                           |
| Arkadaş uçları        | `/v1/friends`, `/pending`, `/blocked`, `/block/[userId]`, `/request` — **öneri ucu yok**                                                                                                                                                                                                                                      | `app/api/v1/friends/**`                                                                                                            |
| DM socket olayları    | `dm:message:*`, `dm:typing:*`, `dm:conversation:*`, `dm:call:*`                                                                                                                                                                                                                                                               | `lib/socket/events.ts:127`                                                                                                         |
| i18n                  | Düz anahtar sözlüğü, TR + EN; `messages.*` ad alanı **boş**                                                                                                                                                                                                                                                                   | `lib/locale/messages/tr.ts`, `en.ts`                                                                                               |
| Yoğunluk              | `InterfaceDensity` (COMFORTABLE/COMPACT) → `--density-*` CSS değişkenleri                                                                                                                                                                                                                                                     | `components/shell/wizards-shell.tsx:1094`                                                                                          |

## 2. Alınmış kararlar (2026-08-20, kullanıcı)

Bunlar **bağlayıcıdır**. Bir şerit karara aykırı bir şey yapmak zorunda kalıyorsa uygulamayı durdurur
ve sorar.

| #   | Konu                         | Karar                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Anket altyapısı**          | Gerçek Prisma modeli: `Poll` + `PollOption` + `PollVote`. Uçlar `/api/v1/polls*`, socket `poll:*`. Eski markdown anket **okuyucusu** geriye dönük render için korunur, yeni anket üretmez.                                                                                                                               |
| 2   | **Kabuk**                    | Mesajlar 4 kolon: ray 74 + gezinme paneli 228 + sohbet rayı 276 + ana alan. Ana Sayfa paketinin karar #8'i **güncellenir**: 2. sütun artık rota başına _değişmez_, gezinme paneli her rotada kalır. Panel 272 → **228** ve nav 14.5→14 / sunucu 13.5→13 **tüm rotalarda**. Ana Sayfa parity anlık görüntüleri yenilenir. |
| 3   | **Grup tavanı**              | `GROUP_DM_MAX_PARTICIPANTS` 32 → **250**. Roster sorguları, socket fan-out ve okunmamış sayaç yazımı 250 katılımcıda ölçülür.                                                                                                                                                                                            |
| 4   | **Grup renkleri**            | 5 sabit hex → **6 token rengi**: `primary` · `success` · `warning` · `danger` · `info` (`hsl(199 89% 48%)`) · `accent` (`hsl(291 64% 55%)`). Mevcut 5 hex için geriye dönük eşleme yazılır.                                                                                                                              |
| 5   | **Sesli mesaj**              | Web'de **uçtan uca** eklenir: `MediaRecorder` kaydı, gerçek dBFS dalga formu, yükleme, mesaj içi oynatıcı, süre/iptal. Sözleşme mobil ile ortak (`@wizards/types`).                                                                                                                                                      |
| 6   | **Arama kapsamı**            | Global: yeni uç `/v1/dm/messages/search`, görüntüleyenin tüm DM + gruplarında. Panel açılışta `Kişi: <açık sohbet>` çipiyle daraltılmış gelir; çip kaldırılınca global olur. Her satır katılımcılık + `historyFromAt` tabanıyla süzülür.                                                                                 |
| 7   | **Sabitleme**                | Çoklu: yeni `DMPinnedMessage` tablosu (kanalın `PinnedMessage` eşi), tavan **50**. Migration mevcut tek sabiti taşır; `DMConversation.pinnedMessageId` bir sürüm boyunca okunur, yazılmaz.                                                                                                                               |
| 8   | **Arkadaşlar**               | 4 sekme; `online` sekmesi düşer, `?dmTab=online` derin bağlantısı `all`'a yönlendirilir. Yeni uç `/v1/friends/suggestions`. Sıralama (duruma göre / ada göre / son etkileşim) `UserSettings`'te kalıcı.                                                                                                                  |
| 9   | **Geçmiş görünürlüğü**       | Enum'a `LAST_7D` eklenir. `LAST_24H` korunur ama **yeni grup kurma** ekranında çizilmez (grup ayarları panelinde kalır). Yeni grup varsayılanları: geçmiş `ALL`, davet bağlantısı **açık** (kurulurken kod üretilir).                                                                                                    |
| 10  | **Ortak bileşenler**         | `MessageList` / `MessageItem` / `MessageInput` tek görsel dile geçer; sunucu kanalları da yeni görünümü alır. Kanal görsel testleri ve anlık görüntüleri yenilenir.                                                                                                                                                      |
| 11  | **Anonim anket**             | `anonymous = true` iken "Oy verenleri gör" **çizilmez** ve uç oy veren kimliklerini **döndürmez**. Anketi açan dahil kimse göremez. Redaksiyon sunucu tarafındadır.                                                                                                                                                      |
| 12  | **Anket yeri + hızlı başla** | Anket hem grupta hem 1:1 DM'de. 1:1'de başlık "2 kişi oy verebilir". "Hızlı başla" çipleri: önce sabitlenen sohbetler (`DMParticipant.pinnedAt`), 3'e tamamlanmazsa `lastMessageAt` sırası; hiç sohbet yoksa şerit hiç çizilmez.                                                                                         |

## 3. Şerit sözleşmesi — paralellik nasıl bozulmaz

1. **Dosya sahipliği mutlaktır.** Şerit yalnız kendi §"Sahiplenilen dosyalar" listesine yazar. Başka
   bir şeridin dosyasında bir şeye ihtiyaç duyuyorsa, o şey Dalga 0'da tanımlanmış bir tip ya da
   prop olmalıdır. Değilse: durdur, sor.
2. **i18n dosyaları yalnız Dalga 0 Ş0.4'e aittir.** Sonraki şeritler `tr.ts` / `en.ts` dosyalarına
   **yazmaz**, yalnız `t("messages....")` ile okur. Eksik anahtar bulan şerit durur ve bildirir.
3. **Prisma şeması yalnız Ş0.2'ye aittir.** Sonraki şeritler migration yazmaz.
4. **Karşı taraf yokken sahte veriyle çalış.** Ş6 (anket kartı) Ş2'nin ucu hazır olmadan da yazılır:
   tip Dalga 0'dan gelir, test fikstürden beslenir, gerçek çağrı `TODO(api):` işaretli tek bir
   istemci fonksiyonunun arkasındadır.
5. **Çakışan dosya varsa şerit değil sıra hatası vardır.** İki şerit aynı dosyaya yazmak zorundaysa
   plan yanlıştır: uygulamayı durdur, bildir.

## 4. Tasarım kuralları (PROMPT.md'den, kısaltılmadan geçerli)

- **Token zorunlu.** Renk/yüzey yalnız `hsl(var(--token))`. Yeni hex, yeni token, yeni tema sınıfı
  yok. Tek istisna: grup ikonu `info` = `hsl(199 89% 48%)`, `accent` = `hsl(291 64% 55%)` —
  ikisi de `HOME_TOKEN_AUDIT_ALLOWLIST`'te zaten var.
- **Tipografi.** `--font-display` = Outfit (başlık, sayı, büyük harfli etiket), `--font-sans` =
  Figtree (gövde). Bileşen içine font adı gömme.
- **rem.** Her px değeri `pxToRem` ile rem olur; kenarlar `hairline()`, ikonlar `pxToEm`.
  `w-[276px]` / `text-[13.5px]` yazma — lint bunu yeni yüzeylerde hata sayar.
- **Mevcut bileşeni kullan.** Sapma varsa SPEC ölçüsüne göre yalnız görsel hizalama yap, API'yi
  bozma.
- **Metin birebir.** SPEC'teki Türkçe cümle kısaltılmaz, "iyileştirilmez". EN karşılığı doğal
  çeviridir, birebir kalıp değil.
- **Erişilebilirlik.** Tıklanabilir her satır gerçek `button`/`a`; ikon-only butona `aria-label`;
  presence noktasına metin karşılığı; menü/modal klavyeyle gezilir (`Esc` kapatır, focus tuzağı,
  açılışta ilk öğeye focus); focus stili `ring-ring`. Okunmamış sayacı okunabilir etiket taşır
  ("3 okunmamış mesaj").
- **Performans.** Mesaj listesi sanallaştırılmış kalır. Sohbet rayı ve arkadaş listesi kendi
  `Skeleton`'unu gösterir; biri geciktiğinde ekranın kalanı beklemez.

## 5. Kalite çıtası

Kabul edilmeyenler:

- Sunucu tarafında zorlanmayan yetki. Her yeni uç katılımcılık/arkadaşlık/engel kontrolünü
  **sorgunun içinde** yapar, istemciden gelen kimliğe güvenmez.
- Ölçülmemiş sorgu. Yeni her liste ucu için sorgu sayısı testi (`N+1` yok) ve `EXPLAIN`'i
  desteklenmiş indeks.
- Testsiz yol. Yeni her saf fonksiyon `node:test` ile, yeni her bileşen render testiyle, yeni her
  uç route-logic testiyle gelir.
- Redaksiyonsuz presence. Görünürlük ayarı (`PresenceVisibility`) uygulanmadan presence dönen uç
  yok.
- Rate limit'siz yazma ucu. `lib/api-rate-limit.ts` kayıtlarına yeni uçlar eklenir.
- Sessiz kırpma. Tavan (250 üye, 50 sabit, 6 anket seçeneği) aşıldığında uç `400` döner, istemci
  kullanıcıya söyler.

## 6. Bilinen tuzaklar

1. **Tema parity yalanı.** `applyParityTheme` yalnız `localStorage` yazar; oturum açıkken
   `ThemeSessionSync` hesabın kayıtlı temasını uygulayıp ezer. Parity testinde `User.theme` de
   ayarlanmalı ve uygulanan tema **ekranda doğrulanmalı** (`home-parity.spec.ts` bunu yapıyor).
2. **`zoom` üretimde yok.** Referans HTML ölçek adımlarını CSS `zoom` ile taklit eder. Üründe
   yalnız kök font boyutu + rem geçerlidir.
3. **`dm:join` içerideki soketi atmaz.** Oda değişiminde `socketsLeave` çağrılmadan katılım
   eskisini bırakmaz — grup fan-out'unda bilinen tuzak.
4. **Prisma migration yolu.** Prisma bu depoda `prisma/rebaseline-migrations` okur; migration'ı
   yanlış klasöre yazmak sessizce hiçbir şey yapmaz.
5. **Yerel e2e dev-modu tuzağı.** `pnpm e2e` üretim derlemesine karşı koşar; `next dev` üstünde
   alınan ölçüler parity için geçerli değildir.
6. **`--m-pad` / `--m-gap` yoğunluk değişkenleri.** SPEC bunları Tweaks'ten alır; uygulamada
   karşılığı `InterfaceDensity` (COMPACT/COMFORTABLE) ve mevcut `--density-*` değişkenleridir.
   İkinci bir yoğunluk kaynağı **üretilmez**.
7. **Sohbet rayının altında kullanıcı barı yoktur.** Bar yalnız gezinme panelinin altındadır
   (SPEC §3 son madde). Ekran görüntüsünde tek görünmesinin sebebi budur.
8. **SPEC §3 ile ekran görüntüsü çelişkisi.** SPEC sohbet rayı başlığında sağda bir filtre/sıralama
   ikon butonu tarif eder; `screens/01` ve `screens/08` bu butonu göstermez, sağda yalnız okunmamış
   badge vardır. **Otorite `Mesajlar.dc.html`**: uygulayan şerit oradaki işaretlemeye bakar ve
   kararı raporuna yazar.

## 7. Kapı komutları

Şeritler kendi dosyalarındaki daraltılmış listeyi koşar. Paket kapısı (Dalga 3):

```bash
pnpm db:generate && pnpm typecheck && pnpm lint && pnpm --filter @wizards/web test && pnpm --filter @wizards/web e2e:a11y && pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/design
```

## 8. Rapor biçimi

Her şerit `docs/prompts/whispr-mesajlar/raporlar/<dosya-no>-rapor.md` yazar:

```markdown
# <şerit adı> — rapor

## Ne yapıldı

## Sahiplenilen dosyalar (yazılan)

## Sözleşme değişikliği (varsa — başka şeridi etkiler, açıkça yaz)

## Kapı çıktısı (komut + sonuç)

## Açık kalanlar / TODO(api)

## Karar gerektiren
```
