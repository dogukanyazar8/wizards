# Başlatma promptları — Etkinlikler paketi (4B · Takvim şeridi)

Her şerit **ayrı bir Claude Code oturumunda** koşar. Aşağıdaki bloklardan birini olduğu gibi
yapıştır; oturum gerisini paket dosyalarından okur.

**Durum:** paket yazıldı, hiçbir şerit koşulmadı. Sıradaki: **Dalga 0**.

## Sıra ve eşzamanlılık

```
Dalga 0  Ş0.1…Ş0.6            tek oturum (altı alt şerit sırayla)
         ↓ kapı yeşil olmadan Dalga 1 açılmaz
Dalga 1  Ş1 · Ş2 · Ş3 · Ş4    dördü aynı anda
         ↓ dördü de yeşil olmadan Dalga 2 açılmaz
Dalga 2  Ş5 · Ş6 · Ş7 · Ş8    dördü aynı anda
         ↓
Dalga 3  Ş9                    tek oturum
         ↓
Dalga 3  Ş10                   tek oturum (temizlik + parity + QA)
```

**Aynı çalışma ağacında paralel koşmak güvenlidir**: şeritlerin `Sahiplenilen dosyalar`
kümeleri ayrıktır ve Dalga 0 sözleşmeyi dondurur. Bilinen temas noktaları — hepsi şerit
dosyasında yazılı:

- `apps/web/src/lib/events/client.ts` — Ş1 `eventsQueryKeys` + liste sorgusunu yazar ve
  dosyaya `// Ş2` ve `// Ş3` sınır yorumları bırakır; Ş2 detay, Ş3 yazma çağrılarını doldurur.
- `apps/web/src/app/api/v1/events/route.ts` — Ş1 `GET`, Ş3 `POST`. Aynı dosya, ayrı dışa
  aktarımlar; ikisi de `route-logic.ts` içinde kendi fonksiyonunu yazar.
- `components/events/event-kind-tile.tsx` + `event-source-tile.tsx` — Ş6 yazar, Ş7 ve Ş8
  kullanır. Ş6 bitmeden Ş7/Ş8 koşuyorsa `TODO(Ş6):` ile boş sarmalayıcı bırakılır, kopya
  bileşen **yazılmaz**.
- `lib/events/realtime.ts` yayıncıları — Ş4 tanımlar, Ş3 çağırır. Ş4 bitmediyse Ş3 çağrıyı
  `TODO(Ş4):` ile bırakır ve Dalga 2 başlamadan gerçek çağrıya döner.

Tam izolasyon istersen `git worktree`; birleştirme sırası Ş3 → Ş2 → Ş1 → Ş4 (en derin katman önce).

---

## Dalga 0 — Sözleşme katmanı

```
Whispr monorepo, branch `uat`. "Etkinlikler" ekranı paketi (4B · Takvim şeridi) — Dalga 0.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 12 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/PLAN.md §2, §3, §7 — kararların gerekçesi, şema, ölçü sözlüğü taslağı.
3. docs/prompts/whispr-etkinlikler/01-dalga0-sozlesme.md — bu dalganın altı alt şeridi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md — tamamı.
5. design_handoff/etkinlikler-paketi/SPEC-ANA-SAYFA.md §1 (token/tipografi) ve §8 (ölçekleme).

Bir ölçüden emin olmadığında NİHAİ OTORİTE design_handoff/etkinlikler-paketi/referans/Etkinlikler-4B.dc.html içindeki inline `style` değeridir. Tahmin etme, oradan oku.

Zaten hazır, yeniden yazma: --info token'ı (globals.css:37 `199 89% 48%`), pxToRem/pxToEm/hairline (lib/home/metrics.ts), useUiScale + lib/home/scale.ts (ölçek motoru), lib/home/density.ts (yoğunluk deseni), components/ui/* (avatar, badge, modal, input, toggle-switch, segmented-control, skeleton, toast), toast-provider.

Desen dosyaları (oku, kopyalama): lib/mentions/metrics.ts + parity.test.ts, lib/mentions/routes.ts, packages/types/src/mentions-screen.ts, packages/db/prisma/schema-mentions-screen.test.mjs.

Kurallar:
- Test önce yaz, kırmızı gör, sonra yeşile çevir.
- Sunucu METİN GÖNDERMEZ: sayı + enum gönderir, metni istemci i18n kurar (00-ortak-baglam §3.1).
- Ölçü sözlüğü RENK TAŞIMAZ. Ton token adıdır ("--warning"), renk değil.
- Migration packages/db/prisma/rebaseline-migrations altına — prisma/migrations DEĞİL.
- TR metinleri SPEC'ten birebir kopyalanır; yeniden yazma, kısaltma, "iyileştirme" yok.
- Mevcut 12 events.* anahtarını SİLME — eski ekran hâlâ ayakta, Ş10'da silinecek.
- COMMIT ATMA.

Kapı (hepsi yeşil olmalı):
pnpm --filter @wizards/db db:generate && pnpm --filter @wizards/db test
pnpm --filter @wizards/types test
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-etkinlikler/raporlar/01-dalga0-rapor.md yaz: ne landed, hangi sapma SPEC_DEVIATIONS'a girdi, hangi TODO(api): bırakıldı, kapı çıktısı.
```

---

## Dalga 1 · Ş1 — Okuma servisi, `GET /api/v1/events`, sayaçlar

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 1 / Şerit Ş1.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/01-dalga0-rapor.md — Dalga 0'da ne landed; hiçbirini tekrar yazma.
3. docs/prompts/whispr-etkinlikler/02-dalga1-s1-okuma-api-sayac.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §3.1, §3.2, §3.5, §8.

Dalga 0 hazır, yeniden yazma: packages/types events-screen (şemalar, ton/glif haritaları, eventsUiReducer), lib/events/metrics.ts, lib/events/routes.ts, tr.ts/en.ts events.* anahtarları, MANAGE_EVENTS biti, migration.

Kurallar:
- Test önce.
- İki dal (üyelik + isPublic) tek UNION — UNION ALL DEĞİL, çift satır üretir.
- Görünürlük sorgunun kendi süzgecidir, sonuca uygulanan kontrol değil.
- Sayaçlar FİLTRESİZ (tab dışında hiçbir süzgeç) — 00-ortak-baglam tuzak #3.
- dayBucket SUNUCUDA, izleyicinin saat diliminde hesaplanır; istemci tekrar hesaplamaz (tuzak #7).
- Arama sunucuda; istemci yüklenmiş sayfaları süzmez.
- Yanıtta görüntülenecek Türkçe metin YOK.
- lib/events/client.ts'e `// Ş2` ve `// Ş3` sınır yorumları bırak.
- EXPLAIN ANALYZE çıktısını rapora ekle; iki dalda da index scan olmalı.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/02-s1-rapor.md
```

---

## Dalga 1 · Ş2 — Detay ucu, katılımcı rolleri

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 1 / Şerit Ş2.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/01-dalga0-rapor.md
3. docs/prompts/whispr-etkinlikler/03-dalga1-s2-detay-uc-katilimcilar.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §5.
5. design_handoff/etkinlikler-paketi/screens/07-durum.png

Kurallar:
- Test önce.
- Görmediği etkinlikte 404 döner, 403 DEĞİL (403 varlığı sızdırır).
- Rol öncelik sırası attendee-roles.ts'te SAF fonksiyon: host > listening > going > maybe. Bir kişi tek satırda.
- SCHEDULED etkinlikte VoiceState sorgusu HİÇ açılmaz.
- CTA metni sunucudan gelmez: canJoinLive/joinHref/rsvp alanları döner, metni istemci kurar.
- joinHref sunucuda üretilir (kanal erişimi izleyiciye göre değişir).
- lib/events/client.ts'te yalnız `// Ş2` sınırı içindeki bölümü yaz.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/03-s2-rapor.md
```

---

## Dalga 1 · Ş3 — Yazma yolu: oluşturma, RSVP, hatırlatma, `.ics`, canlı

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 1 / Şerit Ş3. Bu paketin EN RİSKLİ şeridi.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — özellikle tuzak #2 ve #8.
2. docs/prompts/whispr-etkinlikler/raporlar/01-dalga0-rapor.md
3. docs/prompts/whispr-etkinlikler/04-dalga1-s3-yazma-rsvp-hatirlatma-ics.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §6, §7, §8.

İLK İŞ: interestedCount anlam kayması. K1 sayacın adını değil ANLAMINI daraltıyor (ilgili → going). Üç tüketici var (lib/home/events-service.ts, lib/servers/server-public-profile-service.ts, api/v1/mobile/servers/[serverId]/events/*). Üçünü de tek tek doğrula ve lib/events/count-contract.test.ts ile literal beklentiyle kilitle. Bunu yapmadan başka bir şeye geçme.

Kurallar:
- Test önce.
- RSVP gövdesi HEDEF DURUM taşır ({rsvp: "going"|"maybe"|null}), toggle değil.
- Sayaç deltaları yalnız satır gerçekten değiştiyse oynar; hepsi tek transaction.
- availableAt <= now ise hatırlatma işi YAZILMAZ (tuzak #8), yanıt scheduled:false taşır.
- idempotencyKey startsAt taşır: saat değişince yeni anahtar, eskiler CANCELLED.
- eventNotifications=false kullanıcı için hiç iş yazılmaz.
- POST /events ensureEventPermission ister; tür ↔ kanal kuralı (K10) ihlalinde 422.
- isPublic yalnız COMMUNITY sunucuda kabul edilir.
- .ics: CRLF satır sonu, UTC DTSTART, katlama OKTET üzerinden (Türkçe karakter 2 oktet).
- Canlı geçişleri idempotent (updateMany + where status).
- Fan-out senkron değil, outbox üzerinden.
- Mobil sözleşmesi KIRILMAZ (K12): interested boolean türetilmiş alan olarak kalır.
- realtime yayıncıları Ş4'ün; hazır değilse TODO(Ş4): ile bırak.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/04-s3-rapor.md
```

---

## Dalga 1 · Ş4 — Socket olayları, realtime yaması, nav ipucu

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 1 / Şerit Ş4.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — özellikle tuzak #4.
2. docs/prompts/whispr-etkinlikler/raporlar/01-dalga0-rapor.md
3. docs/prompts/whispr-etkinlikler/05-dalga1-s4-socket-realtime-nav-ipucu.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §2 ve §8 (socket satırı).

KAPSAM SINIRI: apps/web/src/components/shell/app-nav-panel.tsx dosyasında YALNIZ `events` satırının ipucu bloğuna dokun. Başka hiçbir satırına, hiçbir sunucu rayı/kullanıcı barı dosyasına dokunma. Diff bunu göstermeli.

Kurallar:
- Test önce.
- Liste YENİDEN ÇEKİLMEZ, cache yamalanır. Yama fonksiyonları saf: (pages, payload) => pages, React'sız test edilir.
- event:created listeyi yeniden sıralamaz — kaydırma konumu bozulur. Yalnız sayaçları geçersiz kılar.
- Açık olan BÜTÜN liste anahtarları yamanır (setQueriesData önek eşleşmesi), yalnız aktif olan değil.
- /events rotasındayken saat ipucu İKİNCİ İSTEK ÇIKARMAZ — mevcut liste yanıtının counts bloğunu yeniden kullanır. Test bunu fetch sayımıyla doğrular.
- Hata durumunda ipucu render EDİLMEZ.
- Canlı noktası aria-hidden; canlı bilgisi satırın aria-label'ında METİN olarak.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/05-s4-rapor.md
```

---

## Dalga 2 · Ş5 — Sayfa iskeleti, akış başlığı, hafta şeridi

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 2 / Şerit Ş5. Ekranın DURUM SAHİBİ.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/ altındaki Dalga 0 ve Dalga 1 raporları.
3. docs/prompts/whispr-etkinlikler/06-dalga2-s5-iskelet-baslik-hafta-seridi.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §1, §3.1, §3.2, §7.
5. design_handoff/etkinlikler-paketi/screens/01-durum.png, 02, 04, 05, 07 (daralma kuralı), 11 (aydınlık).

Desen dosyası (oku, kopyalama): apps/web/src/components/mentions/mentions-page.tsx — URL durum sahibi + dört slot yerleşimi + Esc merdiveni + ilkel bağımlılık kuralı.

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Etkinlikler-4B.dc.html inline `style` değeridir.

Kurallar:
- Test önce.
- Tek doğruluk kaynağı URL. Filtre replace, panel/modal push.
- Detay paneli açıkken sekme grubu VE ikon grubu display:none (SPEC §3.1 zorunlu daralma kuralı).
- 432 px'de başlık tek satır; sarma YASAK.
- Hafta okları HAFTA adımlar (K9); etiket görünen haftanın ayı, ay sınırında "Ağu – Eyl 2026".
- Ölçüler yalnız lib/events/metrics.ts'ten pxToRem/hairline ile; arbitrary px YASAK.
- Metin yalnız t("events.*") ile; yeni anahtar uydurma — hepsi Dalga 0'da yazıldı.
- Sol taraf DEĞİŞMEZ.
- useInfiniteQuery bağımlılıkları İLKEL olmalı (tuzak #12) yoksa her render bir sayfa daha çeker.
- Diğer üç yüzeyi SLOT olarak yerleştir, içlerini çizme.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/06-s5-rapor.md
```

---

## Dalga 2 · Ş6 — `EventCard`, ızgara, gün grupları, boş/hata

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 2 / Şerit Ş6.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/ altındaki Dalga 0 ve Dalga 1 raporları.
3. docs/prompts/whispr-etkinlikler/07-dalga2-s6-kart-izgara-bos-hata.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §3.5, §3.6, §3.7, §3.8.
5. design_handoff/etkinlikler-paketi/screens/01-durum.png, 03, 06, 09, 10, 11.

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Etkinlikler-4B.dc.html inline `style` değeridir. Kartın her satırı orada.

Kurallar:
- Test önce.
- KARTTA ÜÇ NOKTA MENÜSÜ YOK. Eylem satırında yalnız Katıl ve Belki.
- Kart <article>; başlık bir <button> içinde (klavye hedefi tek); Katıl/Belki gerçek <button>.
- Ton token adından gelir (EVENT_KIND_TONE), renk yazılmaz. Hiçbir hex yok (#fff hariç).
- Renk tek başına anlam taşımaz: tür pili metnini, canlı pili "Canlı" metnini taşır.
- viewerIsMember=false && isPublic → kaynak tile yuvarlak (%50) + TK.
- Izgara --e-min CSS değişkeniyle 280 ↔ 340; kart boyutu değişince yalnız değişken oynar.
- Boş grup render edilmez. past kovası ızgarada çizilmez (sapma #5).
- Boş ve hata metinleri SPEC ile KARAKTER KARAKTER aynı; literal test yaz.
- İyimser güncelleme: kart kendi durumunu hemen değiştirir, hata olursa geri alır. Sayaç/ray Ş5'in işi.
- Ölçüler yalnız metrics.ts'ten; arbitrary px YASAK.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/07-s6-rapor.md
```

---

## Dalga 2 · Ş7 — Ajanda rayı (300) + detay paneli (326)

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 2 / Şerit Ş7.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/ altındaki Dalga 0 ve Dalga 1 raporları.
3. docs/prompts/whispr-etkinlikler/08-dalga2-s7-ajanda-rayi-detay-paneli.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §4, §5.
5. design_handoff/etkinlikler-paketi/screens/01-durum.png (ray), 07-durum.png (panel), 11 (aydınlık).

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Etkinlikler-4B.dc.html inline `style` değeridir. Not: detay paneli zemini --surface-panel'dir (HTML :483), --surface-card DEĞİL.

Kurallar:
- Test önce.
- Ray ve panel AYNI ANDA görünmez; panel açılınca ray unmount olur (ternary, hidden değil).
- Ray listesi ekran filtrelerinden BAĞIMSIZ (serverId/q/tab uygulanmaz) — ray gündelik özet.
- "Katılacağım" bölümü bugüne sınırlı DEĞİL.
- CTA metni Ş2'nin üç alanından kurulur; sunucudan metin gelmez.
- Panel KENDİ Esc dinleyicisini kurmaz — merdiven Ş5'te.
- Panel açılışında focus kapatma butonunda, kapanışta tetikleyici karta/ray satırına döner.
- Hatırlatma şeridi üç özel durum taşır: reminderSuppressed, scheduled:false, going değilse çizilmez.
- event-kind-tile / event-source-tile Ş6'nın; KOPYALAMA — hazır değilse TODO(Ş6): sarmalayıcı bırak.
- Ölçüler yalnız metrics.ts'ten; arbitrary px YASAK.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/08-s7-rapor.md
```

---

## Dalga 2 · Ş8 — Oluştur modalı (560), filtre şeridi, RSVP şeridi

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 2 / Şerit Ş8.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/ altındaki Dalga 0 ve Dalga 1 raporları.
3. docs/prompts/whispr-etkinlikler/09-dalga2-s8-modal-filtre-rsvp-seridi.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §3.3, §3.4, §6.
5. design_handoff/etkinlikler-paketi/screens/03-durum.png (filtre), 06-durum.png (RSVP), 08-durum.png (modal).

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Etkinlikler-4B.dc.html inline `style` değeridir.

Kurallar:
- Test önce.
- MODALDA TEKRAR ALANI YOK (K6) — alt metnin kendisi bunu söylüyor.
- Yer seçici türe göre süzülür (K10); tür değişince uyumsuz kanal TEMİZLENİR ve uyarı çıkar.
- create-form.ts SAF: alan durumu, süzme, doğrulama, CreateEventInput üretimi. Modal yalnız çizer.
- "Topluluk keşfetinde listele" yalnız COMMUNITY sunucuda etkin.
- Filtre şeridi yalnız aktif filtre varken. Çip sırası: zaman → kaynak → katılım → arama. Sekme çip ÜRETMEZ.
- RSVP şeridi {n} değerini GERÇEK hatırlatma tercihinden okur; sabit 10 yazma.
- scheduled:false ise hatırlatma cümlesi yazılmaz.
- Şerit role="status" + aria-live="polite"; 8 saniyede kapanır; ikinci yanıtta yeniden açılır.
- Modal components/ui/modal üzerine kurulur; kendi focus tuzağını yazma.
- Ölçüler yalnız metrics.ts'ten; arbitrary px YASAK.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/09-s8-rapor.md
```

---

## Dalga 3 · Ş9 — Klavye, a11y, ölçek, kırılımlar

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 3 / Şerit Ş9.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/ altındaki bütün raporlar.
3. docs/prompts/whispr-etkinlikler/10-dalga3-s9-a11y-olcek-kirilim.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/SPEC-ETKINLIKLER.md §7, §11.
5. design_handoff/etkinlikler-paketi/SPEC-ANA-SAYFA.md §8 — tamamı.

Kurallar:
- Test önce.
- keyboard.ts SAF: (items, cursorId, columns, key) => nextCursorId. React yok, DOM yok.
- Kolon sayısı ÖLÇÜLÜR (ResizeObserver + offsetTop), tahmin edilmez (tuzak #5). Ölçülemezse ↑/↓ tek adım.
- Roving tabindex: Tab ızgaradan çıkar, kart içi butonlara girmez.
- K kısayolu metin alanında yazarken tetiklenmez.
- Esc dinleyicisi TEK yerde (events-page.tsx); test document.addEventListener('keydown') sayımını doğrular.
- Kırılım CSS'te seçilir, JavaScript'te DEĞİL (tuzak #11).
- token-audit.test.ts yaz: components/events/* içinde sabit px araması boş olmalı.
- prefers-reduced-motion açıkken hover translateY, panel geçişi ve RSVP solması kapalı.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-etkinlikler/raporlar/10-s9-rapor.md
```

---

## Dalga 3 · Ş10 — Temizlik, parity, QA, kabul

```
Whispr monorepo, branch `uat`. "Etkinlikler" paketi — Dalga 3 / Şerit Ş10. SON ŞERİT.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-etkinlikler/00-ortak-baglam.md — uygulanmaz, okunur.
2. docs/prompts/whispr-etkinlikler/raporlar/ altındaki bütün raporlar.
3. docs/prompts/whispr-etkinlikler/11-dalga3-s10-temizlik-parity-qa.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/etkinlikler-paketi/PROMPT.md — kabul kriterlerinin tamamı.
5. design_handoff/etkinlikler-paketi/README.md — 11 ekran ↔ durum eşlemesi.

Silme sırası: rota → bileşenler → uçlar → sözlük anahtarları. Her adımdan sonra typecheck; ölü referans bırakma.

DİKKAT: events.remind / events.reminded anahtarları Ana Sayfa "Sıradaki" kartında da kullanılıyor olabilir. Silmeden önce grep -rn "events.remind" ile doğrula. getHomeUpcomingEvents SİLİNMEZ (Ana Sayfa kullanıyor). parseInboxSource SİLİNMEZ.

Doğrulama:
- parity.test.ts yeşil ve en az 20 iddia.
- 11 durumun 11'i de screens/*.png ile karşılaştırıldı; ölçü farkı varsa UYGULAMA düzeltilir (sözlük referanstan okundu).
- 6 çözünürlük × 2 tema: kaydırma yok, kırpma yok, başlık tek satır, kolon sayısı adım büyüdükçe artmıyor.
- grep -rnE "#[0-9a-fA-F]{3,8}" apps/web/src/components/events apps/web/src/lib/events → yalnız #fff.
- e2e/specs/events/events.spec.ts yaz (9 senaryo, dosyada listeli); e2e:a11y süitine /events ekle.
- Server-Timing ile ızgara ve ray'ın bağımsız yüklendiğini ölç.

Kapı:
pnpm --filter @wizards/db db:generate && pnpm typecheck && pnpm lint && pnpm format
pnpm --filter @wizards/web test && pnpm --filter @wizards/types test && pnpm --filter @wizards/db test
pnpm --filter @wizards/web e2e:smoke && pnpm --filter @wizards/web e2e:a11y
graphify update .

Rapor: docs/prompts/whispr-etkinlikler/raporlar/11-s10-rapor.md — PROMPT'un kabul listesinin TAMAMI kutu kutu işaretli, her kapı çıktısı yapıştırılmış.
COMMIT ATMA.
```
