# Faz 2 Uygulama Planı: Aktif Oturumlar ve Cihazlar

> Durum: teknik yaklaşım kullanıcı tarafından 2026-08-13 tarihinde onaylandı.

## 1. Sözleşme ve kalıcı model

- `@wizards/types` içine ortak, strict oturum liste/iptal şemaları ekle; yanlış enum, tarih ve fazla alanları reddeden testleri önce yaz.
- Prisma'ya `AuthSession` ilişkisi, indeksleri ve rebaseline migration ekle; şema sözleşme testini önce kırmızı çalıştır.
- Token, ham IP ve User-Agent alanı ekleme.

## 2. Oturum servisi ve kimlik bağlama

- Bağımlılıkları enjekte edilebilir `auth-session-service` oluştur; ensure/touch, liste, aktiflik, tekli iptal ve diğerlerini iptal davranışlarını test-first geliştir.
- Web JWT'ye tahmin edilemez `authSessionId` bağla; session'a yalnız sunucu içi/current bağlam için aktar.
- Mobil mevcut `sid` değerini kullan; bootstrap ve oturum API'sinde eski oturumu kaydet.
- DB iptal kontrolünü web revocation penceresine ve mobil bearer kontrolüne bağla; Redis mobil aile temizliğini ikincil tut.

## 3. HTTP yüzeyi

- Paylaşılan route mantığını 401/404/sahiplik/current/çoklu iptal testleriyle geliştir.
- Web/desktop ve mobil adapter route'larını ekle.
- Yanıtları ortak şemayla üret; `Cache-Control: no-store` kullan.

## 4. Web ve desktop arayüzü

- İstemci fetch/mutation katmanı ve sorgu anahtarını ekle.
- Güvenlik kartına loading/error/empty/list/current durumları, satır onayı ve diğerlerini kapatma onayı ekle.
- Desktop aynı web yüzeyini kullandığı için ayrı veri akışı oluşturma; istemci türünü kartta görünür kıl.

## 5. Mobil arayüz

- Mobil client/query katmanı ve hesap-scope cache anahtarı ekle.
- Aktif cihaz özetini gerçek liste/detail sheet/destructive confirm akışına dönüştür.
- Mevcut oturum iptalinde `onSignOut`; diğer oturumda yalnız cache yenileme çalıştır.
- Sahte veri dışa aktarma önizlemesini kaldır.

## 6. Doğrulama

- Önce odaklı kırmızı/yeşil testleri, sonra types/web/mobile typecheck ve ilgili component testlerini çalıştır.
- Prisma validate/generate ve migration sözleşmesini çalıştır; canlı migration uygulama.
- Graphify incremental update çalıştır.
- Web/desktop tarayıcı runtime ve Android/iOS cihaz/görsel kabul yapılmadıysa ayrı `NOT RUN` bildir.

## Teslim sınırı

Bu çalışma mevcut kirli `uat` çalışma ağacında Faz 1 değişikliklerinin üstüne uygulanır. Kullanıcı onayı olmadan commit, push, deploy veya canlı migration yoktur.
