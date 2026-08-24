# Başlatma promptları — Bahsedilmeler paketi

Her şerit **ayrı bir Claude Code oturumunda** koşar. Aşağıdaki bloklardan birini olduğu gibi
yapıştır; oturum gerisini paket dosyalarından okur.

**Dalga 0 tamamlandı** (2026-08-21, uncommitted). Sırada Dalga 1'in dört şeridi var ve
**aynı anda** açılabilirler.

## Sıra ve eşzamanlılık

```
Dalga 0  ✔ bitti      → raporlar/01-dalga0-rapor.md
Dalga 1  Ş1 · Ş2 · Ş3 · Ş4      dördü aynı anda
         ↓ dördü de yeşil olmadan Dalga 2 açılmaz
Dalga 2  Ş5 · Ş6 · Ş7 · Ş8      dördü aynı anda
         ↓
Dalga 3  Ş9                      tek oturum
```

**Aynı çalışma ağacında paralel koşmak güvenlidir**: şeritlerin `Sahiplenilen dosyalar`
kümeleri ayrıktır ve Dalga 0 sözleşmeyi dondurdu. İki bilinen temas noktası vardır ve ikisi de
şerit dosyasında yazılıdır:

- `apps/web/src/lib/mentions/client.ts` — Ş1 yalnız `mentionsQueryKeys` + sayaç sorgusunu yazar
  ve dosyanın sonuna `// Ş3` sınır yorumu bırakır; Ş3 kalanını yazar.
- `apps/web/src/lib/notifications/quiet-hours.ts` — Ş4 yazar, Ş2 çağırır. Ş4 daha bitmediyse
  Ş2 `TODO(api):` ile geçici `() => false` kullanır ve Dalga 2 başlamadan gerçek çağrıya döner.

Tam izolasyon istersen `git worktree` kullan; birleştirme sırası Ş2 → Ş3 → Ş4 → Ş1 olsun
(en derin katman önce).

---

## Dalga 1 · Ş1 — Kabuk 4. kolonu + Bahsetme rayı (276)

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 1 / Şerit Ş1.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/01-dalga0-rapor.md — Dalga 0'da ne landed; hiçbirini tekrar yazma.
3. docs/prompts/whispr-bahsedilmeler/02-dalga1-s1-kabuk-bahsetme-rayi.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI: orada yazmayan dosyaya yazma, oku.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §1 ve §3.
5. design_handoff/bahsedilmeler-paketi/screens/01-tum-bahsedilmeler.png, 02-okunmamis.png, 03-rol-herkes.png, 11-kaynaga-gore-gruplama.png.

Bir ölçüden emin olmadığında NİHAİ OTORİTE design_handoff/bahsedilmeler-paketi/referans/Bahsedilmeler.dc.html içindeki inline `style` değeridir. Tahmin etme.

Dalga 0 hazır, yeniden yazma: apps/web/src/lib/mentions/metrics.ts (ölçü sözlüğü), lib/mentions/routes.ts (URL durumu), lib/mentions/contracts.ts (MENTION_SIDEBAR_KIND_ROWS, readMentionKindRowCount, MENTION_KIND_TONE/GLYPH), @wizards/types mentions-screen (şemalar + mentionsUiReducer), globals.css --info token'ı, tr.ts/en.ts mentions.* anahtarları.

Kurallar:
- Test önce yaz, kırmızı gör, sonra yeşile çevir.
- Renk yalnız token: hsl(var(--...)). Yeni hex yok. Sabit font adı yok.
- Arbitrary px YASAK (eslint kuralı bu dizinlerde açık): ölçüler pxToRem/hairline ile metrics.ts'ten.
- Metin yalnız t("mentions.*") ile; JSX'e metin gömme, yeni anahtar uydurma — hepsi Dalga 0'da yazıldı.
- Sol taraf (server-rail, app-nav-panel, kullanıcı barı) DEĞİŞMEZ. wizards-shell.tsx'te yalnız thirdColumn === "mentions" dalı ve genişlik hesabı.
- Uydurma endpoint çağırma; karşılığı olmayan alan için tipli adapter + TODO(api):.
- Diğer şeritler paralel koşuyor olabilir; kendi dosya kümenin dışına yazma.
- COMMIT ATMA. Kullanıcı açıkça istemeden commit yok.

Kapı (hepsi yeşil olmalı):
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/02-s1-rapor.md yaz: ne yapıldı, hangi SPEC sapması kayda geçti, hangi TODO(api): bırakıldı, kapı çıktısı.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 1 · Ş2 — Üretim katmanı: rol, `@herkes`, thread takibi, `kind`

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 1 / Şerit Ş2.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/01-dalga0-rapor.md — Dalga 0'da ne landed; hiçbirini tekrar yazma.
3. docs/prompts/whispr-bahsedilmeler/03-dalga1-s2-uretim-katmani.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §10 (veri sözleşmesi).

Bu şerit hiçbir React bileşenine dokunmaz; yalnız yazma yolu.

Dalga 0 hazır: Prisma'da MentionKind (SELF/ROLE/THREAD), MentionStateSource, ThreadFollowOrigin enumları; MentionState ve ThreadFollow modelleri; MessageMention.kind+roleId; DMMessageMention.kind. Migration 20260821120000_mentions_screen yerel DB'de koştu. Şema değişikliği gerekiyorsa yeni bir migration yaz, mevcut olanı düzenleme.

Bağlayıcı kararlar (00-ortak-baglam §3'te gerekçeleriyle):
- K1: rol bahsetmesi UÇTAN UCA — @rol ayrıştırıcı + Role.mentionable izni + rol üyelerine fan-out + bestekar otomatik tamamlama + bildirim/sayaç + mobil bildirim uyumu.
- K2: @herkes/@burada için TABLO YAZMA. Message.mentionEveryone kolonu gönderimde (message-service.ts:835) ve düzenlemede (:1022) zaten yazılıyor, geçmiş veri dahil dolu. Yalnız Notification üret (dedupeKey `channel-everyone:<messageId>:<userId>`), MessageMention satırı yazma.
- K3: thread takibi örtük (AUTHOR/REPLY/MENTION) + açık (EXPLICIT); mutedAt dolu satır örtük kurallarla yeniden açılmaz. Mevcut createChannelThreadReplyNotification'ın bugün bildirim alan üst mesaj yazarını KAYBETME.
- K6: mentionThreadReplies varsayılanı kapalı — bu şerit yayına girince kimse bildirim yağmuru almamalı, testin bunu kanıtlaması şart.

Tuzaklar:
- extractMentionUsernames'in davranışını DEĞİŞTİRME; mevcut testleri değişmeden geçmeli. Rol ayrıştırıcısı ayrı yazılır.
- Fan-out senkron yazılmaz: outbox işine kuyruklanır (OUTBOX_JOB_TYPES). 2.000 üyeli rol partili yazılır (500'lük).
- Notification satırı olmayan bahsetme "okunmuş" sayılır; bu kuralı bozma, yoksa eski bahsetmeler bir gecede okunmamışa döner.
- quiet-hours.ts Ş4'ün dosyası. Henüz yoksa TODO(api): ile geçici `() => false` adapter kullan.

Kurallar: test önce; uydurma endpoint yok; kendi dosya kümenin dışına yazma; COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test
  pnpm --filter @wizards/db db:generate

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/03-s2-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 1 · Ş3 — Okuma API'si, sayacın tek kaynağa taşınması, socket

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 1 / Şerit Ş3.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/01-dalga0-rapor.md — Dalga 0'da ne landed.
3. docs/prompts/whispr-bahsedilmeler/04-dalga1-s3-okuma-api-sayac.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §2, §9, §10.
5. Mevcut apps/web/src/lib/home/mentions-service.ts — yeni sorgunun atası. Oku, kopyalama; Dalga 3'te silinecek.

Ş2'yi BEKLEME. Dört dalın sorgusunu da baştan yaz ve boş veriyle test et; sözleşme Dalga 0'da dondu.

Dalga 0 hazır: @wizards/types mentions-screen (MentionSchema, MentionCountsSchema, MentionContextSchema, formatMentionId/parseMentionId — bahsetme kimliği bileşik: "<source>:<refId>", elle split etme), lib/mentions/routes.ts, lib/mentions/metrics.ts.

Bağlayıcı kararlar:
- K4: unreadMentions artık bahsetme listesinin kaynağından hesaplanır (Notification + MentionState). ChannelReadState.mentionCount / DMParticipant.mentionCount SİLİNMEZ — kanal ve DM satır rozetleri onları okumaya devam eder; yalnız summary bağı kesilir.
- Birleşik okuma kuralı: unread = (MentionState.readAt IS NULL) AND COALESCE(Notification.read, TRUE) = FALSE. MentionState satırı yoksa Notification belirler.
- K5: readLaterAt dolu kartlar HER ZAMAN listenin başında; imleç (readLaterFirst, occurredAt, id) taşır.
- K7: window=30d varsayılan, window=all sınırsız. Hiçbir satır silinmez/taşınmaz.
- K11: read-all YALNIZ bahsetmeleri okur. Bugünkü markAllNotificationsRead tüm bildirimleri okuyor — bu ekranda KULLANILMAZ. 10 dakikalık undoToken ile geri alma.
- K2: @everyone dalı Message.mentionEveryone bayrağından türetilir (kısmi indeks Dalga 0'da atıldı).

Görünürlük sorgunun kendi süzgecidir, sonucuna uygulanan bir kontrol değil: kanal erişimi resolveHomeChannelAccess, DM üyeliği DMParticipant, historyFromAt sınırı, deletedAt/placeholderRemovedAt/expiresAt.

Arama SUNUCU tarafındadır (ILIKE; metin, yazar adı/kullanıcı adı, kanal ve sunucu adı). İstemci yüklenmiş sayfaları süzmez.

Socket: mention:new · mention:state · mention:read-all, hepsi user:<id> odasına. Mevcut notification:new KALDIRILMAZ.

lib/mentions/client.ts dosyasında Ş1'in bıraktığı `// Ş3` sınır yorumundan SONRASINI yaz; öncesine dokunma.

Kurallar: test önce; uydurma endpoint yok; COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Ek olarak liste sorgusunun EXPLAIN ANALYZE çıktısını al (yerel DB: wizards@localhost:5432) ve rapora ekle; 30 günlük pencerede seq scan olmamalı.

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/04-s3-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 1 · Ş4 — Bildirim ayarları uçları (sessiz saatler, masaüstü kipi)

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 1 / Şerit Ş4.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/01-dalga0-rapor.md — Dalga 0'da ne landed.
3. docs/prompts/whispr-bahsedilmeler/05-dalga1-s4-bildirim-ayarlari-api.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §7.
5. design_handoff/bahsedilmeler-paketi/screens/08-bildirim-ayarlari.png.

En küçük şerit. Modalın (Ş8) arkasındaki kalıcılık + mevcut Ayarlar sayfasıyla eşleme.

Dalga 0 hazır: UserNotificationSettings'e mentionSelf, mentionThreadReplies, desktopMentionMode (ALL/MENTIONS/OFF), quietHoursEnabled/From/To/TimeZone eklendi; @wizards/types'ta MentionSettingsSchema, MentionSettingsPatchSchema, QuietHourTimeSchema, MENTION_SETTINGS_DEFAULTS var.

Bağlayıcı kararlar:
- K6: mevcut suppressRoleMentions / suppressEveryoneMentions kolonları KALIR ve TERS eşlenir (suppress=true ↔ anahtar kapalı). Ters mantık YALNIZ servis katmanında çözülür; route ve bileşen `!suppress` yazmaz.
- desktopNotifications boolean'ı bir sürüm daha durur; okuma yolu desktopMentionMode'a taşınır, OFF ↔ false eşlenir.
- Sessiz saatte bahsetme SAYACA YAZILIR, yalnız push ve masaüstü bildirimi bastırılır — tasarımın kendi metni bunu söylüyor.

quiet-hours.ts imzası Ş2 ile tek temas noktan: isWithinQuietHours(settings, at: Date): boolean. Gece aşan aralık (23:00 – 08:00) doğru çalışmalı; from === to → 400.

GET satır yoksa varsayılanı döndürür ve YAZMAZ; PATCH satırı oluşturur. PATCH gövdesi MentionSettingsSchema.partial() ile doğrulanır, bilinmeyen alan reddedilir.

Kurallar: test önce; kendi dosya kümenin dışına yazma (özellikle message-notification-service.ts Ş2'nin); COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/05-s4-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 2 · Ş5 — Akış başlığı, gruplama, sekmeler, URL durumu, boş durum

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 2 / Şerit Ş5.
ÖN KOŞUL: Dalga 1'in dört şeridi de yeşil. Değilse başlama.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/ altındaki TÜM raporlar — Dalga 0 ve Dalga 1'de ne landed, hangi TODO(api): açık.
3. docs/prompts/whispr-bahsedilmeler/06-dalga2-s5-akis-baslik-gruplama.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §2, §4, §5 (grup başlıkları), §5.3, §8, §9.
5. design_handoff/bahsedilmeler-paketi/screens/01, 02, 09-bos-durum.png, 11-kaynaga-gore-gruplama.png.

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Bahsedilmeler.dc.html inline `style` değeridir.

Bu şerit ekranın iskeleti ve durum yönetimi. Kartın İÇİNİ Ş6, yanıt kutusunu ve paneli Ş7, modalı Ş8 yazıyor — onları MentionCardProps ve slot üzerinden yerleştir, dosyalarına yazma.

Dalga 0 hazır: metrics.ts (feedHeader, feed, emptyState bölümleri), routes.ts (parseMentionsRouteState, buildMentionsHref, toggleMentionFilter/Source), contracts.ts (MENTION_TABS, readMentionTabCount), @wizards/types mentionsUiReducer (SPEC §2 tek-katman kuralı — üç ayrı useState YAZMA), i18n mentions.* anahtarları.

Bağlayıcı noktalar:
- Filtre + kaynak + gruplama + pencere + arama URL'de; geri tuşu her birini tek adım geri almalı.
- Sekmeler ile raydaki tür satırları AYNI state.
- Bağlam paneli açıkken başlıktaki iki ikon butonu display:none — sınıfla gizlemek değil, DOM'dan kaldırmak (odak sırasına da girmemeli).
- Boş grup render edilmez; "Sonra oku" grubu en üstte (K5).
- Yeni bahsetme kaydırılmış akışta konumu bozmaz; üstte "{count} yeni bahsetme" şeridi çıkar.
- J/K/↑/↓/R/E/Esc yalnız akış odaktayken; input odaktayken tetiklenmez.
- "Arşive dön" → ?window=all (K7).
- Eski apps/web/src/components/screens/mentions-screen.tsx SİLİNİR; side-screens.test.tsx içindeki bahsedilmeler iddiaları güncellenir; artık kullanılmayan eski mentions.* anahtarları temizlenir.

Kurallar: test önce; token dışı renk yok; arbitrary px yok; metin yalnız t("mentions.*"); COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/06-s5-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 2 · Ş6 — `MentionCard` + tür pili + `⋯` menüsü

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 2 / Şerit Ş6.
ÖN KOŞUL: Dalga 1'in dört şeridi de yeşil. Değilse başlama.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/ altındaki TÜM raporlar.
3. docs/prompts/whispr-bahsedilmeler/07-dalga2-s6-mention-card-menu.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §5 ve §5.1.
5. design_handoff/bahsedilmeler-paketi/screens/01-tum-bahsedilmeler.png, 07-kart-menusu.png.

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Bahsedilmeler.dc.html inline `style` değeridir.

MentionCard SAF SUNUM bileşenidir: hiçbir mutasyonu kendi çağırmaz, hiçbir sorgu okumaz. Testleri sahte veriyle koşar. Prop sözleşmesi Dalga 0'da dondu: apps/web/src/lib/mentions/contracts.ts → MentionCardProps, MentionMenuAction, MentionMenuDirection, MENTION_KIND_TONE, MENTION_KIND_GLYPH.

Dalga 0 hazır: metrics.ts (card, cardMenu bölümleri), --info token'ı (rol pilinin tonu), i18n mentions.card.* / mentions.badge.* anahtarları.

Bağlayıcı noktalar:
- Menü mevcut ContextMenu + ContextMenuItem + ContextMenuSeparator ile; yeni menü bileşeni yazma.
- Menü yönü karttan değil AKIŞTAN gelir (menuDirection prop'u): ilk iki kart "down", sonrakiler "up". Kart kendi indeksini bilmez.
- `⋯` butonu opacity: calc(var(--act) + var(--hov)); klavyeyle odaklanınca :focus-visible ile opaklık 1 olmalı — yoksa klavyeyle görünmez bir hedef olur.
- Tür pilleri: me → --primary, role → --info, everyone → --warning, thread → --success.
- Gövdedeki bahsetme çipi sunucudan gelen `tag` alanıdır; gövdeden regex ile çıkarma.
- Buton/menü/çip tıklamaları kart gövdesine sızmaz (stopPropagation). Bütün kartı button ile sarma — iç içe buton üretir.
- DM kartında menünün 3. satırı "Bu sohbeti sessize al".

Kurallar: test önce; token dışı renk yok; arbitrary px yok; metin yalnız t("mentions.*"); COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/07-s6-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 2 · Ş7 — Satır içi yanıt + Bağlam paneli (326)

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 2 / Şerit Ş7.
ÖN KOŞUL: Dalga 1'in dört şeridi de yeşil. Değilse başlama.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/ altındaki TÜM raporlar.
3. docs/prompts/whispr-bahsedilmeler/08-dalga2-s7-yanit-baglam-paneli.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §5.2 ve §6.
5. design_handoff/bahsedilmeler-paketi/screens/05-baglam-paneli.png, 06-satir-ici-yanit.png.

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Bahsedilmeler.dc.html inline `style` değeridir.

Dalga 0 hazır: metrics.ts (replyBox, contextPanel bölümleri), i18n mentions.reply.* / mentions.context.* anahtarları (kısayol ipuçları ikişer anahtar: hint.sendKey="Enter" + hint.send="gönder" — tuş adı kalın, eylem normal).

Bağlayıcı noktalar:
- K10: thread kartında yanıt THREAD'e gider, DM kartında DM'e, diğerlerinde kanala. reply-target.ts bunu tek yerde çözer; meta satırı ve placeholder hedefi açık yazar.
- Yeni gönderme ucu YAZMA: mevcut lib/workspace/client ve lib/dm/client çağrılır.
- Esc ile kapanan kutuda kaydedilmemiş metin KAYBOLMAZ (kart kimliğine göre oturum belleği).
- Gönderim başarılıysa kart okundu sayılır ve kutu kapanır; hatada metin durur.
- Dosya ekleme kapsam dışıysa buton TODO(api): ile devre dışı bırakılır — sessizce hiçbir şey yapmayan buton bırakma.
- Bağlam paneli 326px; bahsetme satırı --primary/0.1 + --primary/0.3 ile vurgulu.
- "Thread'de yanıtla" thread'i olmayan bahsetmede ve DM'de GİZLENİR.
- <1100px overlay (odak tuzağı + Esc + dış tıklama), ≥1100px sütun (odak tuzağı YOK). Eşik CSS'te seçilir, JavaScript genişlik okumasıyla değil.
- components/chat/thread-panel.tsx DEĞİŞMEZ; düzenini örnek al, dosyaya dokunma.

Kurallar: test önce; token dışı renk yok; arbitrary px yok; metin yalnız t("mentions.*"); COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/08-s7-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 2 · Ş8 — Bildirim ayarları modalı (496) + toast altyapısı

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 2 / Şerit Ş8.
ÖN KOŞUL: Dalga 1'in dört şeridi, özellikle Ş4'ün uçları yeşil. Değilse başlama.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak. Uygulanmaz, okunur.
2. docs/prompts/whispr-bahsedilmeler/raporlar/ altındaki TÜM raporlar (özellikle Ş4'ünkü).
3. docs/prompts/whispr-bahsedilmeler/09-dalga2-s8-ayarlar-modali-toast.md — bu şeridin görevi. §"Sahiplenilen dosyalar" BAĞLAYICI.
4. design_handoff/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md §7 ve §8.
5. design_handoff/bahsedilmeler-paketi/screens/08-bildirim-ayarlari.png.

Bir ölçüden emin olmadığında NİHAİ OTORİTE referans/Bahsedilmeler.dc.html inline `style` değeridir.

ÖNCE TOAST: web'de genel bir toast altyapısı YOK (yalnız components/voice/voice-invite-toasts.tsx var, o sese özel ve DEĞİŞMEZ). components/ui/toast.tsx + sağlayıcı + useToast bu şeritte yazılır; K11/K12'nin "Geri al" eylemleri buna dayanıyor. Tek yığın, en çok 3 görünür toast, action varsa 10 sn, role="status" + aria-live, fare üzerindeyken ve pencere odak dışındayken sayaç durur.

Dalga 0 hazır: metrics.ts (settingsModal bölümü), @wizards/types MentionSettingsSchema + MENTION_SETTINGS_DEFAULTS, i18n mentions.settings.* / mentions.toast.* anahtarları.

Bağlayıcı noktalar:
- Mevcut Modal, ToggleSwitch, SegmentedControl kullanılır; yenisi yazılmaz, ölçü uyuşmuyorsa metrics.ts'ten geçirilir (bileşen çatallanmaz).
- Thread yanıtları anahtarı KAPALI başlar; masaüstü segmenti "Sadece bahsetmeler" seçili.
- Modal ?modal=settings ile açılır, kapanınca parametre silinir.
- İyimser güncelleme YOK: Kaydet tek PATCH gönderir (yalnız değişen alanlar), hata satır içinde gösterilir. Bildirim ayarı sessizce yanlış kaydedilirse kullanıcı bunu ancak bildirim gelmeyince anlar.
- "Düzenle" şeridi YERİNDE iki time girdisine açar; ikinci bir modal AÇMA (modal içinde modal erişilebilirlik tuzağı).
- Esc kapatır, açılışta ilk anahtara focus, focus tuzağı, kapanışta focus tetikleyiciye döner.
- SPEC'te olmayan iki durum (sessiz saatler kapalı hâli, kirli formda çıkış onayı) rapora sapma olarak yazılır.

Kurallar: test önce; token dışı renk yok; arbitrary px yok; metin yalnız t("mentions.*"); ui/modal.tsx ve voice-invite-toasts.tsx DEĞİŞMEZ; COMMIT ATMA.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/09-s8-rapor.md yaz.

Kararsız kaldığın yerde bana sor.
```

---

## Dalga 3 · Ş9 — Parity kapısı, a11y, kırılımlar, performans, kabul

```
Whispr monorepo, branch `uat`. "Bahsedilmeler" ekranı paketi — Dalga 3 / Şerit Ş9 (kapanış).
ÖN KOŞUL: Dalga 2'nin dört şeridi de yeşil. Değilse başlama.

Sırayla oku, sonra uygula:
1. docs/prompts/whispr-bahsedilmeler/00-ortak-baglam.md — kurallar, 12 bağlayıcı karar, 9 tuzak.
2. docs/prompts/whispr-bahsedilmeler/raporlar/ altındaki TÜM raporlar — açık kalan her TODO(api): ve her SPEC sapması.
3. docs/prompts/whispr-bahsedilmeler/10-dalga3-parity-qa.md — bu şeridin görevi.
4. design_handoff/bahsedilmeler-paketi/PROMPT.md — 16 maddelik kabul listesi; hepsi kanıtıyla işaretlenecek.
5. design_handoff/bahsedilmeler-paketi/screens/01…11.png — parity matrisinin referansı.

Bu şerit yeni özellik yazmaz; ölçer, kırar, düzeltir. Bulduğun kusuru SAHİBİ OLAN şeridin dosyasında düzelt ve rapora "şerit · dosya · sapma" olarak yaz.

Kapsam:
- Parity: 11 ekran × 2 tema × 5 çözünürlük (1360×920 · 1600×900 · 1920×1080 · 2560×1440 · 3840×2160) + 5120×1440 ultra geniş kontrolü. Ekran görüntüsü alıp screens/ ile karşılaştır.
- Ölçekleme: kök font boyutu adımı min(100vw/1360, 100dvh/920) ile 16·18·24·32px. `zoom` KULLANILMAZ. `rg -n "\[\d+px\]" apps/web/src/components/mentions apps/web/src/lib/mentions` temiz olmalı.
- Token: `rg -n "#[0-9a-fA-F]{3,8}|rgba?\(" apps/web/src/components/mentions` yalnız tasarımın #fff ters metnini vermeli. `rg -n "Outfit|Figtree" apps/web/src/components/mentions apps/web/src/lib/mentions` boş olmalı.
- A11y: kart article, gerçek button'lar, aria-label, okunmamış şeridinin metin karşılığı, Esc/focus tuzağı/focus dönüşü, J/K/R/E, role="feed".
- Kırılımlar: <1100px panel overlay, <960px ray drawer, ikisi de CSS'te seçili (hidrasyon uyarısı yok).
- Performans: ray ve akış bağımsız yükleniyor; liste sorgusu p95 < 120 ms (EXPLAIN ANALYZE rapora); 200 kartta 60 fps; mention:new kaydırma konumunu bozmuyor.
- E2E: apps/web/e2e/specs/mentions/mentions.spec.ts — 12 senaryo (10-dalga3-parity-qa.md §7).
- Kapsam denetimi: git diff --stat sol tarafa (server-rail, app-nav-panel, kullanıcı barı) dokunmuyor; lib/home/mentions-service.ts ve eski mentions-screen.tsx kaldırıldı, kalan import yok; kullanılmayan eski mentions.filter.* anahtarları temizlendi.

Kapı:
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test
  pnpm --filter @wizards/types test
  pnpm --filter @wizards/db test
  pnpm --filter @wizards/web e2e:a11y
  pnpm --filter @wizards/web e2e -- e2e/specs/mentions

Bitince docs/prompts/whispr-bahsedilmeler/raporlar/10-parity-raporu.md yaz: PROMPT.md'nin 16 kabul maddesi tek tek, her biri kanıtıyla (ekran görüntüsü / test adı / komut çıktısı).

COMMIT ATMA. Kararsız kaldığın yerde bana sor.
```

---

## Her oturumda geçerli olan üç kural

1. **Commit yok.** Hiçbir şerit kendiliğinden commit atmaz.
2. **`§Sahiplenilen dosyalar` bağlayıcıdır.** Orada yazmayan dosyaya yazılmaz, okunur.
3. **Ölçüde nihai otorite `referans/Bahsedilmeler.dc.html` inline `style` değeridir**, SPEC değil.
   Çelişki çıkarsa HTML kazanır ve sapma rapora yazılır.
