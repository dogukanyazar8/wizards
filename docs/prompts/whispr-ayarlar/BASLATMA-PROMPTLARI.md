# Başlatma promptları — Bildirimler + Ayarlar paketi

Her şerit **ayrı bir Claude Code oturumunda** koşar. Aşağıdaki bloklardan birini olduğu gibi
yapıştır; oturum gerisini paket dosyalarından okur.

**Durum:** paket yazıldı, hiçbir şerit koşulmadı. Sıradaki: **Dalga 0 · Ş0**.

## Sıra ve eşzamanlılık

```
Dalga 0  Ş0                        tek oturum
         ↓ kapı yeşil olmadan Dalga 1 açılmaz
Dalga 1  Ş1 · Ş2 · Ş3 · Ş4         dördü aynı anda
         ↓ dördü de yeşil olmadan Dalga 2 açılmaz
Dalga 2  Ş5 · Ş6                   ikisi aynı anda
         ↓ ikisi de yeşil olmadan Dalga 3 açılmaz
Dalga 3  Ş7 · Ş8 · Ş9 · Ş10        dördü aynı anda
         ↓ dördü de yeşil olmadan Dalga 4 açılmaz
Dalga 4  Ş11 · Ş12                 ikisi aynı anda
         ↓
Dalga 5  Ş13                       tek oturum (temizlik + parity + QA)
```

**Aynı çalışma ağacında paralel koşmak güvenlidir**: şeritlerin `Sahiplenilen dosyalar` kümeleri
ayrıktır ve Dalga 0 sözleşmeyi dondurur. Bilinen temas noktaları — hepsi şerit dosyasında yazılı:

- `lib/notifications/prefs-service.ts` — Ş1 yazar; Ş9 yalnız **okur**.
- `lib/settings/client.ts` — Ş5 bootstrap'i genişletir; Ş1/Ş3/Ş4 kendi client dosyalarını yazar,
  bu dosyaya dokunmaz.
- `components/settings/rows/setting-custom-block.tsx` — Ş6 kayıt defterini **boş yer tutucularla**
  kurar; Ş7/Ş8/Ş9/Ş10 yalnız **kendi anahtarlarının** satırını değiştirir. Aynı dosyada dört
  şerit çalışır ama satırları ayrıktır.
- `lib/appearance.ts` — yalnız Ş8 dokunur.
- `lib/socket/events.ts` — Ş1 `settings.updated`, Ş2 `notification.read` ekler. Ayrı tip
  bildirimleri, aynı dosya.
- `components/shell/channel-sidebar.tsx` — yalnız Ş12 dokunur, yalnız `quick` popover dalına.
- `src-tauri/src/lib.rs` — yalnız Ş10 dokunur.

Tam izolasyon istersen `git worktree`; birleştirme sırası Ş0 → Ş1/Ş2/Ş3/Ş4 → Ş6 → Ş5 →
Ş7/Ş8/Ş9/Ş10 → Ş11/Ş12 → Ş13 (en derin katman önce).

---

## Dalga 0 — Ş0 · Sözleşme katmanı

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar pencereleri" paketi — Dalga 0 / Ş0.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md — kurallar, 13 bağlayıcı karar, 15 tuzak, 9 sapma. Uygulanmaz, okunur.
2. docs/prompts/whispr-ayarlar/PLAN.md §2, §3, §5, §8 — kod gerçekleri, kararlar, veri sözleşmesi, ölçü sözlüğü.
3. docs/prompts/whispr-ayarlar/01-dalga0-s0-sozlesme.md — bu şeridin işi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md — tamamı.
5. design_handoff/ayarlar-paketi/SPEC-ANA-SAYFA.md §1 (token/tipografi) ve §8 (ölçekleme).

Bir ölçüden ya da içerikten emin olmadığında NİHAİ OTORİTE design_handoff/ayarlar-paketi/referans/Ayarlar-referans.dc.html içindeki inline `style` değeri ve `SET` dizisidir. Tahmin etme, oradan oku.

İçerik ağacı `SET` dizisinden BİREBİR çıkarılır: 6 bölüm · 27 alt sekme · 58 grup · 170 satır · 13 kontrol tipi · 20 özel blok · 3 riskli blok. Sayımlar `tree.test.ts` ile kilitlenir.

Zaten hazır, yeniden yazma: --info token'ı (globals.css:37 `199 89% 48%`), pxToRem/pxToEm/hairline (lib/home/metrics.ts), useUiScale + lib/home/scale.ts, lib/home/density.ts, components/ui/* (avatar, badge, modal, input, textarea, toggle-switch, segmented-control, skeleton, context-menu, toast), lib/notifications/quiet-hours.ts, lib/appearance.ts'teki 27 tema kaydı.

Desen dosyaları (oku, kopyalama): lib/events/metrics.ts (sözlük + SPEC_DEVIATIONS), lib/mentions/parity.test.ts (parity kapısı), lib/events/routes.ts (URL ayrıştırıcı), packages/db/prisma/schema-mentions-screen.test.mjs (şema sözleşme testi).

Kurallar:
- Test önce yaz, kırmızı gör, sonra yeşile çevir.
- Migration packages/db/prisma/rebaseline-migrations altına — prisma/migrations DEĞİL.
- Mevcut 12 UserNotificationSettings kolonu KORUNUR; ters mantıklı ikisi (suppressEveryoneMentions, suppressRoleMentions) silinmez.
- typeSecurity / typeModeration kolonu EKLEME — kilitli türler sunucu tarafında sabit true.
- Ölçü sözlüğü RENK TAŞIMAZ. Ton token adıdır ("--danger"), renk değil.
- TR metinleri SPEC ve referanstan BİREBİR kopyalanır; yeniden yazma, kısaltma, "iyileştirme" yok.
- Mevcut settings.* i18n anahtarlarını SİLME — eski panel hâlâ ayakta, Ş13'te silinecek.
- COMMIT ATMA.

Kapı (hepsi yeşil olmalı):
pnpm --filter @wizards/db db:generate
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test

Rapor: docs/prompts/whispr-ayarlar/raporlar/01-s0-rapor.md
```

---

## Dalga 1 — Ş1 · Bildirim tercihleri API

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 1 / Ş1.

Ön koşul: Dalga 0 kapısı yeşil (lib/settings/tree.ts, packages/types/src/settings.ts, migration hazır).
Paralel koşan şeritler: Ş2, Ş3, Ş4. Onların dosyalarına DOKUNMA.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/02-dalga1-s1-bildirim-tercihleri-api.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §2, §5.4, §7.

Kritik kurallar:
- notification-prefs ve mention-settings AYNI satırı yazar. Tek servis (prefs-service.ts) kuralı; mention ucunun davranışı DEĞİŞMEZ ve mevcut testleri dokunulmadan yeşil kalır.
- Kilitli türler sunucu sözleşmesidir: okuma her zaman true, PATCH'te gelirse 400.
- level = OFF bildirim MERKEZİNİ SUSTURMAZ; Notification satırı yazılmaya devam eder.
- Saklanıp uygulanmayan tercih YASAK: gönderim kapısı (message-notification-service, push-notifications) bu şeritte bağlanır.
- Mobil sözleşmesi kırılmaz (K12): yeni alanlar opsiyonel, eski alanlar türetilmiş değer olarak yazılmaya devam eder, iki yönlü eşleme.
- Sunucu METİN GÖNDERMEZ: enum ve sayı gönderir.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/02-s1-rapor.md
```

---

## Dalga 1 — Ş2 · Bildirim merkezi API

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 1 / Ş2.

Ön koşul: Dalga 0 kapısı yeşil. Paralel: Ş1, Ş3, Ş4. Onların dosyalarına DOKUNMA.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/03-dalga1-s2-bildirim-merkezi-api.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §1, §6, §7.
4. Referans veri: design_handoff/ayarlar-paketi/referans/Ayarlar-referans.dc.html içindeki NOTIFS dizisi ve nCounts hesabı.

Kritik kurallar:
- 4 sekme Notification.type enum'undan SUNUCUDA türetilir; mentions ve replies AYRIK küme.
- Gün grubu SUNUCUDA, izleyicinin saat diliminde hesaplanır; istemci tekrar hesaplamaz. Etiket enum, Türkçe metin değil.
- [id]/read ÇEVİRME kipi alır ({ read: boolean }); gövdesiz çağrı { read: true } gibi davranır (mobil kırılmaz).
- Sayaçlar yalnız OKUNMAMIŞ kayıtları sayar; dörtlü sayaç tek geçişte, [userId, read, createdAt] indeksinden.
- notification.created ve notification.read yükleri counts taşır — istemci sayacı ARTIRMAZ, sunucudan okur.
- /inbox siliniyor (K10): panelin Sistem sekmesi sonsuz kaydırma taşır; limit varsayılan 6, keyset imleç.
- EXPLAIN ANALYZE çıktısı rapora eklenir.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/03-s2-rapor.md
```

---

## Dalga 1 — Ş3 · Hesap ve güvenlik API

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 1 / Ş3.

Ön koşul: Dalga 0 kapısı yeşil (SecurityEvent tablosu hazır). Paralel: Ş1, Ş2, Ş4.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/04-dalga1-s3-hesap-guvenlik-api.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §5.1.

BU BİR GÜVENLİK ŞERİDİDİR. Her uç kimlik doğrulama, hız sınırı ve gerekli yerde reauth kurallarına tabidir; hiçbiri "sonra eklenir" diye bırakılmaz.

Kritik kurallar:
- Mobil parola ucunun DAVRANIŞI DEĞİŞMEZ; mantık ortak servise çıkarılır, mevcut testleri dokunulmadan yeşil kalır.
- Parola değişince DİĞER oturumlar kapanır, MEVCUT oturum kalır. revoke-others da mevcut oturumu kapatmaz — bunun regresyon testi zorunlu.
- SecurityEvent HAM IP SAKLAMAZ; ipHash AdminAuditLog ile aynı tuzlu hash şeması, tuz ortam değişkeninden.
- recordSecurityEvent hatası ana akışı DÜŞÜRMEZ.
- 2FA kurulum yanıtı otpauth:// URI + manuel anahtar döner; QR görüntüsü İSTEMCİDE üretilir.
- Hesap silme doğrulama cümlesi SUNUCUDA da denetlenir.
- Bağlı hesaplar ve telefon: UYDURMA ENDPOINT ÇAĞIRMA. Tipli adapter + TODO(api): (K5).
- Sunucu METİN GÖNDERMEZ.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/04-s3-rapor.md
```

---

## Dalga 1 — Ş4 · İstisnalar + arama indeksi

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 1 / Ş4.

Ön koşul: Dalga 0 kapısı yeşil (lib/settings/tree.ts hazır). Paralel: Ş1, Ş2, Ş3.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/05-dalga1-s4-istisnalar-arama.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §4.6, §5.4 (İstisnalar sekmesi).

Kritik kurallar:
- İSTİSNALAR İÇİN YENİ TABLO YOK (K4). Liste UserServerSettings + UserChannelSettings + DMParticipant birleşimi; yazma kendi mevcut ucuna gider.
- DEFAULT seviyeli ve susturulmamış satır listeye GİRMEZ.
- mutedUntil geçmiş satır düşer ve tembel düzeltilir (yazma yan etkisi tek yerde).
- Arama indeksi SETTINGS_TREE'den ÜRETİLİR; referanstaki statik SET_HITS dizisi KULLANILMAZ (var olmayan bir sekmeye işaret ediyor — sapma #7).
- Türkçe normalizasyon: toLocaleLowerCase("tr") + birleşik nokta düşürme. "Bİldİrİm" / "BILDIRIM" / "bildirim" aynı sonucu bulmalı.
- 170 satırın tamamı için "ölü hedef yok" taraması testi zorunlu.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/05-s4-rapor.md
```

---

## Dalga 2 — Ş5 · Ayarlar penceresi kabuğu

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 2 / Ş5.

Ön koşul: Dalga 1 kapısı yeşil. Paralel: Ş6 (satır motoru). Ş6'nın dosyalarına DOKUNMA — içerik alanına yer tutucu koy, Ş6 bitince gerçek çizim bağlanır.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/06-dalga2-s5-pencere-kabugu.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §4.1–§4.6, §10.
4. design_handoff/ayarlar-paketi/SPEC-ANA-SAYFA.md §8.

Ölçü otoritesi: lib/settings/metrics.ts (Ş0 yazdı). Emin olmadığında Ayarlar-referans.dc.html inline style.

Kritik kurallar:
- URL yol segmenti: /settings/[section]/[tab] + intercepting modal (K2). Eski ?section=&panel= 301 ile yönlenir; 19 eski değerin hepsi eşlenmiş olmalı.
- Web/Masaüstü segmenti ÜRÜNDE ÇİZİLMEZ (K11). Masaüstü bölümü yalnız Tauri çalışma zamanında listede.
- Örtü kartın KARDEŞİDİR; kartın içine tıklamak kapatmaz. Esc sırayla menü → riskli blok → pencere.
- Kayıt göstergesi GERÇEK yanıt üzerine kurulur; referanstaki 850 ms sabit gecikme TAKLİT EDİLMEZ.
- Kirli bayrağı 8 profil anahtarında (pn, pu, pz, pbio, pp, ps, pe, px) — ÖNEK SEZGİSİ KULLANILMAZ (sapma #5).
- Kırılım CSS'te seçilir, JavaScript'te değil.
- Arbitrary px sınıfı YASAK; ölçüler sözlükten pxToRem ile.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/06-s5-rapor.md
```

---

## Dalga 2 — Ş6 · Satır motoru

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 2 / Ş6.

Ön koşul: Dalga 1 kapısı yeşil. Paralel: Ş5 (pencere kabuğu). Onun dosyalarına DOKUNMA.

BU ŞERİT PAKETİN BELKEMİĞİDİR. 170 satırın tamamı buradan doğar; atlanıp elle markup yazmak işi ikiye katlar.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/07-dalga2-s6-satir-motoru.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §4.4.
4. design_handoff/ayarlar-paketi/PROMPT.md "Tasarım mantığı" §3 ve §4 (tek kontrol ekseni, kontrol seçimi).

Ölçü otoritesi: lib/settings/metrics.ts. İçerik otoritesi: lib/settings/tree.ts.

Kritik kurallar:
- Grup kabında overflow:hidden YASAK — açılır menü kırpılır. Yalnız fullWidth özel bloklar kendi içinde kırpar.
- Açılır menü yönü tıklama anında ÖLÇÜLÜR (236 px eşiği); render sırasında tahmin edilmez. Kaydırmada menü KAPANIR.
- Tek kontrol ekseni: her satırın kontrolü sağda AYNI hizada biter. Açıklama kontrol yuvasının DIŞINDA.
- Düğme kümesi YASAK: "E-posta işlemleri" gibi uydurma toplayıcı satır üretilmez.
- Paylaşılan anahtarlar (nd2, na5, na6, nq1, ns1) TEK DURUMDUR; ikinci yerel state kurulmaz. np4 bunlardan AYRIDIR.
- Yazmalar 250 ms kuyruklanır ve birleşir (kaydırıcı sürüklerken 40 istek çıkmasın). Hata değeri geri alır.
- Blok kayıt defteri BOŞ YER TUTUCULARLA kurulur; Ş7–Ş10 kendi anahtarlarını doldurur.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/07-s6-rapor.md
```

---

## Dalga 3 — Ş7 · Hesabım bölümü

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 3 / Ş7.

Ön koşul: Dalga 2 kapısı yeşil (pencere kabuğu + satır motoru hazır). Paralel: Ş8, Ş9, Ş10.
setting-custom-block.tsx kayıt defterinde YALNIZ kendi 5 anahtarının satırını değiştir.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/08-dalga3-s7-hesabim.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §5.1.
4. Referans kare: design_handoff/ayarlar-paketi/screens/04-ayarlar-profil.png.

İçerik otoritesi lib/settings/tree.ts; satırları ELLE YAZMA — renderSettingsTab çizer. Sen yalnız 5 özel bloğu ve 3 riskli blok gövdesini yazarsın.

Kritik kurallar:
- Hero CANLI güncellenir: pn/pu/pp/ps/pe/px yazıldıkça anında yansır (kaydedilmeden).
- "Kırp / Yakınlaştır / Sıfırla" düğme dizisi YOK (PROMPT §5).
- Telefon satırı ve 4 bağlı hesap satırı disabled + TODO(api): (K5). UYDURMA ENDPOINT ÇAĞIRMA.
- Diğerlerini kapat MEVCUT oturumu kapatmaz; "Bu cihaz" satırında X düğmesi yok.
- 2FA QR'ı İSTEMCİDE üretilir.
- Rozet AÇIKLAMASI YOK — uydurma metin üretme (README notu).
- K9: "Boşta sayılma süresi" satırı Gizlilik › Görünürlük grubuna eklenir.
- Rozet ızgarası ve ağır bloklar ilk açılışta iskeletle gelir.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/08-s7-rapor.md
```

---

## Dalga 3 — Ş8 · Ses ve Video + Görünüm

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 3 / Ş8.

Ön koşul: Dalga 2 kapısı yeşil. Paralel: Ş7, Ş9, Ş10.
setting-custom-block.tsx kayıt defterinde YALNIZ kendi 6 anahtarının satırını değiştir.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/09-dalga3-s8-ses-video-gorunum.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §5.2 ve §5.3.
4. Referans kare: design_handoff/ayarlar-paketi/screens/06-gorunum-tema.png.

Kritik kurallar (K13):
- VoicePreferencesPanel / CameraPreferencesPanel / ScreenSharePreferencesPanel SİLİNİR; mantık üç hook'a çıkar.
- KAYNAK SIZINTISI YASAK: mikrofon testi ve kamera önizlemesi kapanınca track durur. Sekme değişince mikrofon ışığı yanık kalmamalı — testi zorunlu.
- Cihaz listeleri GERÇEK enumerateDevices() sonucundan; tasarımdaki adlar örnek veridir.
- İzinler gerçek navigator.permissions'tan; sabit değer yazma.
- K6: 23 temanın KİMLİĞİ VE RENGİ AYNEN KALIR; yalnız görünen ad Türkçeleşir. Eşleme lib/appearance.ts içinde yorumla gerekçelendirilir. Koyu/Açık etiketi gerçek temadan okunur (14/9, sapma #1).
- Sapma #4: "Hareketi azalt" ve "Text-to-speech" Medya ve Erişilebilirlik'te TEK ANAHTAR.
- Ses işleme satırları (p1…p9) kirli bayrağı KURMAZ (sapma #5).
- Uygulama simgesi seçimi GERÇEKTEN favicon'u değiştirir.
- "Yazı boyutu" ölçek adımının ÜSTÜNE biner, yerine geçmez.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/09-s8-rapor.md
```

---

## Dalga 3 — Ş9 · Bildirimler bölümü

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 3 / Ş9.

Ön koşul: Dalga 2 kapısı yeşil. Paralel: Ş7, Ş8, Ş10.
setting-custom-block.tsx kayıt defterinde YALNIZ kendi 2 anahtarının satırını değiştir.
lib/notifications/prefs-service.ts'i yalnız OKU (Ş1 sahibi).

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/10-dalga3-s9-bildirimler-bolumu.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §5.4.
4. Referans kare: design_handoff/ayarlar-paketi/screens/05-bildirimler-turler.png.

Bu bölüm 50 satırla paketin en kalabalık bölümü ve PAYLAŞILAN ANAHTARLARIN tamamı burada.

Kritik kurallar:
- 5 paylaşılan anahtar (nd2, na5, na6, nq1, ns1) iki sekmede AYNI değeri gösterir; birinde değişince diğeri anında hizalanır.
- np4 (Panel › Mesaj içeriğini göster) na6'dan AYRIDIR. Regresyon testi zorunlu.
- Genel'deki düzey menüsü ile 560 px penceredeki radyo kartları AYNI level anahtarını yazar, FARKLI etiketle. İki metin de birebir korunur (sapma #6).
- Kilitli iki satır tıklanamaz ve SUNUCUYA İSTEK ATMAZ.
- Özet kutusundaki üç sayı GERÇEK veriden; tasarımdaki 9/15 örnek veridir. İstisna sayısı Ş4 ucunun uzunluğudur — ikinci sayaç kurma.
- Sessiz saat menüleri 24 saati yarım saatlik adımlarla listeler; tasarımdaki 4'er seçenek örnek veridir.
- Çağrı sesi varlıkları eklenir: public/sounds/call.mp3 ve call-whispr.mp3.
- ne1 kendi grubuna alınır, metni DEĞİŞMEZ (sapma #9).
- SPEC_DEVIATIONS'a 10. kayıt eklenir: "Ses ayarları bu cihaza kaydedilir" notu ile K3 (sunucu saklama) çelişiyor; metin korunur, davranış sunucudadır.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/10-s9-rapor.md
```

---

## Dalga 3 — Ş10 · Masaüstü + Hakkında

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 3 / Ş10.

Ön koşul: Dalga 2 kapısı yeşil. Paralel: Ş7, Ş8, Ş9.
setting-custom-block.tsx kayıt defterinde YALNIZ kendi 7 anahtarının satırını değiştir.
Bu şerit RUST tarafına dokunan tek şerittir (apps/desktop/src-tauri/src/lib.rs).

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/11-dalga3-s10-masaustu-hakkinda.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §5.5 ve §5.6.
4. Referans kareler: screens/07-masaustu-izinler.png, screens/08-hakkinda.png.

Kritik kurallar (K7):
- Rust: 3 ses eylemi 5 eyleme genişler. ESKİ KOMUT ADLARI KORUNUR ve yeni komutlara yönlendirir — eski web sürümü kırılmaz.
- Kayıt hatası ÇAKIŞMA olarak raporlanır; uygulama ÇÖKMEZ, diğer kısayollar kaydolmaya devam eder.
- Çakışma durumu SAKLANMAZ — her açılışta gerçek kayıttan okunur.
- Kısayol atamaları sunucuda UserSettings.desktopShortcuts Json? kolonunda saklanır. Bu K3'ün TEK istisnasıdır; SPEC_DEVIATIONS'a 11. kayıt olarak gerekçesiyle girer ve Ş0'a geri bildirilir.
- 5 izin gerçek kaynaktan; global kısayol izni çoğu platformda sorgulanamaz — "Doğrulanamadı" doğru varsayılan.
- "Kontrol et" GERÇEKTEN yeniden sorgular; iyimser güncelleme yapmaz.
- Tanılama ızgarası İzinler ve Kısayollar sekmeleriyle AYNI kaynağı okur; ikinci sorgu kurma.
- "Oyun bazlı ayarlar" hedefi bu pakette yok → disabled + TODO(api):; sayı gerçek veriden, sabit 4 yazma.
- Hakkında bağlantıları GERÇEK hedeflere gider; uydurma URL yok. Web'de masaüstü sürüm satırları "—" gösterir, GİZLENMEZ.
- COMMIT ATMA.

Kapı:
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

Rapor: docs/prompts/whispr-ayarlar/raporlar/11-s10-rapor.md
```

---

## Dalga 4 — Ş11 · Bildirimler paneli + bildirim ayarları penceresi

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 4 / Ş11.

Ön koşul: Dalga 3 kapısı yeşil. Paralel: Ş12 (kullanıcı barı menüsü). channel-sidebar.tsx'e DOKUNMA — orası Ş12'nin.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/12-dalga4-s11-panel-bildirim-ayarlari.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §1, §2, §6.
4. Referans kareler: screens/01-bildirimler-penceresi.png, screens/02-bildirim-ayarlari.png.
5. Referans veri: Ayarlar-referans.dc.html içindeki NOTIFS, levels, quickPrefs dizileri.

Kritik kurallar:
- Zil BUTONU KALIR (badgeVariant="dot" zaten var); yalnız popover GÖVDESİ değişir.
- Satıra tıklamak durumu ÇEVİRİR. Kırmızı "0" pili HİÇBİR DURUMDA görünmez.
- Sekme sayaçları socket yükündeki counts'tan okunur — istemci ARTIRMAZ (iki sekme açıkken ayrışmasın).
- Okunmamış durumu renkle DEĞİL, aria-label'da metinle de bildirilir.
- Sonsuz kaydırma: IntersectionObserver efekt bağımlılıkları İLKEL olmalı; [listQuery] yazmak her render bir sayfa daha çeker.
- Sessiz saat satırı tercih kapalıyken YAZILMAZ.
- "Tüm bildirimleri gör" → /mentions (K10).
- İzin verilmişse izin şeridi HİÇ RENDER EDİLMEZ. "İzin iste" gerçek Notification.requestPermission() çağırır.
- Düzey radyo kartları Ayarlar › Genel'deki menüyle AYNI level anahtarını yazar (sapma #6).
- Kayıt göstergesi GERÇEK yanıt üzerine; sabit gecikme yok.
- Örtü kartın kardeşi; Esc sırayla modal → panel.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/12-s11-rapor.md
```

---

## Dalga 4 — Ş12 · Kullanıcı barı menüsü

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 4 / Ş12.

Ön koşul: Dalga 3 kapısı yeşil. Paralel: Ş11. components/notifications/** dosyalarına DOKUNMA.

BU KABUĞA DOKUNAN TEK ŞERİTTİR. Diff channel-sidebar.tsx içinde YALNIZ quick popover dalına dokunmalı; avatar, durum satırı, mikrofon ve kulaklık butonları AYNEN KALIR.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/13-dalga4-s12-kullanici-bari-menusu.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §3.
4. Referans kare: screens/03-kullanici-menusu.png.
5. Referans veri: Ayarlar-referans.dc.html içindeki dndDurs, devRows, meter dizileri.

Kritik kurallar (K8):
- DND anahtarı status = DND yazar; süre çipi statusExpiresAt + statusRestoreTo kurar. MEVCUT odak makinesi süreyi yönetir — İKİNCİ GERİ SAYIM KURMA.
- statusRestoreTo DND açılmadan ÖNCEKİ durumdur; DND açıkken süre değiştirmek onu EZMEZ.
- 4 süre çipi TEK SATIRDA; sığmıyorsa iç boşluk küçülür, sarma yok.
- Cihaz listeleri gerçek enumerateDevices()'ten; aynı anda tek liste açık; menü 308 px kutudan taşmaz.
- Ölçer gerçek mikrofon seviyesinden; "Test et" kapanınca STREAM DURUR.
- ⌘, / Ctrl+, GERÇEKTEN çalışır; ipucu metni platforma göre yazılır, sabit ⌘ gömülmez.
- K9: "Boşta sayılma süresi" menüden ÇIKAR, Gizlilik sekmesine taşınır (Ş7 çizdi). Yerel tercih sunucuya bir kez göç ettirilir ve yerel anahtar silinir.
- data-testid="user-quick-menu" ve mevcut dışarı-tıklama / Escape dinleyicileri KORUNUR.
- Çıkış akışı mevcut sırayı korur: sesli kanaldan çık → socket kapat → logoutAction.
- COMMIT ATMA.

Kapı: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
Rapor: docs/prompts/whispr-ayarlar/raporlar/13-s12-rapor.md
```

---

## Dalga 5 — Ş13 · a11y, ölçekleme, temizlik, parity QA

```
Whispr monorepo, branch `uat`. "Bildirimler + Ayarlar" paketi — Dalga 5 / Ş13 (kapanış).

Ön koşul: Dalga 4 kapısı yeşil. Paralel: yok.

Bu şerit YENİ YÜZEY EKLEMEZ; ölçer, düzeltir, siler, kapatır.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-ayarlar/00-ortak-baglam.md
2. docs/prompts/whispr-ayarlar/14-dalga5-s13-a11y-olcek-temizlik-parity.md — §"Sahiplenilen dosyalar" BAĞLAYICI.
3. docs/prompts/whispr-ayarlar/PLAN.md §11 — kabul kriterlerinin TAMAMI işaretlenmeli.
4. design_handoff/ayarlar-paketi/SPEC-AYARLAR.md §10, SPEC-ANA-SAYFA.md §8.
5. docs/prompts/whispr-ayarlar/raporlar/ — önceki 12 raporu oku; bırakılan TODO ve sapmaları topla.

Kritik kurallar:
- settings-panel.tsx SİLİNMEDEN ÖNCE satır envanteri çıkarılır: eski panelde olup yeni ağaçta karşılığı olmayan HER ayar rapora yazılır ve ya taşınır ya gerekçesiyle SPEC_DEVIATIONS'a girer. Sessizce kaybolan ayar YASAK.
- /inbox silinir; grep -rn "/inbox" ile ölü bağlantı taraması yapılır.
- Arbitrary px sınıfı ve zoom taraması TEMİZ olmalı.
- Test matrisi: 1360×920 · 1600×900 · 1920×1080 · 2560×1440 · 3840×2160, her biri açık ve koyu temada.
- Açılır menü kırpılma testi: menü açıkken ilk ve son seçeneğin bounding box'ı kaydırma alanı içinde. Kritik vakalar: Gizlilik › Dil ve bölge, Bildirimler › Sessiz saatler, Ses ve Video › Ses işleme.
- SPEC_DEVIATIONS 11 kayıt ve HER BİRİ için davranış testi.
- Sekiz referans karesinin karşılaştırması rapora yazılır; gerçek veri farkı sapma sayılmaz, ölçü/hizalama/renk/boşluk farkı SAPMADIR ve düzeltilir.
- graphify update . çalıştırılır.
- COMMIT ATMA.

Kapı:
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
pnpm --filter @wizards/web e2e

Rapor: docs/prompts/whispr-ayarlar/raporlar/14-s13-rapor.md
```
