# LiveKit hosting

2026-09-17: kullanıcı doğrulaması: üretim ve UAT medya altyapısı LiveKit Cloud. Docker LiveKit yalnız yerel geliştirme/test içindir.

| Alan                                         | Durum                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Cloud proje adı, bölge(ler)                  | BİLİNMİYOR — kullanıcı doğrulayacak                                        |
| UAT/prod Railway servis adları               | BİLİNMİYOR — kullanıcı doğrulayacak                                        |
| LIVEKIT_URL / NEXT_PUBLIC_LIVEKIT_URL konumu | Railway servis env; servis/env kapsamı BİLİNMİYOR — kullanıcı doğrulayacak |
| LIVEKIT_API_KEY / LIVEKIT_API_SECRET         | Railway secret env; değerler belgeye yazılmaz, mevcut kapsam BİLİNMİYOR    |
| LIVEKIT_RTC_REGION_ENDPOINTS                 | Sunucu allowlist bölge uçları; Cloud proje eşlemesi BİLİNMİYOR             |
| TURN/TLS 443 runtime kanıtı                  | NOT RUN — Cloud test oturumu ve UDP kapalı ağ doğrulaması gerekli          |

Rotasyon: Cloud konsolunda yeni anahtar üret; ilgili Railway servislerinin secret env değerlerini değiştir; kullanıcı onayıyla yeniden dağıt; yeni token bağlantısını doğrula; eski anahtarı iptal et. Mevcut bir saatlik tokenları ve aktif oturumları hesaba kat. Anahtarları log/rapora kopyalama.

TURN: Cloud yönetir, yerel TURN config yazılmaz. Kontrollü test cihazında UDP kapalı ağdan web ve WebView2 bağlantısı açılır. Seçili candidate-pair'in local/remote candidate tipi, relayProtocol/protocol ve süre kaydedilir; IP, token veya SDP kaydedilmez. Test sonunda kural kaldırılır. Bu çalışma kullanıcı makinesine firewall kuralı eklemedi.

Cloud audio observer sunucu ayarı uygulama tarafından değiştirilemez; speaking ring istemci ses ölçümünü kullanır. Yerel audio ayarı Cloud'a uygulanmış sayılmaz.

Odalar: emptyTimeout 300s, departureTimeout 20s, mevcut maxParticipants korunur. STREAM izni kanal grant kaynaklarını belirler; DM paylaşımı açık. İzin kaldırılınca mevcut katılımcı grant güncellenir; socket STREAM kontrolü korunur.

Redis: voice:screenshare:<channelId>:<sharerUserId> yayın işareti 120s; voice:screenshare:watchers:<channelId>:<sharerUserId> SET kullanıcı kimlikleri 120s TTL. Görünen izleyici 60s heartbeat; stop/leave/disconnect temizliği. Fanout sayı ve en fazla 5 örnek, yalnız yetkili kanal odalarına. Analytics izleyici kimliklerini almaz; desktop snapshot yalnız sayı alır.

Egress GB/saat ≈ yayın Mbps × izleyici sayısı × 3600 / 8000. 24 Mbps × 5 kişi ≈ 54 GB/saat. Cloud fiyatı BİLİNMİYOR — kullanıcı dolduracak. 4K üretimde kapalı kalır; maliyet ve donanım kabulünden sonra açılır.
