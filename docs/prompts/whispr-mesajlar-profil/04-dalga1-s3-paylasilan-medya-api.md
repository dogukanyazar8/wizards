# Dalga 1 · Ş3 — Paylaşılan medya · dosya · bağlantı ucu

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15.5'in **Medya** sekmesini besleyen üç listeyi tek
servise indir ve web ucunu aç. Bu şerit **arayüz çizmez**.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (özellikle K11) ve
`design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` §15.5 "Medya".
Kod tabanı için `graphify query "dm shared media attachments mobile route logic message blocks"`.

## Bugünkü durum (doğrulandı)

- `apps/web/src/lib/dm/shared-media.ts` **var** ve `getDmSharedAttachmentSummary` üretiyor.
- `apps/web/src/lib/dm/mobile-shared-media-service.ts` **var**.
- `GET /api/v1/mobile/dm/[conversationId]/attachments` **var**; web karşılığı **yok**.
- Web bugün paylaşılan medyayı `DmDetailsPanel` içinde **React Query önbelleğinden** türetiyor —
  önbellek sayfalanmış ve eksiktir, panelin istediği `18 medya + "+12" örtüsü` sayacını veremez.
  K11 bu türetmeyi kaldırıyor.

## Sahiplenilen dosyalar

- `apps/web/src/lib/dm/shared-media.ts` + `.test.ts` (genişletilir)
- `apps/web/src/lib/dm/mobile-shared-media-service.ts` (ortak servise **indirgenir**)
- `apps/web/src/lib/dm/shared-links.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/dm/[conversationId]/attachments/route.ts` (yeni)
- `apps/web/src/app/api/v1/dm/[conversationId]/attachments/route-logic.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/mobile/dm/[conversationId]/attachments/route-logic.ts`
  (yalnız ortak servise delege edecek şekilde sadeleştirilir)
- `apps/web/src/lib/dm/shared-media-client.ts` (yeni) — fetch + query key. **`lib/dm/client.ts`'e yazma** (paralel çakışma).

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, `components/**`.
`components/dm/dm-details-panel.tsx` içindeki önbellek türetmesi **Ş5** tarafından silinecek —
sen o dosyaya dokunma, yalnız raporunda "Ş5 şu bloğu siler" diye işaretle.

## Ne yapılacak

### 1. Tek servis, üç kip

`getConversationSharedItems(viewerId, conversationId, { kind, cursor, limit })`,
`kind: "media" | "file" | "link"`.

- **`media`** — `isMessageImageContentType` / `isMessageVideoContentType` ile ayrılan ekler.
  `SharedMediaItemDTO`: `{ messageId, attachmentId, url, thumbnailUrl, kind, width, height,
createdAt }`. `total` alanı **gerçek toplam** döner; `+12` örtüsü bu sayıdan hesaplanır,
  sayfa uzunluğundan değil.
- **`file`** — medya olmayan ekler. `SharedFileDTO`:
  `{ messageId, attachmentId, name, extension, sizeBytes, createdAt, url }`. Uzantı karosunun
  etiketi (`PDF`, `FIG`) ad üzerinden büyük harfe çevrilerek türetilir; ayrı kolon açılmaz.
  Boyut biçimi (`1,2 MB` — Türkçe ondalık virgülü) **istemcide** yapılır; servis ham bayt döner.
- **`link`** — mesaj gövdesinden çıkarılan bağlantılar. Kaynak `lib/messages/message-blocks.ts`
  (blok ayrıştırması zaten var). `SharedLinkDTO`: `{ messageId, url, title, host, createdAt }`.
  `title` embed/preview kaydı varsa oradan, yoksa `null` (istemci hostu gösterir).
  **Kod bloğu ve satır içi kod içindeki URL'ler dahil edilmez** — ayrıştırıcı zaten blok tipini
  biliyor, filtre orada uygulanır.

Üç kip de `SharedMediaPage` döner: `{ items, nextCursor, total }` (K16).

### Görünürlük kuralı — atlanmayacak

Viewer'ın `DMParticipant.historyFromAt` değeri doluysa (grup geçmiş penceresi ya da Ş2'nin
"geçmişi temizle" eylemi) o tarihten **önceki** ekler ve bağlantılar listeye girmez. Bu kural
üç kipte de uygulanır; testte doğrulanır. Aksi hâlde temizlenmiş bir geçmiş medya sekmesinden
sızar.

### 2. Uç

`GET /api/v1/dm/[conversationId]/attachments?kind=media|file|link&cursor=&limit=`

`requireApiUserId` → `enforceApiRateLimit(userId, "dm:attachments")` → zod (`kind` enum, `limit`
üst sınırlı) → katılımcılık → servis. 1:1 DM ve grup **aynı** ucu kullanır.

### 3. Mobil route-logic'in indirgenmesi

`mobile-shared-media-service.ts` içindeki iş mantığı ortak servise taşınır; mobil route-logic
yalnız çağırır ve mevcut mobil yanıt biçimini korur. **Mobil sözleşme kırılmaz** — mevcut mobil
testleri değişmeden geçmeli. Biçim farkı varsa mobil tarafta ince bir adapter yaz, servisi mobil
biçime göre eğme.

## Test

- Üç kip de doğru ayrışıyor; medya kipi dosya döndürmüyor.
- `total` sayfa uzunluğundan bağımsız ve gerçek.
- `historyFromAt` dolu viewer eski ekleri **görmüyor** (üç kipte de).
- Kod bloğu içindeki URL bağlantı listesine girmiyor.
- Katılımcı olmayan 403.
- Mevcut mobil attachments testleri **hâlâ** yeşil.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/04-rapor.md` — mobil biçim farkı çıktı mı, `dm-details-panel.tsx` içinde Ş5'in
sileceği türetme bloğunun satır aralığı, bağlantı çıkarımının hangi blok tiplerini atladığı.
