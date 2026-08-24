# Keşfet Dalga 2 · Ş6 raporu

Tarih: 2026-08-21
Dal: `uat`
Commit: `NOT RUN` (istenmedi)

## Sonuç

Ş6 kapsamındaki dört saf sunum kartı, ortak kategori/presence parçaları, şerit düzeni ve altı
kartlık skeleton uygulandı. Sol ray, navigasyon paneli ve kullanıcı barına dokunulmadı.

- Kart kökleri `<article>`; kart açma ve tüm eylemler gerçek `<button>`.
- Kart açma düğmesi `::after { position: absolute; inset: 0 }` deseniyle klavye erişilebilir.
- Sunucu, kişi, kanal ve etkinlik eylemleri yalnız prop callback çağırıyor; `fetch` ve router yok.
- Hiçbir kartta `BadgeCheck` veya mavi doğrulama ikonu yok.
- Sunucu kenarı `selected > joined > default`; kategori `null` tonu `--primary`.
- Kişi ortak şeridi ve etiket satırı yalnız veri varsa çiziliyor; gönderilmiş istek pasif.
- Kanal hareket tonlarının altı da eşlendi; avatar yığını dekoratif.
- Etkinlik zamanı bugün/yarın/7 gün/uzak biçiminde `Intl.DateTimeFormat` ile üretiliyor.
- `DiscoverGrid`: kartlarda auto-fill ızgara, kanallarda tek kolon; kişilerde sentinel yok.
- Skeleton aktif şeridin dilini taklit eden tam 6 kart, tek canlı duyuru ve `aria-busy` taşıyor.
- Değişken kart yüksekliği + 24 kayıt/sayfa nedeniyle sanallaştırma yapılmadı; `memo` ve
  `content-visibility: auto` kullanıldı.

## Dosyalar

- `apps/web/src/components/discover/discover-server-card.tsx` ve testi
- `apps/web/src/components/discover/discover-person-card.tsx` ve testi
- `apps/web/src/components/discover/discover-channel-row.tsx` ve testi
- `apps/web/src/components/discover/discover-event-card.tsx` ve testi
- `apps/web/src/components/discover/discover-grid.tsx` ve testi
- `apps/web/src/components/discover/discover-card-skeleton.tsx`
- `apps/web/src/components/discover/discover-presence-dot.tsx`
- `apps/web/src/components/discover/discover-category-tile.tsx`

## Doğrulama

- `PASS` — Ş6 odak testleri: 7 suite, 35 test, 35 geçti, 0 başarısız.
- `PASS` — Ş6'ya ait 13 dosyada hedefli ESLint.
- `PASS` — Ş6'ya ait 13 dosyada Prettier.
- `FAIL` — tam web typecheck. Son koşumda Ş6 dışındaki eşzamanlı Etkinlikler işi; eksik
  `events-service`, `density`, `presentation`, `reminder-scheduler` modülleri; eksik client
  exportları/query anahtarları; `exactOptionalPropertyTypes`, örtük `any` ve
  `ScheduledEventRsvpStatus` DB export hataları üretti. Ş6 dosyası hata listesinde yok.
- `FAIL` — tam web lint. Yapılandırma testleri 10/10 geçti; Ş6 dışındaki eşzamanlı
  `src/lib/events/detail-service.ts:24` kullanılmayan `RoleRecord` nedeniyle repo linti kaldı.
- `ENV BLOCKED` — tam web test koşumu aynı çalışma alanındaki dört eşzamanlı tam koşumla
  yarıştı ve süresiz test zaman aşımı ayarı (`--test-timeout=0`) altında 10+ dakika ilerleme
  üretmeden tek worker'da askıda kaldı; yalnız bu görevin koşumu durduruldu. Ş6 odak test kapısı
  bundan bağımsız olarak yeşil.
- `FAIL` — `graphify update .`: AST taraması tamamlandı; Windows'ta
  `[Errno 22] Invalid argument: 'graphify-out\\.graphify_root'`. Doğrudan Python modülüyle
  tekrar aynı hatayı verdi. Güncel graph içinde sekiz Ş6 üretim dosyasının sekizi de bulundu.

## Sapma ve devir notları

- SPEC §7 uyarınca `Katıl` düğmesinin ikinci tıkı ayrılma callback'ini doğrudan çağırıyor.
  Keşfet kartında onay yok; bu sapma Ş10 kabulünde kullanıcıya sorulmalı.
- Etkinlik kartında `TODO(etkinlikler): ortak EventCard'a çıkar` devir notu bırakıldı.
- Faz 0 sözlüğünde etkinlik türü, kanal günlük hareket eki ve genel skeleton duyurusu için
  anahtar yoktu. Ş6 dosya sahipliği locale dosyalarını kapsamadığından TR/EN sunum metni
  bileşen içinde sınırlandı; sözlük birleştirmesi sonraki entegrasyona devredildi.
- Ş5'in `DiscoverPage` render yuvası korundu; Ş6 sahiplik sınırı nedeniyle sayfa dosyası
  değiştirilmedi.
