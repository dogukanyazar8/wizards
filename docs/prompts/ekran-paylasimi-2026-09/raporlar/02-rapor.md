# Ş1 — Encoder, mod ve 4K — 2026-09-17

## Uygulama

- Oturum başına codec probe: donanım AV1 > VP9 > H264; yazılım text VP9, motion H264; probe yok/reddedilirse VP9 ve donanım bilinmiyor. Seçim Room anahtarlı WeakMap içinde tutulur; oturum ortasında codec değişmez.
- Presetler ortak `@wizards/types` tablosundan gelir. AV1/VP9 SVC, H264 kaynak boyutundan türetilen simulcast kullanır. Yeni bağımlılık yok.
- Yakalama kullanıcı etkileşimi sırasında başlar; codec probe yakalamadan sonra beklenir. İptal/yetki/oda değişimi yayın öncesi yeniden kontrol edilir; boşa çıkan track'ler durdurulur.
- Ayarlar çözünürlük/FPS/text-motion eksenlerini değiştirir. Canlı güncellemeler sıraya alınır; gönderici parametreleri korunur. Başarısız ayar paylaşımı kapatmaz.
- 4K: mevcut feature-flag servisi `screenShare4k`, fiziksel ekran boyutu ipucu ve 2160p donanım probu birlikte gerekir. Flag yok/kapalıysa seçenek gizli. Yakalama daha küçükse etkin preset düşer, tercih korunur ve fallback etiketi görünür.
- Çözünürlük yükseltme kaynak yeniden seçimi gerektirir. Düşürme canlı uygulanır. UAT/prod flag kaydı oluşturulmadı; canlı konfigürasyon değiştirilmedi.
- Mod değişimi başarı/hata ve süre bilgisi mevcut `client-health` endpoint'ine `mode_change` olarak gider. Ayrı endpoint açılmadı. Encoder sınıfı probun tahmini yerine gerçek RTP raporundan gelir. Kullanıcı/izleyici kimliği, pencere başlığı ve hata yığını bu olayda yok.
- Kurulu LiveKit 2.22.3, SVC screen share yayınında istenen `L3T3_KEY` değerini `L1T3` ve contentHint'i `motion` yapabilir (`LocalParticipant.ts`). SDK'nın Chrome performans düzeltmesi başlangıçta zorla geri alınmadı. Bu nedenle telemetri kullanıcı modunu önceki tercihle karşılaştırır; başlangıçta text seçili olması SDK hint'inin detail kalacağını garanti etmez. Degradation tercihi ve canlı mod değişimi ayrı uygulanır.

## Geçiş sınırı

Eski üç seçenekli `ScreenShareQualityId` geçici uyumluluk için kaldı: voice-context/provider API, E2E provider, room primitives kalite menüsü, voice-channel-view etiketi, store migration ve eski helper. Yeni ayar sekmesindeki ayrı çözünürlük/FPS/mod seçicileri gerçek yayın yoluna bağlıdır.

## Kanıt ve açık kabul

Codec matrisi, capture factory temizliği, sender alanlarının korunması, 4K kapısı ve health payload testleri geçti. Ortak yerel kapı sonuçları `00-devam-durumu.md` içindedir.

Gerçek LiveKit ile 2160 piksel yayını doğrulandı; testte ekran boyutu ve donanım probu simüle edildi. Fiziksel NVIDIA/Intel iGPU/dizüstü donanım karşılaştırması ve 1080p60 performans kabulü YAPILMADI. Yazılım headless sonucu donanım performansı sayılmaz. Uzak nightly/netem çalıştırılmadı.
