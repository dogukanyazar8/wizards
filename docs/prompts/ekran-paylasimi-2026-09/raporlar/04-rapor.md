# Ş3 — İzleyici sayısı — 2026-09-17

## Uygulama

- `voice:screenshare:watch`: 20/dakika, oda katılımı ve CONNECT yetkisi kontrolü, kendini izleme reddi. Aktif paylaşım kontrolü ve SET değişimi tek Redis Lua işlemi; stop sonrası watcher seti yeniden üretilemez.
- SET `voice:screenshare:watchers:<channelId>:<sharerUserId>`, TTL 120s. Görünen izleyici 60s heartbeat; yinelenen SADD fanout üretmez. Stop, leave ve socket disconnect temizliği var.
- Fanout SCARD sayı ve en çok 5 örnek; yetkili kanal katılımcıları/izleyicileri. Yeniden katılan istemci ilk voice-state snapshot'ında sayıyı alır; Redis sayıları pipeline ile okunur.
- Sidebar, sahne, global bar, masaüstü mini/overlay sayaçları bağlı. Snapshot yalnız sayı ve yerel paylaşım durumu taşır; eski snapshot parse edilir. Rust dosyası değişmedi.
- Mobil contract/parser/cache watcher olayını işler. Yeni snapshot sayısı eski cache tarafından ezilmez; alan eksikse eski istemciyle uyumluluk korunur. Mobil yeni görünüm Ş7 kapsamındadır.

## Kanıt ve sınır

Handler guard/rate/no-op, heartbeat fake timer, eski desktop snapshot ve mobil yeni/eski/sıfır sayaç regresyonları geçti. İzole Redis üzerinde Lua aktif paylaşım/idempotence/TTL/örnek sınırı/stop yarışı kontrolü geçti. Gerçek LiveKit iki istemcide sahne sayısı 1 doğrulandı. Toplu sonuçlar `00-devam-durumu.md` içinde.

SET kullanıcı bazlıdır; sekme başına referans sayacı eklenmedi. Çoklu sekme ayrıntısı ve mobil izleyicinin gesture/görünürlük davranışı bu şeritte genişletilmedi. Overlay gerçek Tauri penceresinde henüz ölçülmedi.
