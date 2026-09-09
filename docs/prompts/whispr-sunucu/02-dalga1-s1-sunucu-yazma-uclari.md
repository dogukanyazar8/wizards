# Ş1 — Sunucu yazma uçları: ikon rengi, yavaş mod, sahiplik devri (Dalga 1)

> Önce oku: `00-ortak-baglam.md`, `raporlar/s0-sozlesme.md`, `SPEC-SUNUCU.md` §8.1, §8.3, §8.9.
> Bağımlılık: **Ş0**. Paralel: Ş2, Ş3.

---

## Görev

Ş0'ın açtığı iki kolonu ve sahiplik devrini uçtan uca çalışır hale getir. UI yok; yalnız servis,
uç, yetki, audit ve test.

---

## 1. `PATCH /api/v1/servers/[serverId]`

`lib/workspace/server-service.ts` → `updateWorkspaceServer`:

- `iconColor` (`ServerIconTone | null`) ve `slowModeDelay` yazılır.
- `iconColor: null` = "renk seçimini kaldır", deterministik türetmeye döner — **silme değil, sıfırlama**.
- Yetki: mevcut `MANAGE_SERVER` guard'ı; değişiklik yok.
- Yanıt `WorkspaceServerDetail` iki yeni alanı **her zaman** taşır.

## 2. Yavaş mod uygulaması

`lib/workspace/channel-message-send-service.ts`:

- Etkin gecikme `resolveEffectiveSlowMode(server.slowModeDelay, channel.slowModeDelay)`
  (Ş0'ın saf fonksiyonu). **İki süre birlikte tanımlıysa uzun olan uygulanır** (SPEC §8.3).
- Yetki kısayolu korunur: `MANAGE_MESSAGES` / `ADMINISTRATOR` yavaş moddan muaf ise bugünkü davranış
  aynen sürer; değiştirilmez.
- Hata mesajı mevcut yavaş mod hatasını kullanır; yeni hata kodu üretilmez.
- Testler: yalnız kanal · yalnız sunucu · ikisi (uzun olan) · ikisi kapalı.

## 3. `POST /api/v1/servers/[serverId]/transfer-ownership`

Yeni uç. Gövde `TransferServerOwnershipSchema` (`newOwnerUserId`, `acknowledged: true`).

Kurallar:

- Yalnız **mevcut sahip** çağırabilir; başkası `403`.
- Hedef, sunucunun **üyesi** olmalı ve sahip olmamalı; değilse `400`.
- Tek transaction içinde:
  1. `Server.ownerId` → hedef,
  2. eski sahip **Admin** rolüne düşer (SPEC §8.9: "sen Admin rolüne düşersin"),
  3. hedef `Sunucu Sahibi` rolünü alır,
  4. `AuditLog` satırı (`lib/workspace/audit-log.ts`) — eylem, eski/yeni sahip, `ipHash` mevcut düzende,
  5. `authorizationRevision` artırılır (`lib/workspace/authorization-revision.ts`) ve
     iki kullanıcı için özne revizyonu yayımlanır.
- Soket: mevcut `workspace-events.ts` düzeninde sunucu güncelleme olayı yayılır; **yeni olay tipi
  uydurulmaz**, mevcut sunucu güncelleme olayı kullanılır.
- Rate limit: `enforceApiRateLimit(userId, "server:update")` yeniden kullanılır.

## 4. Silme onayı

`DELETE /api/v1/servers/[serverId]` **zaten var** (`DeleteServerSchema.confirmationName`).

- Karşılaştırmanın **birebir** (trim'li, büyük/küçük harfe duyarlı) olduğu testle sabitlenir.
- Yalnız sahip; admin `403`.
- Bulgu varsa rapora yazılır, davranış değiştirilmez.

## 5. Okuma tarafı

- `getWorkspaceServerDetail` iki yeni alanı döndürür.
- `WorkspaceServerSummary` (rail + nav paneli) `iconColor`'ı taşır ki ray ve sunucu kartı aynı rengi
  göstersin (K12: tek kaynak).
- `lib/workspace/client.ts`'e yazma yardımcıları eklenir:
  `updateServerAppearance`, `updateServerSlowMode`, `transferServerOwnership`.

## 6. Mobil (K10)

- `/api/v1/mobile/servers/[serverId]/settings` yanıtına iki alan **opsiyonel** eklenir.
- Mobil yazma sözleşmesi değişmez; mobil ekran dosyalarına dokunulmaz.

---

## Sınırlar

- UI yok, bileşen dosyası açılmaz.
- Yeni hata kodu, yeni soket olayı, yeni rate-limit anahtarı üretilmez.
- Ban/timeout Ş2'de, davet Ş3'te — bu şerit onlara girmez.

---

## Kabul kriterleri

- [ ] `iconColor` ve `slowModeDelay` yazılıp okunuyor; `null` sıfırlama davranışı testli.
- [ ] Etkin yavaş mod `max(server, channel)`; dört senaryo testli.
- [ ] `transfer-ownership` ucu: yetkisiz `403`, üye olmayan hedef `400`, başarılıda sahip değişiyor,
      eski sahip Admin oluyor, audit satırı yazılıyor, authorization revision artıyor.
- [ ] Silme onayı birebir eşleşme testiyle sabitlendi.
- [ ] `route-contract.test.ts` yeni ucu tanıyor.
- [ ] `pnpm --filter @wizards/web typecheck|lint|test` ve `@wizards/types test` yeşil.

## Rapor

`raporlar/s1-sunucu-yazma.md`
