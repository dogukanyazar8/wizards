# Ş2 — Web izleyici — 2026-09-17

## Uygulama

- Paylaşım video bileşeni ayrıldı; contain/cover, 1–4x zoom, merkez/işaretçi odağı, sınırlandırılmış pan ve sıfırlama eklendi.
- Kullanıcı kararı: çift tık mevcut sahneyi tam ekran yapar. Ctrl+tekerlek ve sahne odaklı +/−/0 yakınlaştırır; V fit, F tam ekran. Kontrollerde çift tık sahneye taşınmaz.
- Native PiP ve Document PiP capability kontrolüyle görünür. Pop-out portal kullanır; kapatılınca track ana pencereye bağlanır. Video sessizdir; paylaşım sesi mevcut provider tarafından çalınır.
- İki paylaşımda aktif sahne ve küçük resimler; aktif paylaşımın küçük resmi sahnenin kalite tavanını düşürmez. DM fiziksel boyuta göre katman seçer; AV1 4K decode smooth değilse katman düşürür. Kanal adaptive stream korunur.
- İzleyici sayısı, yerel sıfır izleyici metni, Go Live başlığı için renderer hazır. Go Live yayın üretimi Ş5 kapsamındadır.
- Global bar `AuthenticatedAppProviders` içindeki VoiceProvider/DMCallProvider altında bir kez takılır. Aktif kanal/DM rotası dışında paylaşım sürerken kaynak değiştir/durdur, sayı ve reconnect durumu gösterir.

## Kapanış düzeltmeleri

- Yeni bar E2E'sindeki tam sayfa yenileme uygulama içi kanal geçişine çevrildi; canlı oturum korunarak test edilir.
- Gerçek E2E, eski shell restore efektinin `/messages` geçişini iptal ettiğini gösterdi. `/messages/page.tsx` boş sohbet görünümü sözleşmesine aykırı efekt ve kullanılmayan state okumaları kaldırıldı. Mevcut sunucuya dönüş testleri aktif ses, son metin kanalı ve ses sonrası ilk kanal davranışlarını doğruladı.
- Yakınlaştır/uzaklaştır kısayol etiketleri düzeltildi; sunucu sahnesinin çift tık callback'i mevcut fullscreen hedefine bağlandı.

## Kanıt ve sınır

UI/realtime: 25 PASS, 1 SKIP, 0 FAIL. Atlanan test native PiP'in görünür OS penceresi gerektirmesidir. Viewport/PiP/katman/sahne birim testleri geçti. Diğer sonuçlar `00-devam-durumu.md` içindedir.

WebView2 Document PiP elle doğrulanmadı; sürüm kanıtı yok. Firefox gerçek tarayıcı testi çalıştırılmadı; capability matrisi birim testinde API bulunmayan PiP/pop-out düğmeleri kapalıdır. Bu sonuç görsel parity veya fiziksel cihaz kabulü değildir.
