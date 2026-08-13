# Profil ve Presence Görünürlüğü — Faz 3 Tasarımı

## Durum

- Ana beş fazlı tasarım kullanıcı tarafından onaylandı.
- Faz 3 geliştirme başlangıcı kullanıcı tarafından onaylandı.
- Web yüzeyi Tauri desktop tarafından da kullanılır; web davranışı desktop runtime sözleşmesidir.

## Amaç

`profileVisibility` ve `presenceVisibility` tercihlerini yalnız saklanan değer olmaktan çıkarıp backend tarafından merkezi uygulanan, web/Tauri ve mobile tarafından aynı API değerleriyle yönetilen gerçek gizlilik özelliklerine dönüştürmek.

## Politika

### Ortak üstünlük sırası

1. Hesap sahibi kendi profilini ve presence bilgisini görebilir.
2. İki yönden birinde block varsa dış izleyici profil/presence içeriğini göremez.
3. `INVISIBLE`, dış izleyici için her zaman `OFFLINE` kabul edilir; custom status ve last-seen yayınlanmaz.
4. Tercih değerlendirilir:
   - `EVERYONE`: mevcut ürün ilişki bağlamındaki kimliği doğrulanmış izleyici.
   - `FRIENDS`: yalnız kabul edilmiş arkadaş.
   - `NOBODY`: yalnız hesap sahibi.

`EVERYONE`, global public presence yayını oluşturmaz. Presence fan-out yalnız mevcut friend ve shared-server odalarına gider.

### Merkezi servis

`apps/web/src/lib/privacy/visibility-policy.ts` tek karar katmanıdır.

- Saf `evaluateVisibilityPolicy` bir subject için profile/presence kararını verir.
- `resolveVisibilityDecisions` bir viewer ve subject listesi için ayarları ve ilişki satırlarını iki bounded DB sorgusuyla batch okur.
- `profileVisibilityWhereForViewer` search/suggestion sorgularının görünmez adayları DB'de elemesini sağlar.
- `redactPresenceForViewer` yetkisiz veya invisible presence değerini `OFFLINE`, `customStatus=null`, `lastSeenAt=null` olarak daraltır.
- Ayar satırı yoksa Faz 1 DB default'uyla uyumlu olarak `EVERYONE` kullanılır.

## Profil veri yolları

- Web `/api/v1/users/[userId]/profile`: block veya profile policy reddinde varlık bilgisi sızdırmayan `404`.
- Mobile user profile service: block için mevcut strict-contract restricted payload korunur; block yokken profile policy reddinde `404`.
- User search: merkezi Prisma where ile görünmez adaylar sorguya girmez.
- Friend suggestions: aynı where ile görünmez adaylar aday havuzuna girmez.
- Kabul edilmiş friend listesi kimlik satırını korur; bu liste profil okuma/search/suggestion değildir. Profil detayına geçiş yine merkezi profile policy'den geçer.

## Presence veri yolları

- Friends list/query, DM participant/conversation, server member list ve mobile profile payload merkezi karar sonrası serialize edilir.
- Yetkisizde presence dot `OFFLINE`; `customStatus`, `lastSeenAt`, device ve voice room bilgisi `null`.
- Socket fan-out:
  - `NOBODY`: yalnız `user:<self>`.
  - `FRIENDS`: self + kabul edilmiş friend user odaları.
  - `EVERYONE`: self + friend user odaları + shared server odaları.
  - Block ilişkili user odaları `except(...)` ile dışlanır.
- Preference PATCH sonrası mevcut presence tekrar broadcast edilir; çoklu cihazlar aynı server değerine yakınsar.
- Friends/server audience cache mevcut TTL ve invalidation davranışını korur. Preference değişimi karar okumasını doğrudan DB'den yaptığı için stale policy cache eklenmez.

## Web ve Desktop UI

- Gizlilik kartına `Profil görünürlüğü` ve `Çevrimiçi görünürlüğü` select satırları eklenir.
- Değerler: `Herkes`, `Arkadaşlar`, `Hiç kimse`; her biri etkisini açıklayan locale metni kullanır.
- Mevcut React Query optimistic update korunur. Hata önceki server snapshot'ını geri yükler; erişilebilir inline hata gösterilir.
- Mutation pending sırasında iki kontrol disabled/busy olur.
- Tauri aynı web bundle ve API sözleşmesini kullanır; ayrıca native değişiklik yoktur.

## Mobile UI ve legacy geçiş

- Account settings gizlilik kartına aynı iki server-backed satır eklenir.
- Seçim mevcut erişilebilir `OptionSheet` ile yapılır; açıklama ve seçili durum görünür.
- Yeni React Query kaynağı `/api/v1/mobile/account/preferences` cevabıdır.
- Başarılı ilk server GET sonrasında legacy AsyncStorage profile/presence anahtarları silinir.
- Legacy değerler hiçbir koşulda server'a yazılmaz.
- Fetch başarısızsa legacy anahtarlar korunur. Mutation hata verirse optimistic değer rollback olur ve kalıcı başarı gösterilmez.

## Güvenlik ve hata davranışı

- Profil policy reddi `404`; policy değeri/log içeriği response'a eklenmez.
- Presence redaction serialization öncesi server'da yapılır. UI gizleme güvenlik sınırı değildir.
- Block iki yönlü değerlendirilir.
- Yetkisiz payload custom status, emoji, expiry, last-seen, device veya voice room taşımaz.
- Redis arızasında mevcut presence okuması `OFFLINE`'a düşer; görünürlük kararı DB'den fail-closed uygulanır.

## Performans

- Liste yüzeyleri subject ayarları ve ilişkileri batch okur; satır başına sorgu yoktur.
- Search/suggestion görünürlük filtresi DB where içine girer.
- Socket fan-out server odalarını kullanır; shared-server üyelerini Node belleğine yüklemez.
- Yeni cache veya index eklenmez. Mevcut unique `UserSettings.userId` ve friendship/server membership indeksleri kullanılır.

## Test ve kabul

- Policy unit: self, everyone, friends, nobody, block, missing settings.
- Presence redaction: denied ve invisible durumunda status/custom status/last-seen sızıntısı yok.
- Search/suggestion: hidden aday görünmez.
- Profile: web/mobile allow/restricted/not-found.
- Socket: audience seçimi, block exclusion, invisible redaction.
- Friends/DM/server payload: custom status ve zaman bilgisi sızmaz.
- Web component: iki gerçek select, pending, rollback/error.
- Mobile component/client: iki sheet, server value, optimistic rollback, başarılı GET sonrası legacy cleanup.
- Web/mobile typecheck ve odaklı testler; desktop runtime smoke ve gerçek cihaz/görsel kabul ayrı kanıt sınıfıdır.

## Dağıtım sınırı

Bu çalışma source ve local test kapsamındadır. Commit, push, migration apply, UAT deploy, web/desktop runtime smoke ve mobile device kabulü ayrı yetki/ortam gerektirir.
