# Denetim 2026-08 kapatma paketi

Kaynak: `docs/denetim/2026-08-12-platform-denetimi.md` — 147 benzersiz bulgu (41 HIGH, 71 MED, 35 LOW).

**Her prompt önce `00-ortak-baglam.md` okur.** Branch `uat`, commit yok, caveman ultra, SOLID ölçüsünde, over-engineering yasak.

## Prompt listesi

| #   | Dosya                                | Kapsam                                                                                        | Bulgu | Efor |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------- | ----- | ---- |
| 00  | `00-ortak-baglam.md`                 | Çalışma kuralları, ilkeler, doğrulama komutları, repo sözleşmeleri                            | —     | —    |
| 01  | `01-web-oturum-iptali.md`            | `iat` kayması, mobil iptal, yönlendirme kilidi, `Session` süpürme                             | 4     | S    |
| 02  | `02-web-kimlik-yuzeyi.md`            | OAuth 2FA baypası, parola oracle'ı, hesap varlık oracle'ı, Turnstile                          | 5     | S/M  |
| 03  | `03-web-sizinti-ve-kenar.md`         | Sentry sızıntısı, `x-real-ip` güveni, admin XSS, CSRF, reauth URL                             | 5     | S/M  |
| 04  | `04-ses-ve-livekit-yetkisi.md`       | Yetkisi düşen/atılan/çıkarılan kullanıcı ses yüzeyinde kalıyor, metadata taklidi              | 5     | S/M  |
| 05  | `05-yetki-kapilari.md`               | Admin pano sızıntısı, moderatör kick, iki izin listesi, cache damgası, reaksiyon              | 5     | S/M  |
| 06  | `06-dm-grup-yetki-ve-dto.md`         | Yayın DTO'su, katılımcı sayaçları, üyelik yarışı, `delivered` yetkisi, engel kapısı           | 7     | S/M  |
| 07  | `07-mobil-oturum-guvenligi.md`       | Deep link `state`, app lock, çıkış yarışı, ortam fallback'i                                   | 8     | S/M  |
| 08  | `08-veri-butunlugu-kritik.md`        | Kaybolan mesajlar, karantina sırası, link preview, bakım bloğu, outbox lease, cursor          | 6     | S/M  |
| 09  | `09-sayaclar-ve-bildirimler.md`      | `mentionCount`, toplu sıfırlama, `markRead` yarışı, temizle rotası, FEEDBACK, push            | 7     | S    |
| 10  | `10-arka-plan-isleri-ve-gizlilik.md` | Telemetri rollup, hesap silme sırası, push token, rapor temizliği, rozet sweep'leri, kampanya | 7     | S/M  |
| 11  | `11-moderasyon-ve-denetim-izi.md`    | Vaka durum makinesi, vaka dosyası sınırı, sunucu `AuditLog`                                   | 4     | S/L  |
| 12  | `12-veritabani-indeksleri.md`        | 8 eksik + 2 trigram indeks, 9 gereksiz indeks, cascade, migration dizinleri                   | 12    | S    |
| 13  | `13-sunucu-sicak-yollar.md`          | `fetchSockets`, presence fan-out, 8 eksik rate limit, bootstrap memo                          | 10    | S/M  |
| 14  | `14-sunucu-sorgu-maliyeti.md`        | 10 sınırsız okuma, 10 seri tur, outbox payload'ı                                              | 21    | S/M  |
| 15  | `15-web-istemci-render.md`           | Ölü memo'lar, kaçan `queryKey`, scroll geçişleri, cache yeniden inşası                        | 8     | S    |
| 16  | `16-web-sanallastirma-ve-paket.md`   | Mesaj dökümü sanallaştırma, LiveKit paket bölme                                               | 3     | L    |
| 17  | `17-mobil-provider-kimlik.md`        | Realtime/ses/push provider kimlik kaçakları, overlay registry                                 | 6     | S/M  |
| 18  | `18-mobil-liste-render.md`           | 11 kimlik kaçağı, 5 sanallaştırılmayan liste, 4 gereksiz tick                                 | 20    | S/M  |
| 19  | `19-mobil-realtime-invalidasyon.md`  | Presence invalidasyonu, `delivered` bootstrap'i, ölü anahtar, teardown yarışı, cache şekli    | 8     | S    |
| 20  | `20-mobil-medya-yasam-dongusu.md`    | Arka plan tick'leri, watchdog eksikleri, dosya sızıntıları, decode eşzamanlılığı              | 11    | S/M  |
| 21  | `21-mobil-hata-yuzeyi-ve-durum.md`   | Sessiz mutasyon hataları, form ezilmesi, retry çoğaltması, refetch döngüsü                    | 11    | S    |

## Sıra

```
Güvenlik      01 → 02 → 03 → 04 → 05 → 06 → 07
Veri          08 → 09 → 10 → 11
Şema          12
Sunucu perf   13 → 14
Web istemci   15 → 16
Mobil istemci 17 → 18 → 19 → 20
Kalite        21
```

Faz içi sıra bağlayıcı; fazlar arası paralel koşabilir. Her promptun başındaki "Ön koşul" satırı gerçek bağımlılığı söyler.

## Kullanıcı kararı bekleyen maddeler

Bu üç madde prompt içinde **soru olarak** duruyor, cevapsız uygulanmamalı:

1. **02** — `allowDangerousEmailAccountLinking` tamamen kapansın mı, yalnız 2FA'lı hesaplarda mı engellensin?
2. **06** — grup DM'de engellenen kişi mesajı görsün mü? (Engel kapısının grup semantiği.)
3. **11** — sunucu `AuditLog`: yazılsın mı (A, büyük iş) yoksa izin ve model kaldırılsın mı (B)?
4. **12** — `prisma/migrations` ve yedek dizini silinsin mi, arşive mi taşınsın?
5. **16** — mesaj dökümü sanallaştırılsın mı (A1) yoksa tutulan sayfa sınırlansın mı (A2)?

## Davranış değişikliği taşıyan maddeler

Bunlar performans düzeltmesi değil, ürün kararı — uygulayan prompt kullanıcıya bildirmeli:

- **13** — yazma göstergesi izin filtresinden geçmeyecek (düz kanal odasına emit).
- **16-A2** — düşürülen sayfa yukarı kaydırınca yeniden çekilecek.
- **02** — 2FA'lı hesapta "Google ile devam et" reddedilecek.
- **06** — grup gönderiminde engel kapısı gevşeyecek.
