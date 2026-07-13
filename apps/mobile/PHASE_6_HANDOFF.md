# Whispr Mobile — Faz 6 devir notu

## Korunacak Faz 5 sınırları

- Kamera ve mikrofon yalnız kullanıcı eylemiyle açılır; uygulama arka plana geçtiğinde kamera/screen-share yayınları durur.
- Audio device enumeration yalnız bounded ID'ler taşır. Etiketler UI dışına, loga, query key'e veya storage'a çıkmaz.
- NetInfo durumu memory-only'dir. Offline non-GET istekler token/fetch öncesi durur; offline queue ve query persistence yoktur.
- `MobilePrivacyShield`, app-lock tercihinden bağımsızdır ve AppState aktif değilken tüm içeriği opak biçimde örter.
- Performans kanıtı FlashList 2 `onLoad` ve startup süresini bounded/PII-free memory snapshot olarak tutar; kullanıcı veya mesaj kimliği eklenmez.

## Ertelenen ürün kapsamı

- Rol CRUD + izin hiyerarşisi mobilde ertelendi. Mevcut rol atama/kaldırma ve kick authz sınırları servis katmanında aynen korunur.
- Role create/update/delete, permission matrix, hierarchy/reorder ve kanal permission override mobilde yoktur.
- Kanal/kategori sıralama arayüzü (channel/category reorder UI) ertelendi.
- Offline yazma kuyruğu (offline queue) bilinçli olarak yoktur.
- Çok katılımcılı video yerleşimi ve adaptif optimizasyon (group video layout) mevcut bounded kamera grid'inin kapsamı dışındadır.

## Sonraki uygulama sırası

1. UAT performans kanıtlarını release budget hedefleriyle gerçek iOS/Android cihazlarda ölç ve release evidence'a yalnız aggregate değer ekle.
2. Ürün kararı verilirse group video layout'u pagination/active-speaker odaklı tasarla; kamera tile sınırını izinsiz büyütme.
3. Offline queue istenirse yeni bir tehdit modeli, idempotency anahtarı, kullanıcıya görünür pending state ve açık opt-in migration planı olmadan başlamayın.
4. Rol CRUD veya permission hierarchy istenirse web servis authz testlerini, Zod/rate-limit mobile route'larını ve hierarchy denial senaryolarını birlikte genişletin.

Faz 5 uygulama ve doğrulama ayrıntıları için `MIGRATION_PHASE_5.md` tek kapanış kaydıdır.
