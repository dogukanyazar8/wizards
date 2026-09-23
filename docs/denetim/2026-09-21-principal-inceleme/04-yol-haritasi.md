# Yol haritası — 2026-09-21

İlke: küçük, bağımsız teslimatlar; yeni bağımlılık/servis yok; her iş ölçülebilir kabul kriteriyle kapanır. Efor = tek geliştirici, test dahil.

## Dalga 1 — Önce (1–2 hafta)

| #   | İş                                                                                                                                                                                       | Bulgu | Kullanıcı etkisi                                           | Risk                                                   | Efor               | Bağımlılık               | Kabul kriteri                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Web/masaüstü soket toparlanması: `io server disconnect` → jitter'lı `connect()`; `reconnectionAttempts` sınırsız; `online`/`visibilitychange` tetikleyicisi; `drain.ts` yorum düzeltmesi | F-01  | Deploy sonrası herkes çevrimdışı kalmaz                    | Düşük (fırtına → #3 ile sınırla)                       | 0.5–1 gün          | —                        | Birim test + Playwright drain senaryosu: p95 ≤10 sn yeniden bağlanma; UAT deploy sonrası aktif soket sayısı ≤2 dk'da eski seviyede (B1) |
| 2   | Reconnect'te gap senkronu: ilk bağlantı hariç `connect`'te aktif mesaj + unread/sunucu listesi sorgularını geçersizle                                                                    | F-02  | Kaçırılan mesajlar görünür                                 | Düşük (kısa refetch patlaması)                         | 0.5 gün            | #1 (bağımsız da çalışır) | E2E: çevrimdışı A, B 3 mesaj, A dönünce ≤3 sn'de görünür (B2)                                                                           |
| 3   | Revalidasyon toleransı: ≥3 ardışık hata sonrası kopar, metrik/log                                                                                                                        | F-04  | Tek DB hıçkırığı herkesi atmaz                             | Düşük (≤90 sn bayat oturum; anlık iptal yolu değişmez) | 2–4 saat           | —                        | Birim test: 1 hata → kopma yok, 3 hata → kopma                                                                                          |
| 4   | Gönderim ack + zaman aşımı + nonce'lu hata korelasyonu (web kanal, DM, thread, mention yanıtı)                                                                                           | F-03  | "Gönderiliyor"da takılma biter, doğru balon başarısız olur | Düşük                                                  | 0.5–1 gün          | —                        | Birim test: eşzamanlı 2 gönderim, yalnız reddedilen nonce `failed`; bağlantısız 10 sn → `failed` + tekrar dene metni korunur            |
| 5   | Admin sayfalarında önce yetki, sonra veri; `/admin`'i `isProtectedRoute`'a ekle                                                                                                          | F-05  | Anonim DB amplifikasyonu kapanır                           | Çok düşük                                              | 2–4 saat           | —                        | 15 sayfa için test: yetki reddinde yükleyici çağrılmaz; `next build` log'unda admin `prisma:error` yok                                  |
| 6   | `main` koruması: ruleset + required `Verify`; gece kırmızısı bildirimi; CI E2E env'ine test e-posta ayarı; server-parity Ş4 kırığını kapat                                               | F-06  | Kırık kodun main'e girmesi engellenir                      | Düşük (acil düzeltme için admin bypass)                | 0.5 gün + kırıklar | —                        | Protection API 200 + required context; 3 ardışık gece yeşil                                                                             |

## Dalga 2 — Sonra (2–6 hafta)

| #   | İş                                                                                 | Bulgu      | Etki                                | Risk                                 | Efor              | Bağımlılık     | Kabul                                                                         |
| --- | ---------------------------------------------------------------------------------- | ---------- | ----------------------------------- | ------------------------------------ | ----------------- | -------------- | ----------------------------------------------------------------------------- |
| 7   | Stable halkada Windows imzasını zorunlu kıl (OV/EV veya Azure Trusted Signing)     | F-07       | SmartScreen güveni                  | Sertifika tedarik süresi             | 0.5 gün + tedarik | —              | `Get-AuthenticodeSignature` Valid; imzasız stable release fail                |
| 8   | Bundle bütçe testi (manifest okuyan betik, CI'da)                                  | F-08       | Gerilemeyi durdurur                 | Düşük                                | 0.5 gün           | —              | CI'da rota bazlı gz bütçe; aşım fail                                          |
| 9   | `livekit-client`'ı ses katılımına kadar lazy yükle                                 | F-08       | Ses dışı rotalarda ~139 KB gz az JS | Orta (voice provider büyük; önce #8) | 1–2 gün           | #8             | `/home` ve sohbet rotasında livekit chunk yok; ses katılım p95 (B7) gerilemez |
| 10  | İstemci zod'unu azalt (kök bundle)                                                 | F-08       | Her sayfada ~89 KB gz'e kadar       | Orta                                 | 1 gün             | #8             | Kök bundle gz düşer; sözleşme testleri yeşil                                  |
| 11  | Tek `fanOutChannelMessage()` servisi (socket + REST)                               | F-09       | İzin filtresi sapması riski biter   | Düşük                                | 0.5–1 gün         | —              | Tek tanım; iki yol aynı fixture testini geçer                                 |
| 12  | LiveKit `canPublishData:false`; masaüstü dev capability ayrımı                     | F-12, F-13 | En az yetki                         | Çok düşük                            | 0.5 gün           | —              | Token grant testi; prod capability'de localhost yok                           |
| 13  | Outbox heartbeat'i başarılı drain'e bağla; `oldestPendingAgeMs` alarmı             | F-14       | Takılı kuyruk görünür               | Düşük                                | 2–4 saat          | Sentry erişimi | Drain durdurulunca check-in "missed" olur                                     |
| 14  | Web süreç kapanışı: `httpServer.close()` + worker stop + `prepare()` catch         | F-15       | Deploy'da kesik istek azalır        | Düşük                                | 2–4 saat          | #1             | SIGTERM testinde uçuştaki istek tamamlanır                                    |
| 15  | Hijyen: `next-env.d.ts` gitignore, JSON EOL normalizasyonu, jest `act()` uyarıları | F-17       | Gürültüsüz diff/test                | Çok düşük                            | 0.5 gün           | —              | WIP diff'te EOL-only değişiklik yok; jest uyarısı 0                           |

## Dalga 3 — Ertelenen / ölçüme bağlı

| İş                                                                 | Tetikleyici                                          | Not                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------- |
| Fan-out optimizasyonu (unread güncellemesini birleştirme/debounce) | B4'te p95 fan-out veya DB CPU eşiği aşılırsa         | F-10; pasif oturum benzeri basit sürüm        |
| Türkçe arama config + DM trgm indeksi                              | B9 p95 > hedef veya kullanıcı şikâyeti               | F-11                                          |
| Basit AutoMod (kelime listesi + mention limiti)                    | Topluluk büyüklüğü/raid olayları                     | Rakip §1.5; #11 sonrası gönderim yoluna       |
| Ses kalite göstergesi                                              | Destek talepleri                                     | LiveKit ConnectionQuality                     |
| DM aramalarında medya E2EE pilotu                                  | Gizlilik konumlandırması kararı                      | Özellik takası (kayıt/moderasyon) ürün kararı |
| `live-voice-provider.tsx` / `lib.rs` parçalama                     | Dokunulan her değişiklikte fırsatçı                  | Yeniden yazım yok                             |
| Import döngülerini kırma                                           | Başlatma sırası hatası görülürse veya dokunulduğunda | `extractUploadThingFileKey` saf modüle        |

## Korunması gereken kararlar

- Mesaj olaylarının kanal odası yerine gönderim anında izin filtreli `user:` odalarına yayılması.
- `auth-session` odasıyla anlık, cluster-genel oturum iptali.
- Nonce + `strict-dynamic` CSP, CSRF origin kontrolü, E2E uçlarının 4 katmanlı kilidi.
- Link önizlemede DNS pinleme + yönlendirme yeniden doğrulaması.
- Postgres outbox (`SKIP LOCKED`, dead-letter) ve ayrı worker servisi.
- `route.ts` ince + DI'li `route-logic` deseni; `clientNonce` ile idempotent gönderim.
- SHA-pinli CI action'ları, en az yetki izinleri, secret/SAST/audit kapıları.
- Mobil SecureStore, deep link savunmacı ayrıştırma, UAT-only otomasyon.
- Tauri navigasyon/origin guard'ları ve updater imzası.

## Önerilmeyenler (ve neden)

| Öneri                                              | Neden hayır                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Mikroservislere bölme                              | Sorunlar sınır değil, istemci sözleşmesi ve sıralama; monolit + ayrı worker yeterli. |
| ScyllaDB/Cassandra, Elasticsearch, Kafka           | Ölçek kanıtı yok; Postgres + mevcut indeksler ölçülmeden değiştirilmez.              |
| Sıra numaralı olay replay'i (Discord Resume klonu) | Reconnect'te delta refetch aynı kullanıcı sonucunu çok daha ucuza verir.             |
| Kendi SFU                                          | LiveKit yeterli; ekip maliyeti yüksek.                                               |
| Socket.IO'dan başka taşıyıcıya geçiş               | Kusur kütüphanede değil, istemci kullanımında.                                       |
| Next.js/React Native framework değişimi            | Kanıt yok; bundle sorunu yapılandırma/lazy yükleme ile çözülür.                      |
| Yeni cache katmanı                                 | Mevcut Redis izin cache + revizyon modeli yeterli; önce ölçüm.                       |
| Bot platformu / EKM / SAML                         | Hedef kitle ve güvenlik yüzeyiyle orantısız (şimdilik).                              |
