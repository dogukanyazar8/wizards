# Dalga 1 · Ş3 — Paylaşılan medya · dosya · bağlantı ucu · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** bitti, kapı yeşil. Commit atılmadı.

## Kapı

Kardeş şeritler paralel koştuğu için tam süit koşulmadı; yalnız bu şeridin dosyaları +
dokunulan mobil test koşuldu.

```
cd apps/web && node --import tsx --test --test-force-exit \
  src/lib/dm/shared-media.test.ts \
  src/lib/dm/shared-links.test.ts \
  src/lib/dm/shared-media-client.test.ts \
  "src/app/api/v1/dm/[[]conversationId[]]/attachments/route-logic.test.ts" \
  "src/app/api/v1/mobile/dm/[[]conversationId[]]/attachments/route-logic.test.ts"
```

| Ölçüm                                  | Sonuç                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Yeni + mevcut testler                  | **48 / 48** geçti (8 suite)                                                                |
| Mevcut mobil attachments testleri      | 5 / 5, dosya **değişmedi**                                                                 |
| `eslint` (dokunulan dosyalar)          | temiz                                                                                      |
| `prettier`                             | uygulandı                                                                                  |
| `pnpm --filter @wizards/web typecheck` | bu şeridin dosyalarında **hata yok**; süitte kalan iki hata kardeş şeritlere ait (aşağıda) |

Typecheck çıktısındaki iki hata bu şeridin değil:

- `app/api/v1/dm/groups/[conversationId]/profile/route.ts(1,35) TS2307` — Ş2 henüz
  `route-logic` dosyasını yazmamış.
- `lib/dm/message-send-service.test.ts(98,5) TS2322` — Ş4'ün `mutedUntil` genişletmesi
  mevcut bir test sahtesini eskitmiş.

---

## Landed

| Dosya                                                                         | Durum                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/lib/dm/shared-links.ts`                                         | **yeni** — blok farkında bağlantı çıkarımı             |
| `apps/web/src/lib/dm/shared-links.test.ts`                                    | **yeni** — 9 test                                      |
| `apps/web/src/lib/dm/shared-media.ts`                                         | genişletildi — ortak servis burada                     |
| `apps/web/src/lib/dm/shared-media.test.ts`                                    | genişletildi — 7 → 22 test                             |
| `apps/web/src/lib/dm/mobile-shared-media-service.ts`                          | 114 → 44 satır, yalnız biçim adaptörü                  |
| `apps/web/src/app/api/v1/dm/[conversationId]/attachments/route.ts`            | **yeni**                                               |
| `apps/web/src/app/api/v1/dm/[conversationId]/attachments/route-logic.ts`      | **yeni**                                               |
| `apps/web/src/app/api/v1/dm/[conversationId]/attachments/route-logic.test.ts` | **yeni** — 7 test                                      |
| `apps/web/src/lib/dm/shared-media-client.ts`                                  | **yeni** — fetch + query key + iki istemci yardımcısı  |
| `apps/web/src/lib/dm/shared-media-client.test.ts`                             | **yeni** — 5 test                                      |
| `apps/web/src/lib/api-rate-limit.ts`                                          | **tek satır** — `dm:attachments` (aşağıda, sürpriz #1) |

`components/dm/dm-details-panel.tsx` dosyasına **dokunulmadı**.

### Servis yüzeyi

```ts
getConversationSharedItems(
  { conversationId, cursor?, kind, limit, viewerId },
  dependencies?,           // testte enjekte edilir; varsayılanı prisma
): Promise<SharedMediaPage>            // { items, kind, nextCursor, total }

loadConversationSharedMessages(input, dependencies?)
  : Promise<{ messages: DmSharedMediaMessage[]; nextCursor: string | null }>
```

`loadConversationSharedMessages` iki tüketicinin ortak gövdesidir: keyset sayfa, 2c §7 geçmiş
tabanı, C4 süre filtresi, tarama durumuna göre URL gizleme, imleç 404'ü, katılımcı 403'ü —
hepsi orada, tek kopya.

---

## 1. Mobil biçim farkı — **çıktı**, üç noktada

Servis mobil biçime **eğilmedi**; fark `mobile-shared-media-service.ts` içindeki ince
adaptörle kapatıldı (prompt'un istediği yol).

| Nokta      | Mobil (değişmedi)                                                                                                                                                                          | Web (§15.5)                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Kip adları | `media` · `files` · `links`                                                                                                                                                                | `media` · `file` · `link`                                             |
| Zarf       | `{ items, nextCursor, tab }`                                                                                                                                                               | `{ items, kind, nextCursor, total }`                                  |
| Öğe        | ayırt edici birleşim; medya/dosya öğesi **tam `MessageAttachment`** taşır (`{ attachment, kind, messageCreatedAt, messageId }`), bağlantı `{ id, kind, messageCreatedAt, messageId, url }` | üç düz DTO (`SharedMediaItemDTO` / `SharedFileDTO` / `SharedLinkDTO`) |

Köprü `toSharedMediaKind(tab)` (`shared-media.ts`). Mobil zarfta `total` **yok** — mobil ekran
sayaç istemiyor ve şipşak bir alan eklemek şemayı kırardı.

### Mobil route-logic'e neden dokunulmadı

`apps/web/src/app/api/v1/mobile/dm/[conversationId]/attachments/route-logic.ts` **zaten** saf
bir delegasyon kabuğuydu (43 satır: auth → rate limit → zod → `listAttachments`). Mevcut mobil
testi `listAttachments` bağımlılığını enjekte edip çağrı gövdesini
(`{ conversationId, cursor?, limit, tab, userId }`) birebir doğruluyor. Route-logic'i ortak
servisi doğrudan çağıracak şekilde yeniden yazmak o testi kırardı ve prompt "mevcut mobil
testleri **değişmeden** geçmeli" diyor. Bu yüzden indirgeme bir katman aşağıda,
`mobile-shared-media-service.ts` içinde yapıldı. Dosya artık iş mantığı taşımıyor.

### Mobilde bilerek değişen tek davranış

Bağlantılar sekmesi artık **kod bloğu ve satır içi kod içindeki URL'leri listelemiyor**
(aşağıda §3). Yanıt biçimi aynı, hiçbir mobil test bu davranışı doğrulamıyordu, ve sohbet
balonu o URL'leri zaten kod olarak çiziyor.

---

## 2. Ş5'in sileceği önbellek türetme bloğu — `components/dm/dm-details-panel.tsx` (498 satır)

K11 "React Query önbelleğinden türetme kalkar" diyor. Silinecek **tam satır aralıkları**:

| Satır       | Ne                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **49–77**   | `useCachedDmMessages` — `queryCache.subscribe` + `useSyncExternalStore` ile mesaj sayfalarını okuyan kanca. Türetmenin kalbi.        |
| **79–89**   | `formatAttachmentSize` — yerine `shared-media-client.ts`'teki `formatSharedFileSize`                                                 |
| **91–102**  | `formatShortDate` — yalnız aşağıdaki iki satır tipi kullanıyor                                                                       |
| **113–114** | `const messages = useCachedDmMessages(...)` + `const sharedAttachments = useMemo(() => getDmSharedAttachmentSummary(messages), ...)` |
| **152–153** | `<DmSharedMedia … />` ve `<DmSharedFiles … />` çağrıları                                                                             |
| **326–346** | `export function DmSharedMedia`                                                                                                      |
| **348–368** | `export function DmSharedFiles`                                                                                                      |
| **424–462** | `SharedMediaTile`                                                                                                                    |
| **464–498** | `SharedFileRow` (dosya sonu)                                                                                                         |

Bu bloklar gidince **ölü kalan importlar** (hepsi başka yerde kullanılmıyor, tek tek doğrulandı):

- L7 `Download`, L8 `FileText`, L9 `ImageIcon`, L13 `Video` (lucide)
- L15 `useCallback`, `useSyncExternalStore` (`useMemo` de ölür: kalan üç kullanımının üçü de
  bu bloklarda)
- L16 `useQueryClient`
- L22 `type DmSharedAttachment, getDmSharedAttachmentSummary` (`@/lib/dm/details`)
- L26 `getMessagesQueryKey, type MessagePages` (`@/hooks/use-messages`)
- L28–31 `isMessageImageContentType, isMessageVideoContentType`
- L112'deki `const { locale, t } = useI18n();` içinde **`locale`** ölür, `t` kalır

**Dikkat:** `DmConversationShortcuts` (L370–396) bu bloğun içinde **değil** ve
`dm-group-details-panel.tsx` onu import ediyor — dosya başındaki yorum bu tek yönlü bağımlılığı
anlatıyor. K4 üç paneli birden sildiği için Ş5 zaten hepsini taşıyacak, ama sıra önemliyse
`DmConversationShortcuts` en son gider.

`lib/dm/details.ts` içindeki `getDmSharedAttachmentSummary` **silinmez**: mobil DM ayrıntı
yanıtının sabit 30 öğelik önizlemesi hâlâ onu kullanıyor (`mobile-details-service.ts`) ve
`shared-media.test.ts` iki sınıflandırmanın aynı kaldığını doğrulamaya devam ediyor.

---

## 3. Bağlantı çıkarımı hangi blok tiplerini atlıyor

`shared-links.ts` gövdeyi `lib/messages/message-blocks.ts`'in `toMessageBlocks` fonksiyonundan
geçiriyor ve **yalnız `text` bloklarını** tarıyor.

| Blok tipi                      | Durum       |
| ------------------------------ | ----------- |
| `text`                         | taranır     |
| `codeBlock` (` ``` ` çiti)     | **atlanır** |
| `inlineCode` (tek ters tırnak) | **atlanır** |

Ek olarak düşenler: `http://` (yalnız `https:`), `new URL()`'in ayrıştıramadığı belirteçler
(çıplak `https://` dâhil), 2048 karakterden uzun yapıştırmalar, mesaj içindeki tekrarlar, ve
mesaj başına 10'uncudan sonrası (`DM_SHARED_LINKS_PER_MESSAGE`).

Sona yapışan noktalama **korunuyor** (`https://whispr.app/b,`) — sohbet balonunun ayrıştırıcısı
da koruyor; iki yüzey aynı URL'yi açmalı. `host` yine de doğru türetiliyor.

### `title` nereden geliyor — küçük bir sözleşme sapması

Prompt "embed/preview kaydı varsa oradan" diyor. **Şemada böyle bir tablo yok** — `Embed`,
`LinkPreview` ya da eşdeğeri bir model `schema.prisma` içinde bulunmuyor (tek eşleşme
`UserSettings.linkPreviews`, o da bir tercih bayrağı). Bu hâliyle `title` her satırda `null`
olurdu ve §15.5'in `Sürüm 2.4 notları` satırı ürüne hiç ulaşmazdı.

Bu yüzden `title` **markdown bağlantı etiketinden** okunuyor:
`[Sürüm 2.4 notları](https://whispr.app/changelog)` → `title: "Sürüm 2.4 notları"`. Çıplak yazılmış
bir URL'de `title: null` kalır ve istemci hostu gösterir (DTO yorumunun zaten dediği gibi).
Etiket 200 karakterde kırpılır. **Ş7 iki durumu da çizmeli.**

---

## 4. İmleç biçimi

K16'ya uygun, mevcut DM uçlarının biçimi taklit edildi — yeni bir biçim icat edilmedi.

- **İmleç = mesaj id'si.** `nextCursor` sayfanın son mesajının id'si, sayfa dolmadıysa `null`.
- Keyset sırası `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`,
  `@@index([conversationId, createdAt])` üzerinden; `toHistoryWindowFilter` tavanı ve tabanı
  tek `where` içinde birleştiriyor.
- **`limit` bir mesaj sayısıdır, öğe sayısı değil.** 1–50, varsayılan 30. Bir sayfa 0 ile
  `5 × limit` arası medya/dosya, 0 ile `10 × limit` arası bağlantı üretebilir.
- Sorgu: `?kind=media|file|link&cursor=<messageId>&limit=<1..50>`. Şema `.strict()` —
  tanınmayan parametre 400.
- Bu sohbete ait olmayan bir imleç **404 `NOT_FOUND`** (mobil uçla aynı davranış).
- `offset` **yok**.

---

## 5. Görünürlük kuralı (atlanmayan nokta) nasıl uygulandı

`buildSharedItemsMessageWhere` üç kip için de tek yerden üretiliyor ve
`toHistoryWindowFilter(historyFromAt, cursor)` ile `toUnexpiredFilter(now)` her zaman içinde.
Viewer'ın `DMParticipant.historyFromAt` değeri doluysa o andan önceki hiçbir ek ve bağlantı
listeye girmiyor.

Kural **sayfada da toplamda da** geçerli — test bunu üç kip için ayrı ayrı doğruluyor
(`applies the viewer's history floor to all three kinds, page and total alike`): sayfa sorgusu ve
sayaç sorgusu iki ayrı `where` üretiyor ve ikisinde de `createdAt: { gte: historyFromAt }` var.
Sayaçtan tabanın düşmesi, temizlenmiş bir geçmişin `+N` örtüsünde sızması demek olurdu.

---

## 6. `total` gerçekten toplam (atlanmayan nokta)

| Kip              | Kaynak                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `media` / `file` | `prisma.attachment.count` — içerik tipi + `dmMessage: { is: <görünür kapsam> }` + görüntüleyenin URL'yi görebildiği ek yordamı |
| `link`           | Gövde taraması: `SHARED_LINK_TOTAL_SCAN_MAX = 500` mesaj gövdesi okunur ve **URL sayılır**, mesaj değil                        |

İmleç sayaç filtresine **girmiyor** — `total` listenin tamamını sayar, imleçten sonrasını değil
(test: `counts the whole list rather than the tail after the cursor`).

Bağlantı sayacı neden taramalı: bir bağlantının kendi satırı yok, `Text` kolonunun içinde
yaşıyor. Mesaj saymak yanlış olurdu (bir mesaj üç URL taşıyabilir; kod çiti içinde URL taşıyan
bir mesaj **hiç** öğe üretmez). 500'lük tavan bir kabul: sayı bir `+N` örtüsünü besliyor ve bu
kadar bağlantı taşıyan bir sohbette kesin rakam zaten anlamını yitirmiş oluyor.

`total` ile `items` **aynı** yordamla eleniyor: görüntüleyenin açamayacağı bir ek (başkasının
taranmamış yüklemesi, `INFECTED`) hem listeden düşüyor hem sayaçtan. Aksi hâlde örtü
çizilmeyecek karolar vaat ederdi.

---

## 7. Kardeş şeritlerin ve ana oturumun bilmesi gereken sürprizler

1. **`api-rate-limit.ts` ortak dosyaya bir satır yazıldı.** `dm:attachments`
   (`{ limit: 120, windowSeconds: 60 }`), alfabetik olarak `dm:conversation:read`'in üstüne.
   Prompt'ta sahiplenilen dosya değil ama uç bu anahtar olmadan yazılamaz; dört şeridin dördü de
   aynı dosyaya bir satır ekliyor. Ş2'nin `dm:group:clear-history` / `dm:group:delete`
   satırlarıyla çakışma **olmadı** (ikisi de dosyada duruyor). Ana oturum yine de kapanışta
   dört anahtarın da yerinde olduğunu doğrulasın — bu dosyada son yazan kazanır.
2. **`shared-media.ts` artık `prisma` import ediyor.** Onu (ya da onu import eden bir route
   dosyasını) import eden her test artık `DATABASE_URL` istiyor. `scripts/run-node-tests.mjs`
   bunu zaten ayarlıyor; elle `node --test` koşacaksanız ayarlamalısınız, yoksa
   "DATABASE_URL is required for the PostgreSQL Prisma adapter" ile düşer.
3. **`node --test` köşeli parantezi glob sanıyor.** Tek bir route testini elle koşarken
   `[conversationId]` → `[[]conversationId[]]` yazılmalı; yoksa dosya **sessizce hiç
   koşmaz** ve süit yeşil görünür (`scripts/test-glob-path.mjs` bunun için var).
4. **Bir bağlantı sayfası boş dönüp imleci dolu bırakabilir.** Sayfa filtresi
   (`content contains "https://"`) çıkarımdan bilerek geniş: yalnız kod çiti içinde URL taşıyan
   bir gövde filtreyi geçer, öğe üretmez. Ş7'nin sonsuz listesi "boş sayfa = son sayfa" **demeyecek**,
   `nextCursor === null` olana kadar sayfalayacak. Medya/dosya sayfaları da aynı sebeple kısa
   dönebilir (görülemeyen ekler düşer).
5. **Ş7 için hazır iki istemci yardımcısı** `lib/dm/shared-media-client.ts` içinde:
   - `getSharedMediaOverlayCount(total)` → `+12` örtüsünün sayısı (`total - PROFILE_MEDIA_PREVIEW_COUNT`,
     alt sınır 0). Sayfa uzunluğundan hesaplama, bu yardımcıyı çağır.
   - `formatSharedFileSize(bytes, locale)` → `1,2 MB` (tr) / `1.2 MB` (en). Servis ham bayt
     döndürüyor; biçim burada.
   - Sorgu anahtarları: `dmSharedMediaQueryKeys.page(conversationId, kind)` ve
     `.conversation(conversationId)` (sohbetten ayrılma / geçmişi temizleme sonrası tek çağrıda
     geçersiz kılmak için).
6. **`SharedMediaPageSchema.items` bir birleşim ve sırası medya → dosya → bağlantı.** Boş dizi
   birinci dala düşer (zararsız); dolu dosya/bağlantı dizileri `.strict()` sayesinde doğru dala
   gider. Route yanıtı bu şemayla doğruluyor, test dosya sayfasının alan kaybetmeden geçtiğini
   ayrıca kanıtlıyor.
7. **1:1 DM ve grup aynı ucu kullanıyor.** Katılımcılık kontrolü servisin ilk satırında
   (`requireDMParticipant`), route'ta değil — `getConversationSharedItems`'i çağıran her yeni
   yer kendiliğinden kapının arkasında kalır.
8. **Ş2'ye:** "geçmişi temizle" `DMParticipant.historyFromAt` yazdığı sürece medya sekmesi
   kendiliğinden temizlenir; bu uca ayrıca haber verilmesi gerekmiyor. Yalnız istemci tarafında
   `dmSharedMediaQueryKeys.conversation(id)` geçersiz kılınmalı (Ş5/Ş7'nin işi).
9. **Ş4'e:** bu şerit `lib/dm/service.ts` dosyasına **yazmadı**, yalnız
   `requireDMParticipant` / `toHistoryWindowFilter` / `toUnexpiredFilter` / `dmAttachmentSelect`
   fonksiyonlarını okuyor. `requireDMParticipant`'ın dönüş biçimi değişirse bu servis de
   etkilenir.

---

## 8. Kayda geçmesi gereken sapmalar

`metrics.ts` bu şeridin dosyası olmadığı için `SPEC_DEVIATIONS` listesine **yazılmadı**; ana
oturum uygun görürse ekler.

1. **`SharedLinkDTO.title` kaynağı.** SPEC/prompt "embed/preview kaydı" diyor; ürün böyle bir
   tablo taşımıyor. Başlık markdown bağlantı etiketinden okunuyor, yoksa `null`.
2. **Bağlantı `total`'ı 500 mesaj gövdesiyle sınırlı.** Medya ve dosya toplamları sınırsız ve
   kesin; bağlantıda tavan var.
3. **`1,2 MB` biçimi istemcide.** Servis ham bayt döner (`SharedFileDTOSchema` yorumunun zaten
   istediği bölüşüm) — sapma değil, iş bölümü; yine de Ş7'nin bilmesi gereken sınır.

## Açık kalan

Yok. Ş5 ve Ş7 bu uçla çalışmaya başlayabilir.
