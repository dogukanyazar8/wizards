# Profil alanları — 10 Eylül 2026

Bu kayıt önceki profil analizlerindeki biyografi ve özel durum eksiklerini günceller. Web ve Tauri aynı ayarlar bileşenlerini kullanır.

## Uygulananlar

- Profil kartındaki avatarın zemini opak. Banner rengi avatarın içinden görünmez. Durum noktası avatar genişliğindeki kapsayıcının sağ altına bağlı. Kartın yuvarlak köşeleri ve banner kırpması korunur.
- Zamir alanı profil arayüzünden, okuma/yazma şemalarından, Prisma modelinden, veri dışa aktarma ve veri erişim kodundan kaldırıldı. Tarihsel SQL kayıtları değiştirilmedi.
- `packages/types/src/profile.ts` ortak biyografi yazma sınırını **250**, durum metnini **128**, emoji alanını **16 UTF-16 kod birimi** olarak tanımlar. Web ve mobil aynı doğrulama şemasını kullanır. Önceden kaydedilmiş 251–500 karakterlik biyografiler okunabilir; otomatik kesilmez. Yeniden biyografi kaydı yeni sınıra tabidir.
- Web/masaüstünde biyografi, özel durum, gerçek Unicode emoji seçimi/kaldırma ve süre ayarları yetkili sunucu eylemine bağlı. Profil verisi yüklenmeden kontroller kapalı; hata halinde tekrar deneme bulunur.
- Web ve mobil süre seçenekleri: **30 dakika, 1 saat, 4 saat, gün sonu, ben temizleyene kadar**. Metin/emoji düzenleme mevcut bitiş zamanını uzatmaz. Temizleme metin, emoji ve bitiş zamanını tek profil yazısında siler.
- Açık profil sorguları süre dolumunda yenilenir; mevcut profil güncelleme olayı önbellekleri yeniler. Sunucu profil okumaları ve süre bilgisi taşıyan Redis kayıtları dolmuş durumları gizler. Görünmezlik ve durum görünürlük tercihleri profil yayınlarında korunur.

## Veritabanı

`packages/db/prisma/migrations/20260910170000_remove_profile_pronouns/migration.sql` hazır. **Uygulanmadı.** Uygulandığında mevcut zamir verilerini kalıcı siler. Prisma istemcisi yeni şemayla üretildi; bu işlem veritabanına bağlanmaz. Kolon fiziksel olarak migration uygulandığında kalkar.

## Doğrulama sınırı

- Prisma istemcisi üretimi başarılı.
- `graphify update .` başarılı; kod haritası güncellendi.
- İlgili kaynaklar Prettier ile biçimlendirildi; `git diff --check` temiz.
- Ortak sınırlar, süre dolumu, uzun açık kalan mobil düzenleyici, atomik durum temizleme, dar kapsamlı profil yazısı ve avatar geometrisi için regresyon senaryoları eklendi/güncellendi.
- **Testler, typecheck, build, tarayıcı/Tauri/mobil cihaz kontrolleri çalıştırılmadı.** Kullanıcı test edecek. Kaynak incelemesi çalışma zamanı veya görsel kabul kanıtı değildir.
- Commit, push, deploy ve veritabanı migration uygulaması yapılmadı.

## 11 Eylül — durum emojisi satırı

- Emoji satırı ortak `SettingsRow` başlık, boşluk, dar ekran ve kontrol hizasını kullanır. Tetikleyici komşu seçicilerle aynı ölçüdedir; kaldırma düğmesi seçici penceresinin içindedir.
- Emoji verisi ve Türkçe/İngilizce çevirileri yerel paketten yüklenir; seçici için CDN çeviri isteği gerekmez. Yükleniyor, hata ve tekrar deneme durumları eklendi.
- Modal odak dolaşımı açık Shadow DOM içindeki kontrolleri kapsar. Seçiciden Escape yalnız seçici penceresini kapatır, odağı tetikleyiciye döndürür.
- Hizalama, CDN erişimi kapalı seçim, Tab/Shift+Tab, Escape ve kaldırma regresyon senaryoları eklendi. Biçimlendirme ve diff kontrolü başarılı; testler, build ve cihaz/görsel kontrolü çalıştırılmadı.

## 11 Eylül — birleşik özel durum ve çoklu emoji

- Web/masaüstünde ayrı durum emojisi satırı kaldırıldı. Özel durum metni ve emoji düğmesi aynı kontrol içinde; mevcut `ps`/`pe` kayıt anahtarları ve değişiklikleri geri alma davranışı korunur.
- Profil seçicisi ağır widget yerine yerel, önbelleklenen katalog ve sayfa başına en fazla 72 emoji düğmesi kullanır. Tetikleyicide ön yükleme, arama, kategori, sayfalama, yükleme hatası ve tekrar deneme bulunur. Bu değişiklik kaynak düzeyinde çizilen öğe sayısını sınırlar; çalışma zamanı performans ölçümü yapılmadı.
- Web ve mobil profil düzenleyicilerinde seçim pencereyi kapatmadan emojileri ekler. Ortak emoji alanı sınırı artık **64 UTF-16 kod birimi**; bu sayı emoji adedi değildir. Ekleme uzun bir emoji dizisini ortasından kesmez. Web seçicisi tek tek ve toplu kaldırma, mobil seçiciler toplu temizleme sunar. Mobil sohbet seçicisinin mevcut tek seçimde kapanma davranışı korunur.
- Ayarlar sol kullanıcı alt çubuğu ile kaydedilmemiş değişiklikler çubuğu ortak 64 px tasarım yüksekliğini kullanır; yükseklik mevcut ölçekleme yardımcılarıyla uygulanır.
- Çoklu seçim, ortak sınır, katalog önbelleği, geri alma, odak ve alt çizgi hizalama regresyon senaryoları eklendi/güncellendi. Testler, typecheck, build ve cihaz/görsel kontrolleri kullanıcıya bırakıldı; çalıştırılmadı. Bu düzeltmeler yeni migration gerektirmez.
- Bu turda Prettier ve `git diff --check` başarılı. `graphify update .` AST çıkarımını bitirdi ancak `.graph.tmp.json` → `graph.json` değişiminde `[WinError 5] Erişim engellendi` ile başarısız oldu; kod haritası güncel kabul edilmemeli.
