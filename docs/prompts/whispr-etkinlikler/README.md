# Whispr "Etkinlikler" ekranı — paralel run-prompt paketi (4B · Takvim şeridi)

Whispr **web + masaüstü** uygulamasının dördüncü büyük ekranı: akış başlığı, gezinilebilir hafta
şeridi, gün gruplu etkinlik ızgarası, 300 px "Bugün" ajanda rayı, 326 px etkinlik detay paneli,
560 px etkinlik oluştur modalı, filtre şeridi, RSVP onay şeridi, boş ve hata durumu.
Toplam **11 durum** (`screens/01…11`).

Tasarım kaynağı (nihai otorite sırasıyla):

1. `design_handoff/etkinlikler-paketi/referans/Etkinlikler-4B.dc.html` — her elemanın inline `style` değeri **ve** örnek veri modeli
2. `design_handoff/etkinlikler-paketi/referans/Etkinlikler-referans.html` — çalışan, tıklanabilir kopya (10 durum + tema + 5 çözünürlük)
3. `design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md` — ölçü, metin, durum, veri, i18n, bileşen eşlemesi
4. `design_handoff/etkinlikler-paketi/screens/*.png` — 11 ekran, 1360×920
5. `design_handoff/etkinlikler-paketi/SPEC-ANA-SAYFA.md` §1 (token/tipografi) ve §8 (ölçekleme)

Görev tanımı: `design_handoff/etkinlikler-paketi/PROMPT.md`.
Uygulama planı ve karar gerekçeleri: `PLAN.md` (bu klasör).

## Bu paket neden Bahsedilmeler'den farklı

Bahsedilmeler paketinde **dört türden üçünün üründe karşılığı yoktu** — yazma yolu sıfırdan
kuruldu. Etkinlikler'de yazma yolu var ama **dar**: `ScheduledEvent` modeli yıllardır şemada
duruyor, üzerine ikili bir "ilgi" satırı ve sunucu içi bir CRUD ucu yazılmış. Tasarımın istediği
şey o modelin **genişlemiş** hâli.

| Tasarım                                                  | Bugünkü ürün                                       | Sonuç                                      |
| -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| RSVP `going` / `maybe` / yok                             | `ScheduledEventInterest` — ikili ilgi              | `status` enum eklenir (K1)                 |
| 6 sunum türü (sesli/toplantı/oyun/canlı/topluluk/atölye) | `entityType` — 3 teknik tür (STAGE/VOICE/EXTERNAL) | Yeni `kind` kolonu (K2)                    |
| Herkese açık topluluk etkinliği                          | **Yok**; her etkinlik bir sunucuya kapalı          | `isPublic` bayrağı (K3)                    |
| Hatırlatma (`Başlamadan 10 dk önce`)                     | **Yok**                                            | `ScheduledEventReminder` + outbox işi (K5) |
| Tekrar (`Her çarşamba`)                                  | **Yok**                                            | `recurrenceRule` kolonu, üretici yok (K6)  |
| Takvime ekle                                             | **Yok**                                            | `.ics` indirmesi (K7)                      |
| Canlı etkinlik                                           | `status = ACTIVE` **var** ama kimse yazmıyor       | Ses odası yaşam döngüsüne bağlanır (Ş3)    |

Ayrıca bugünkü `/events` rotası **başka bir ekran**: Ana Sayfa Faz 6'nın liste + ay takvimi
görünümü. Bu paket onu değiştirmez — **siler** ve yerine 4B ekranını koyar.

## Dalga yapısı

Yöntem Bahsedilmeler paketiyle aynı: **sözleşme önce donar, sonra şeritler birbirinin dosyasına
dokunmadan aynı anda ilerler.** Her şerit dosyasının §"Sahiplenilen dosyalar" bölümü bağlayıcıdır.

```
Dalga 0  ─┬─ Ş0.1 @wizards/types sözleşmesi (tip + zod + ton/glif haritası)
          ├─ Ş0.2 migration + Prisma şeması (kind, isPublic, rsvp status, reminder, recurrence)
          ├─ Ş0.3 ölçü sözlüğü + parity kapısı (metrics.ts + parity.test.ts)
          ├─ Ş0.4 URL durum sözleşmesi (routes.ts)
          ├─ Ş0.5 i18n events.* sözlüğü (TR birebir + EN)
          └─ Ş0.6 MANAGE_EVENTS yetki biti              ← kapı: typecheck + test + db:generate

Dalga 1  ─┬─ Ş1 okuma servisi + GET /api/v1/events + sayaçlar + hafta noktaları
          ├─ Ş2 detay ucu + katılımcı rolleri + hatırlatma okuması
          ├─ Ş3 yazma: POST /events, PUT /rsvp, PUT /reminder, .ics, outbox zamanlayıcı, canlı
          └─ Ş4 socket olayları + realtime yamacı + nav ipucu tek kaynağa   ← kapı: şerit testleri

Dalga 2  ─┬─ Ş5 sayfa iskeleti + akış başlığı + hafta şeridi + URL durumu
          ├─ Ş6 EventCard + ızgara + gün grupları + skeleton + boş/hata
          ├─ Ş7 ajanda rayı (300) + detay paneli (326)
          └─ Ş8 oluştur modalı (560) + filtre şeridi + RSVP onay şeridi   ← kapı: şerit testleri

Dalga 3  ─┬─ Ş9 a11y + klavye + ölçek adımları + kırılımlar
          └─ Ş10 eski ekran temizliği + parity kapısı + e2e + kabul
```

## Dosyalar

| Dosya                                         | Kapsam                                                                                             | Ön koşul                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| `PLAN.md`                                     | Genel plan, 12 karar, riskler, ölçü sözlüğü taslağı. **Uygulanmaz, okunur.**                       | —                       |
| `00-ortak-baglam.md`                          | Kurallar, doğrulanmış gerçekler, 12 karar, 10 tuzak, kalite çıtası. **Uygulanmaz, okunur.**        | —                       |
| `01-dalga0-sozlesme.md`                       | 6 alt şerit: tipler, migration, ölçü sözlüğü, rota, i18n, yetki                                    | —                       |
| `02-dalga1-s1-okuma-api-sayac.md`             | `GET /api/v1/events`, birleşik sorgu, sayaçlar, `weekDots`, sayfalama                              | Dalga 0                 |
| `03-dalga1-s2-detay-uc-katilimcilar.md`       | `GET /events/[eventId]`, katılımcı rolleri, `listening`, hatırlatma okuması                        | Dalga 0                 |
| `04-dalga1-s3-yazma-rsvp-hatirlatma-ics.md`   | `POST /events`, `PUT /rsvp`, `PUT /reminder`, `.ics`, outbox, canlı geçişi, `MANAGE_EVENTS` kapısı | Dalga 0                 |
| `05-dalga1-s4-socket-realtime-nav-ipucu.md`   | 5 socket olayı, cache yaması, nav paneli saat ipucu + canlı noktası                                | Dalga 0                 |
| `06-dalga2-s5-iskelet-baslik-hafta-seridi.md` | `EventsPage`, akış başlığı, daralma kuralı, hafta şeridi, URL durumu                               | Dalga 0 (Ş1 sözleşmesi) |
| `07-dalga2-s6-kart-izgara-bos-hata.md`        | `EventCard`, ızgara + gün grupları, skeleton, boş ve hata durumu                                   | Dalga 0                 |
| `08-dalga2-s7-ajanda-rayi-detay-paneli.md`    | `EventAgendaRail` (300), `EventDetailPanel` (326), zaman çizelgesi, rol pilleri                    | Dalga 0 (Ş2 sözleşmesi) |
| `09-dalga2-s8-modal-filtre-rsvp-seridi.md`    | `EventCreateModal` (560), yer seçici, filtre şeridi, RSVP onay şeridi                              | Dalga 0 (Ş3 sözleşmesi) |
| `10-dalga3-s9-a11y-olcek-kirilim.md`          | Klavye gezinme, focus merdiveni, ölçek adımları, `<1100/<960/<720` kırılımları                     | Dalga 2                 |
| `11-dalga3-s10-temizlik-parity-qa.md`         | Eski ekranın kaldırılması, parity kapısı, 4 çözünürlük × 2 tema, e2e, kabul                        | Ş9                      |
| `BASLATMA-PROMPTLARI.md`                      | Her şerit için kopyalanabilir başlatma metni                                                       | —                       |

## Nasıl koşulur

Her şerit tek geçişte uygulanabilir bir dilimdir.

```
1. 00-ortak-baglam.md oku
2. Şerit dosyasını oku
3. graphify query "<şeridin yüzeyi>" ile dokunulacak dosyaları doğrula
4. Uygula (test önce)
5. Şeridin kapı komutlarını koş
6. docs/prompts/whispr-etkinlikler/raporlar/<no>-rapor.md yaz
7. Commit için izin iste — kendiliğinden commit yok
```

Aynı dalganın şeritleri **aynı anda** açılabilir. Farklı dalgalar açılmaz: Dalga 1 başlamadan
Dalga 0 kapısı yeşil olmalı, Dalga 2 başlamadan Dalga 1 kapısı.

Branch: `uat`. Commit yok — kullanıcı açıkça isteyene kadar.
