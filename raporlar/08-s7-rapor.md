# Ş7 — Sunucu profili paneli raporu

## Sonuç

- 326 px geniş masaüstü profil kolonu uygulandı; sol ray, 228 px gezinme ve kullanıcı barı değiştirilmedi.
- 54 px sunucu tile'ı profil bloğu içinde normal akışta; negatif margin ve halka yok.
- İstatistikte `voiceRoomCount` kullanılıyor; `voiceActiveCount` kullanılmıyor.
- Tanıdıklar avatar yığını değil, ayrı satırlar. Satırın tek interaktif kökü `UserProfilePopover`; nested buton yok.
- Profil sorgusu, yükleme/hata/cached-data durumu, Esc kapanışı, açan öğeye odak dönüşü ve join/leave callback bağlantısı tamamlandı.
- Geniş ekranda `Tab` odak tuzağı yok. `<1100px` overlay davranışı Ş9 kapsamına bırakıldı.
- `Paylaş`, exact `inviteAddress` değerini Clipboard'a yazar; eksik Clipboard/rejection güvenli hata toast'ına çevrilir. Adres `null` ise buton pasif ve açıklamalıdır.
- Kanal satırından açılışta profil yüklenirken sunucu adı/kategorisi/baş harfleri kanal verisinden gösterilir.

## Dosyalar

- `apps/web/src/components/discover/server-profile-panel.tsx`
- `apps/web/src/components/discover/server-profile-panel.test.tsx`
- `apps/web/src/components/discover/server-profile-stat.tsx`
- `apps/web/src/components/discover/server-profile-mutual-row.tsx`
- `apps/web/src/components/discover/discover-page.tsx`
- `apps/web/src/components/discover/discover-page.test.tsx`
- `apps/web/src/lib/locale/messages/tr.ts`
- `apps/web/src/lib/locale/messages/en.ts`

## Doğrulama

- `node --import tsx --test --test-force-exit src/components/discover/server-profile-panel.test.tsx src/components/discover/discover-page.test.tsx`: **PASS — 19/19**.
- Görev dosyalarında ESLint: **PASS**.
- Görev TSX/TR dosyalarında Prettier check: **PASS**.
- `pnpm --filter @wizards/web typecheck`: **FAIL**. Ş7 dosyalarında hata yok; mevcut eşzamanlı Discover route/style testleri ve Events WIP tip hataları kapıyı kırıyor.
- `pnpm --filter @wizards/web lint`: **PASS**; ESLint config kontrolleri **10/10**, ardından `eslint .` temiz.
- `pnpm --filter @wizards/web test`: **FAIL**. Ş7 dışı mevcut hatalar arasında API route body sözleşmesi, Discover channel/event scale sözleşmeleri, Events counts URL sözleşmesi ve DM token bütçesi bulunuyor. Ş7 odaklı suite yeşil.
- Bağımsız kod incelemesi: **PASS**; açık Critical/Important bulgu yok.
- `graphify update .`: **PASS**; ilk Windows `Errno 22` denemesi sonrası güvenli retry `Code graph updated` ile tamamlandı.

## Sınır / takip

- `TODO(api)`: Profil ucu yalnız public kanalları garanti edene kadar `isPrivate` kanallar istemcide de süzülüyor.
- Tam repo kapısı, yukarıdaki eşzamanlı WIP hataları düzelmeden yeşil sayılamaz.
- Commit oluşturulmadı.
