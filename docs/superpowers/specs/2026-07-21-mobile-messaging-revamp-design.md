# Mobil Mesajlaşma Yenileme — Tasarım Spec'i

**Tarih:** 2026-07-21
**Branch:** uat
**Yaklaşım:** İnkremental refactor (mevcut react-query optimistic katmanı + realtime köprü korunur; bağlantı katmanı düzeltilir, özellikler faz faz eklenir).

## Problem

1. **Algılanan yavaşlık:** Mesaj gönderiminde yazı alanı geç temizleniyor, gönder butonu kilitleniyor.
   - Kök neden 1: `apps/mobile/src/app/composer/mobile-composer.tsx` `handleSend` — draft temizliği `await onSend(...)` (tam HTTP gidiş-dönüşü) sonrasına bırakılmış; `isSending` composer'ı kilitliyor.
   - Kök neden 2: `apps/mobile/src/query/use-mobile-message-mutations.ts` send mutation `onSettled` — her gönderimde mesaj listesi + bootstrap sorgusu invalidate ediliyor (tam refetch).
   - Not: Optimistic insert ve realtime cache patch altyapısı zaten sağlam; sorun yalnız bağlantı katmanında.
2. **Özellik eksikleri (web'de var, mobilde yok):** markdown render, biçimlendirme toolbar'ı, anket. Reaction ve arama var ama geliştirilecek.

## Kapsam ve Fazlar

Her faz bağımsız teslim edilir; her fazın kendi implementation planı olur.

### Faz 1 — Hız (send akışı)

**Composer (`mobile-composer.tsx`):**
- `handleSend` senkron temizler: draft yerel değişkene alınır; `setDraft("")`, attachment draft temizliği, `onCancelIntent` ANINDA çalışır; mutation `void` ile arkada koşar.
- Senkron guard: boş içerik / oturum yok / hedef yok → draft silinmez, gönderim başlatılmaz. Guard'lar composer + feature hook'ta senkron kontrol edilir (`canSend` benzeri saf fonksiyon).
- `isSending` composer kilidi kaldırılır; art arda gönderim serbest (Discord davranışı). Kilit yalnız attachment upload sürerken kalır.
- Edit modu aynı senkron akışa geçer (edit mutation'ı zaten optimistic).

**Mutation katmanı (`use-mobile-message-mutations.ts`):**
- Send mutation `onSettled` invalidate bloğu kaldırılır. Kaynaklar: optimistic insert → onSuccess'te sunucu mesajıyla replace → realtime köprü patch'leri. Unread/lastMessage güncellemeleri realtime köprüdeki hedefli patch'lerle sağlanır (`realtime-query-bridge.ts` mevcut mekanizma).
- **Hata davranışı değişikliği:** send onError'da rollback (previousData restore) YAPILMAZ. Optimistic mesaj listede kalır, `deliveryStatus: "failed"` işaretlenir. Yeni cache yardımcı fonksiyonu: `markMobileMessageFailed(data, clientId)`.
- Retry: failed mesaj aksiyonu aynı içerik/attachment ile yeni mutation başlatır (eski failed girdi kaldırılır, yeni clientId ile optimistic insert). Sil: failed girdiyi cache'ten kaldırır. Sunucuya gitmiş olma riskine karşı retry, realtime'dan gelen aynı mesajla `appendOrReplaceMobileMessage` dedupe kuralına dayanır.
- Reaction/edit/delete mutation'ları mevcut haliyle kalır (onlarda invalidate fırtınası yok).

**Ekranlar:** `sendState` tabanlı composer kilit UI'ları sadeleşir; failed durumu balon üzerinde gösterilir (banner değil).

**DM ve kanal simetrik:** iki akış da aynı davranışı alır.

### Faz 2 — Mesajlaşma araçları

**Markdown render:**
- Yeni saf parser: `apps/mobile/src/messages/mobile-message-markdown.ts` (dış bağımlılık yok) + render bileşeni `apps/mobile/src/app/components/message-markdown-text.tsx` (RN `Text`/`View` ağacı, tema token'larıyla).
- Desteklenen set (web `message-item.tsx` ile birebir): `**kalın**`, `*italik*`, `~~üstü çizili~~`, `` `inline kod` ``, ``` kod bloğu ```, `- / 1.` listeler, `[link](url)`, mention token (`@kullanıcı`).
- Web'in escape/dönüşüm kurallarıyla (`formatMessageContentForMarkdown`) uyum; golden test seti iki platformda aynı örnekleri doğrular.
- Kod bloğu: monospace, yatay scroll, tema uyumlu zemin.

**Biçimlendirme toolbar'ı (composer):**
- Composer üstünde açılır satır: kalın, italik, üstü çizili, inline kod, kod bloğu, liste, anket şablonu.
- `TextInput` `onSelectionChange` ile seçim takibi; seçili metni sarar, seçim yoksa placeholder metin ekleyip seçer (web `insertMarkdownWrap` davranışının portu).

**Anket (web kuralı portu):**
- Web `parsePollBlock` kuralı (`**Poll|Anket:** soru`, seçenek satırları, süre satırı) mobile port edilir — saf fonksiyon + golden testler.
- Anket kartı: soru, seçenekler, oy butonu (numaralı emoji reaction — mevcut reaction mutation), oy sayısı + yüzde çubuğu, süre bitiminde salt-okunur sonuç görünümü.
- Composer'daki anket şablonu butonu web şablonunun aynısını ekler.

**Reaction geliştirme:**
- Mesaja uzun basış → tek yüzey: hızlı reaction bar (sık kullanılan 6 emoji + tam picker butonu) + mevcut aksiyon menüsü.
- Reaction chip'ine uzun basış → "kim tepki verdi" sheet. Veri mevcut: `MessageReaction.users` (`packages/types/src/messages.ts`). Ek API yok.

**Aramada sonuca atlama:**
- Arama sonucuna tap → mesaj listesinde scroll + kısa vurgu animasyonu.
- Mesaj yüklü sayfalarda yoksa: mobile messages API'ye `around=messageId` parametresi eklenir (backend: cursor'lu tek küçük ekleme; kanal + DM rotaları). İlgili sayfa çekilir, liste o noktadan açılır, iki yöne sayfalama çalışır.

### Faz 3 — Pin + Mention

**Pin:**
- Uzun basış menüsüne "Sabitle / Sabitlemeyi kaldır"; yetki kuralı web/backend'dekiyle aynı (mesaj sahibi/moderatör).
- Kanal ve DM başlığında "Sabitlenmiş mesajlar" sheet'i; tap ile mesaja atlama (Faz 2 jump altyapısı).
- Tip alanları hazır (`isPinned`, `pinnedAt`, `pinnedById`). Mobile API'ye pin/unpin endpoint'i + pinned liste endpoint'i eklenir; realtime köprüye pin eventi cache patch'i.

**Mention:**
- Composer'da `@` → üye autocomplete (workspace: members query; DM: katılımcılar). Seçim `@kullanıcıadı` ekler.
- Render: parser'daki mention token vurgulu chip; kullanıcının kendisi mention edildiyse balon vurgusu (web davranışı).
- Mention bildirimleri backend'de mevcut (`message-notification-service`); mobil yalnız yazım + görünüm.

## Kapsam Dışı (bilinçli)

- Kalıcı offline outbox (uçak modunda kuyruk) — olası Faz 4.
- Gerçek anket varlığı (DB/canlı sonuç/tekil oy garantisi) — web kuralı yeterli görüldü.
- Zamanlanmış gönderim, kanal okundu detayı, mesaj iletme — seçilmedi.
- Web tarafında görsel/işlev değişikliği (yalnız `around` parametresi ve pin mobile endpoint'leri eklenir).

## Veri Akışı (Faz 1 sonrası gönderim)

1. Kullanıcı gönderir → composer senkron temizlenir.
2. Optimistic mesaj (`deliveryStatus: "sending"`) cache'e girer → liste anında gösterir.
3. HTTP yanıtı → optimistic girdi sunucu mesajıyla replace.
4. Hata → girdi `failed`; balonda tekrar dene / sil.
5. Realtime eventi → `appendOrReplaceMobileMessage` dedupe eder; diğer üyelerde anında düşer.
6. Invalidate yok; unread/lastMessage realtime hedefli patch'lerle.

## Hata Yönetimi

- Send hatası: failed balon + retry/sil (rollback yok).
- Ağ yok: anında failed + "çevrimdışısın" notu.
- Reaction/pin hatası: optimistic geri alınır, kısa toast.
- Edit hatası: mevcut rollback davranışı korunur.

## Test Stratejisi

- Parser + anket parse golden testleri (web örnek setiyle birebir).
- Cache fonksiyonları unit (insert/replace/markFailed/dedupe).
- Mutation akış testleri: onSettled invalidate yok; onError failed işaretler; retry akışı.
- Composer testi: draft senkron temizlenir; guard başarısızsa temizlenmez.
- `around` parametresi backend route testi (kanal + DM).
- Doğrulama: repo'nun özel `tsc6` typecheck + pnpm test akışı (bkz. memory: mobile verify commands).

## Faz Teslim Sırası

1. Faz 1 (hız) — bağımsız, hemen değer.
2. Faz 2 (markdown → toolbar → anket → reaction → arama atlama; bu iç sıra planlamada netleşir).
3. Faz 3 (pin → mention).
