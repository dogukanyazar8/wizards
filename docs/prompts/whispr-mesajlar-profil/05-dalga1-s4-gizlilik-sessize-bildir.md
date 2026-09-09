# Dalga 1 · Ş4 — Gizlilik tercihi, süreli sessize alma, bildirme ucu

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti (özellikle Ş0.2 migration).

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15.5'in gizlilik anahtarlarını, §17'nin süreli
sessize alma akışını ve §15.5'in `Bildir` satırını **veri tarafında** çalışır hâle getir.
Bu şerit **arayüz çizmez**; Dalga 3 Ş9 ve Dalga 2 Ş8 bu uçları tüketecek.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (K2, K8, K9, K12, K13) ve
`design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` §15.5 madde 2, §17 `Sessize al` alt menüsü.
Kod tabanı için `graphify query "dm mute notify user settings read receipts typing indicator report"`.

## Sahiplenilen dosyalar

- `apps/web/src/lib/dm/service.ts` (yalnız `setDirectMessageMuted` genişletmesi)
- `apps/web/src/lib/dm/types.ts` (yalnız mute gövde şemasının genişletilmesi)
- `apps/web/src/app/api/v1/dm/[conversationId]/mute/route.ts`
- `apps/web/src/lib/account/privacy-service.ts` (yeni ya da mevcut hesap servisine ek) + `.test.ts`
- `apps/web/src/app/api/v1/users/me/privacy/route.ts` (yeni)
- `apps/web/src/app/api/v1/users/[userId]/report/route.ts` (yeni, K12)
- `apps/web/src/app/api/v1/mobile/users/[userId]/route-logic.ts` (yalnız rapor mantığının
  paylaşıma çıkarılması — davranış **değişmez**)
- `apps/web/src/lib/messages/typing-visibility.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/dm/conversation-settings-client.ts` (yeni) — mutasyonlar. **`lib/dm/client.ts`'e yazma** (paralel çakışma).

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, `components/**`.

## Ne yapılacak

### 1. Süreli sessize alma (K8)

`setDirectMessageMuted(userId, conversationId, input)` genişler:

```
input: { muted: boolean; duration?: "15m" | "1h" | "8h" | "forever" }
```

- `muted: false` → `muted = false`, `mutedUntil = null`, `notifyLevel` eski değerine döner.
- `muted: true, duration: "forever"` → `muted = true`, `mutedUntil = null`.
- `muted: true, duration: "15m"|"1h"|"8h"` → `muted = true`,
  `mutedUntil = now + süre`.
- `muted` ve `notifyLevel` **aynı update içinde** yazılır (tuzak 5).
- Eski gövde (`{ muted: boolean }`, süre yok) hâlâ geçerlidir ve `forever` gibi davranır —
  mevcut çağıranlar kırılmaz.

**Süre dolmuşsa okuma tarafı sessizliği yok sayar ve tembel temizler** (K8): tek yardımcı yaz —
`resolveMuteState({ muted, mutedUntil }, now)` → `{ muted, mutedUntil }`. Bildirim gönderen yol,
sohbet rayı okunmamış hesabı ve profil paneli **aynı** yardımcıyı kullanır. Ayrı bir zamanlanmış
sweep **yazılmaz**; gerekçeyi yorumla söyle.

Sessize alma bir socket olayı yayar ki aynı hesabın diğer sekmesi başlıktaki pill'i güncellesin.
Mevcut DM socket olay adlandırmasına uy, yeni bir kanal açma.

### 2. Gizlilik tercihi (K9)

`PATCH /api/v1/users/me/privacy` — gövde `{ readReceipts?: boolean; typingIndicator?: boolean }`,
en az biri zorunlu. `UserSettings.showReadReceipts` ve `showTypingIndicator` yazılır.

Tercihin **gerçek etkisi** olmalı, yoksa anahtar dekordur:

- `showReadReceipts: false` → viewer'ın okuma damgası karşı tarafa **iletilmez**. Mevcut okundu
  bilgisi yayan yolu bul ve bu bayrakla kapat. Kendi okunmamış sayacı etkilenmez.
- `showTypingIndicator: false` → viewer'ın `typing` socket olayı **yayınlanmaz**.
  `lib/messages/typing-visibility.ts` tek karar noktası olur; yayınlayan taraf onu çağırır.

İki bayrak da **yayınlayan** tarafta uygulanır, alan tarafta değil — kapalı tercih ağ üzerinden
hiç çıkmasın.

Mobil karşılığı `/api/v1/mobile/account/privacy` (ya da mevcut mobil hesap ucunun alanı) ile
aynı kolonları yazar (K1). Mevcut mobil hesap ayarları ucu bu iki alanı zaten döndürüyorsa
oraya ekle, yeni uç açma.

### 3. Bildirme ucu (K12)

`POST /api/v1/users/[userId]/report` — mobil `mobileUserReportRoute` hangi servisi çağırıyorsa
**aynısını** çağırır. Mantık ortak bir fonksiyona çıkarılır, iki route ince kalır.
Gövde şeması Dalga 0'da paylaşıma çıkarılan `ReportUserRequestSchema`.

- Kendini bildirme 400.
- Rate limit **sıkı** (spam koruması): kullanıcı başına dar pencere.
- `AuditLog` + moderasyon vakası mobil ile birebir aynı biçimde yazılır — iki uçtan gelen kayıt
  moderasyon kuyruğunda ayırt edilemesin.
- Yanıtta bildirilen kullanıcının kişisel alanları dönmez.

## Test

- Dört sürenin dördü doğru `mutedUntil` üretiyor; `forever` `null` yazıyor.
- Eski gövde (`{ muted: true }`) hâlâ çalışıyor.
- `resolveMuteState` süresi dolmuş kaydı sessiz saymıyor.
- `muted` ve `notifyLevel` tek update içinde yazılıyor (sahte Prisma çağrı sayısıyla).
- `readReceipts: false` iken okundu olayı yayınlanmıyor.
- `typingIndicator: false` iken typing olayı yayınlanmıyor.
- Rapor ucu: kendini bildirme 400, rate limit aşımı 429, audit yazılıyor, mobil ile aynı vaka
  biçimi.
- Mevcut mobil rapor testleri **hâlâ** yeşil.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/05-rapor.md` — okundu bilgisi ve typing bayraklarının hangi yolda uygulandığı
(Ş8 arayüzü buna güvenecek), mute socket olayının adı, mobil gizlilik ucunun yeni mi mevcut mu
olduğu.
