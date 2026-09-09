# Ş3 — Davet: QR, hedefli davet, bekleyen davetler (Dalga 1)

> Önce oku: `00-ortak-baglam.md`, `raporlar/s0-sozlesme.md`, `SPEC-SUNUCU.md` §6.3, §8.7.
> Bağımlılık: **Ş0**. Paralel: Ş1, Ş2. Karar: **K3** (kesikli "yakında" çipleri kaldırılıyor).

---

## Görev

Davet katmanını SPEC'in üç ertelenmiş maddesiyle birlikte tamamla. `ServerInvite.targetUserId`
kolonu ve `qrcode@1.5.4` bağımlılığı **zaten var**; yeni tablo ve yeni paket yok.

---

## 1. Davet oluşturma (SPEC §8.7)

`POST /api/v1/servers/[serverId]/invites` — `CreateInviteSchema` **hazır**.

- Süre çipleri → `expiresInHours`: `1 · 12 · 24 · 168 (7 gün) · 720 (30 gün) · null (Süresiz)`.
- Kullanım çipleri → `maxUses`: `1 · 5 · 25 · 100 · 1000 · null (Sınırsız)`.
- Varsayılan: `168` saat + `25` kullanım (SPEC'te seçili çipler).
- Hedef kanal: sunucunun **yazı** kanalları; varsayılan ilk kanal.
- Yetki `MANAGE_INVITES`; sunucu `allowMemberAdds` kapalıysa yalnız admin/sahip (SPEC §8.6 anahtarı).

## 2. Hedefli davet — "Arkadaş seçerek davet"

- `POST .../invites` gövdesine `targetUserId` opsiyonel eklenir (`TargetedInviteSchema` alanı).
- Hedef kullanıcı davet edenin **arkadaşı** olmalı (mevcut `lib/friends` servisi); değilse `400`.
- Hedefli davet oluşturulduğunda mevcut bildirim/outbox altyapısıyla hedefe bildirim gider —
  **yeni bildirim tipi uydurulmaz**, mevcut davet bildirimi ailesi kullanılır. Karşılığı yoksa
  `TODO(api):` ile işaretlenir ve rapora yazılır.
- Aynı hedefe açık (kullanılmamış, süresi geçmemiş) davet varsa yenisi üretilmez, mevcut döner.

## 3. Bekleyen davetler

- `GET .../invites?pending=1` → `targetUserId` dolu, `uses = 0`, süresi geçmemiş davetler.
- Yanıt satırı: kod, hedef kullanıcı (ad + kullanıcı adı + avatar), kanal, oluşturan, kalan süre.
- `DELETE .../invites/[inviteId]` **zaten var** → iptal bunu kullanır.

## 4. QR kod

- QR **istemcide** üretilir (`qrcode` paketi, canvas). Sunucu ucu eklenmez.
- Yardımcı: `lib/invites/qr.ts` → `renderInviteQr(canvas, url, { theme })`.
  Renkler token'lardan okunur (`--foreground` / `--surface-card`), hex gömülmez.
- Hata durumunda (canvas yok, üretim hatası) sessiz düşer, bağlantı satırı çalışmaya devam eder.

## 5. Davet listesi ve kullanım

- `GET .../invites` yanıtı `uses / maxUses` ve `expiresAt` taşıyor (**hazır**), `targetUserId` eklendi (Ş0).
- Kullanım sayacının canlı güncellenmesi mevcut soket akışıyla; yeni olay yok.

## 6. İstemci yardımcıları

`lib/workspace/client.ts`: `createServerInvite({ channelId, expiresInHours, maxUses, targetUserId })`,
`fetchServerInvites({ pending })`, `revokeServerInvite`.

## 7. Mobil (K10)

`targetUserId` mobil davet sözleşmesine **opsiyonel** eklenir; mobil ekran değişmez.

---

## Sınırlar

- UI yok (pencere Ş9'da, ayarlar bölümü Ş13'te).
- Yeni tablo, yeni paket, yeni bildirim tipi yok.
- Davet kabul/katılma akışı (`/servers/[serverId]/join`) **değişmez**.

---

## Kabul kriterleri

- [ ] 6 süre + 6 kullanım seçeneği uçtan uca kabul ediliyor; `null` iki alanda da süresiz/sınırsız.
- [ ] Hedefli davet arkadaş kontrolünden geçiyor; arkadaş olmayana `400`; tekrar istekte aynı davet dönüyor.
- [ ] `?pending=1` yalnız kullanılmamış, süresi geçmemiş hedefli davetleri döndürüyor.
- [ ] `renderInviteQr` testli (üretim + hata yolu); token dışında renk yok.
- [ ] Yetkisiz kullanıcı davet oluşturamıyor; `allowMemberAdds` kapalıyken üye `403`.
- [ ] typecheck/lint/test yeşil; `route-contract.test.ts` güncel.

## Rapor

`raporlar/s3-davet.md` — hedefli davet bildiriminin gerçek karşılığı bulunduysa uç adı, bulunmadıysa
`TODO(api):` gerekçesi yazılır.
