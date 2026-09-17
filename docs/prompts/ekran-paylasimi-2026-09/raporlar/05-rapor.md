# Ş4 — LiveKit yetki ve işletim — 2026-09-17

## Uygulama

- Hosting/secret konumları, rotasyon, Cloud TURN doğrulama protokolü, Redis şeması ve 4K egress hesabı `docs/operations/livekit-hosting.md` içinde.
- `emptyTimeout: 300`, `departureTimeout: 20`; mevcut katılımcı sınırı korunur.
- Kanal token'ında SCREEN_SHARE/SCREEN_SHARE_AUDIO yalnız STREAM yetkisiyle verilir. CONNECT çözümünün mevcut permission sonucu kullanılır. DM paylaşımı açık; web ve mobil ortak token üreticisini kullanır.
- Yetki değişiminde `updateParticipant` ile kaynak listesi güncellenir; socket STREAM kontrolü kalır. Güncelleme hatasında mevcut participant removal yolu denenir.
- Güvenlik sınırı: SFU erişilemiyorsa hem grant güncellemesi hem uzaktan katılımcı çıkarma başarısız olabilir. Yerel state temizliği uzaktaki medyanın kesin kesildiğine kanıt değildir; hata loglanır. Kalıcı retry sistemi eklenmedi.

## Kanıt ve açık bilgiler

Grant matrisi (kanal/DM × STREAM), oda seçenekleri ve updateParticipant çağrısı testleri PASS. Gerçek medya yerel izole LiveKit'te doğrulandı; Cloud yetki revokasyonu/ağ kabulü sayılmaz.

Kullanıcı Cloud proje/bölge ve Railway servis adlarını şimdilik bırakmayı istedi. Bu alanlar BİLİNMİYOR kaldı; tahmin edilmedi. Cloud TURN/TLS 443 ve UDP kapalı ağ testi NOT RUN. Firewall değişikliği, secret değişikliği, deploy veya canlı flag açılması yapılmadı.

4K60 motion yaklaşık 24 Mbps × 5 izleyici = 54 GB/saat egress. Fiyat yazılmadı. Üretim 4K flag'i açılmadı. Ortak kapı sonuçları `00-devam-durumu.md` içinde.
