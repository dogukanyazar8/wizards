# Ş2 — Üye moderasyonu: ban, zaman aşımı, filtreler (Dalga 1)

> Önce oku: `00-ortak-baglam.md`, `raporlar/s0-sozlesme.md`, `SPEC-SUNUCU.md` §8.6.
> Bağımlılık: **Ş0**. Paralel: Ş1, Ş3. Karar: **K3** (ban/timeout uçtan uca).

---

## Görev

`ServerBan` tablosu, `ServerMember.communicationDisabledUntil` kolonu ve
`/api/v1/servers/[serverId]/bans` ucu **zaten var**. Bunları web sözleşmesine bağla, eksik zaman
aşımı ucunu aç, üye listesinin filtre ve sayaç sözleşmesini kur.

---

## 1. Mevcut yüzeyin envanteri

Başlamadan önce çıkar ve rapora yaz:

- `lib/workspace/member-ban-service.ts` — hangi fonksiyonlar, hangi yetki guard'ı, mesaj silme
  penceresi destekleniyor mu.
- `app/api/v1/servers/[serverId]/bans/route.ts` ve `bans/[userId]/route.ts` — mevcut metotlar.
- `members/[memberId]/route.ts` — rol atama ve çıkarma bugün nasıl.

Var olan davranış **yeniden yazılmaz**; eksik olan eklenir.

## 2. Zaman aşımı ucu

`PATCH /api/v1/servers/[serverId]/members/[memberId]/timeout` — gövde `ServerMemberTimeoutSchema`.

- `until` ISO tarih → `communicationDisabledUntil` yazılır; `null` → kaldırılır.
- Yetki: `TIMEOUT_MEMBERS` (mevcut anahtar). Sahip her zaman yetkili.
- **Sahip zaman aşımına alınamaz** (`400`); kendine zaman aşımı yok (`400`).
- Audit log satırı + authorization revision artışı (mevcut yardımcılar).
- Süre dolduğunda ayrı bir iş (cron) yazılmaz — okuma tarafı `until > now()` karşılaştırmasıyla
  değerlendirir.

## 3. Ban ucu tamamlama

- `POST .../bans` gövdesi `ServerBanSchema` (`reason`, `deleteMessageSeconds`) ile hizalanır.
- Yetki `BAN_MEMBERS`; sahip banlanamaz (`400`).
- Ban atıldığında üyelik kaldırılır (mevcut servis davranışı korunur), üye sayacı güncellenir
  (`server-member-counter.ts`).
- `DELETE .../bans/[userId]` = ban kaldırma; yetki aynı.
- `GET .../bans` sayfalı liste döndürür (kullanıcı, sebep, kim, ne zaman).

## 4. Mesaj gönderme kapısı

`channel-message-send-service.ts`:

- `communicationDisabledUntil > now()` olan üye mesaj gönderemez; mevcut yetki hatası ailesinden
  yanıt döner. Yeni hata kodu üretilmez.
- Ses tarafında konuşma kısıtı bu pakette **kapsam dışı** (rapora not düşülür).

## 5. Üye listesi sözleşmesi (SPEC §8.6)

- `GET /api/v1/servers/[serverId]/members` sorgu parametreleri:
  `q` (ad veya kullanıcı adı), `filter` (`all|member|moderator|admin|owner|online|offline`).
- Rol filtreleri **atanmış role**, `online|offline` **presence**'a bakar (SPEC).
- Yanıt `N / toplam` sayacı için filtrelenmiş **ve** toplam sayıyı taşır.
- `WorkspaceMember` artık `communicationDisabledUntil` alanını taşır (Ş0).
- Sahibin çıkarılamayacağı sunucu tarafında da doğrulanır (`400`), yalnız UI'da pasif değil.

## 6. İstemci yardımcıları

`lib/workspace/client.ts`: `banServerMember`, `unbanServerMember`, `timeoutServerMember`,
`fetchServerBans`, `fetchServerMembers({ q, filter })`.

## 7. Mobil (K10)

- Mobil üye sözleşmesine `communicationDisabledUntil` **opsiyonel** eklenir.
- Mobil ekranlar değişmez.

---

## Sınırlar

- UI yok.
- Mevcut ban servisinin çalışan davranışı yeniden yazılmaz.
- Ses kanalında susturma/çıkarma bu şeritte yok.

---

## Kabul kriterleri

- [ ] Zaman aşımı ucu: yetkisiz `403`, sahip hedefi `400`, kendine `400`, başarılıda kolon yazılıyor
      ve `null` ile kalkıyor.
- [ ] Ban/ban kaldırma sözleşmesi `ServerBanSchema` ile hizalı; sahip banlanamıyor; üye sayacı doğru.
- [ ] Zaman aşımlı üye mesaj gönderemiyor (testli).
- [ ] `q` + 7 filtre sunucu tarafında süzüyor; yanıt filtreli ve toplam sayıyı taşıyor.
- [ ] Audit log ve authorization revision her iki eylemde de yazılıyor.
- [ ] `route-contract.test.ts` yeni uçları tanıyor; typecheck/lint/test yeşil.

## Rapor

`raporlar/s2-uye-moderasyon.md` — mevcut ban yüzeyi envanteri **mutlaka** girer.
