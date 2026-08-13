# Hesap Verisi Dışa Aktarma ve Hesap Silme - Faz 5 Tasarımı

## Durum

- Onaylandı: 2026-08-13
- Platformlar: web, Tauri desktop, iOS, Android
- Teslim: backend, production UI, TR/EN içerik, erişilebilirlik, testler

## Kararlar

1. Dışa aktarma, yeni job tablosu veya obje depolama olmadan cursor sayfalı JSON stream kullanır.
2. Her büyük koleksiyon sabit boyutlu sayfalarla ve kararlı `id asc` sırasıyla okunur. Route bütün belgeyi RAM'de tutmaz.
3. Web/Tauri indirme aynı kimlik doğrulanmış endpoint'i kullanır. Blob yalnız istemci indirme anında oluşur.
4. Mobile dosyayı uygulama cache dizinine indirir, native share yüzeyini açar. İşlem durumu hesap bazlı AsyncStorage kaydında tutulur.
5. Uygulama kapanırken devam eden indirme sonraki açılışta `interrupted` olur; kullanıcı güvenli biçimde yeniden başlatır. Byte resume kapsam dışı.
6. Hesap silme öncesi backend preflight döner: uygun reauth yöntemi, sahip olunan sunucular, kesin onay ifadesi.
7. Silme yalnız beş dakikalık, `account-delete` amaçlı reauth token ve `DELETE MY ACCOUNT` ifadesiyle çalışır.
8. Password hesabı parola reauth kullanır. OAuth-only hesap verified-email challenge kullanır.
9. Mobile e-posta reauth token'ı query yerine özel auth deep-link path segmentinde taşır; parser bunu yalnız hesap silme amacıyla kabul eder. Confirm endpoint ayrıca authenticated aynı kullanıcıyı zorunlu tutar.
10. Silme optimistic değildir. Başarı gelmeden kullanıcı oturumu veya cache temizlenmez. Başarıdan sonra tüm yerel auth/query/export durumu temizlenir.

## Backend

### Export

- `GET /api/v1/users/me/data-export` mevcut auth ve saatlik rate limit'i korur.
- Yanıt `application/json; charset=utf-8`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` taşır.
- JSON `schemaVersion: 2`, `exportedAt` ve mevcut bölüm adlarını korur.
- Kullanıcı bulunamazsa body başlamadan `USER_NOT_FOUND` döner.
- Scalar/singleton alanlar önce okunur. Çok satırlı alanlar cursor helper ile sayfalanır.
- Stream iptalinde yeni DB sorgusu başlatılmaz.
- BigInt JSON string olur.

### Delete preflight

- `GET /api/v1/users/me/deletion` sonucu:
  - `canDelete`
  - `confirmationPhrase`
  - `ownedServers: { id, name }[]`
  - `reauthMethod: PASSWORD | EMAIL`
  - `emailVerified`
- Başka kullanıcı kimliği parametre olarak kabul edilmez.

### Delete execution

- Mevcut `DELETE /api/v1/users/me` korunur.
- Body strict validation kullanır.
- Reauth token header'dadır.
- `OWNED_SERVERS_REQUIRE_TRANSFER`, `REAUTH_REQUIRED`, `REAUTH_FAILED`, `REAUTH_PASSWORD_UNAVAILABLE`, e-posta challenge hataları güvenli kodlarla UI'ya çevrilir.
- Anonymization transaction, upload cleanup, session revoke, runtime cache/socket temizliği mevcut sırayı korur.

## Web ve Tauri

- Hesap ayarlarında yeni `Veri ve Hesap` alanı bulunur.
- Export kartı: idle, preparing, downloading, success, error, retry.
- Download aynı butondan tekrar tetiklenemez; tamamlanınca object URL revoke edilir.
- Danger zone ayrı kırmızı sınır ve açıklamayla gösterilir.
- Silme akışı: preflight, blocker listesi, reauth, exact confirmation, son dialog, request, safe signout.
- OAuth-only e-posta linki `/settings/reauth/[token]` sayfasında challenge'ı doğrular, kısa ömürlü reauth token'ı sessionStorage'a koyar, token'ı URL'den temizler ve silme akışına döner.
- Tauri webview blob download davranışı ayrıca smoke ile doğrulanır; başarısız runtime'da kullanıcıya tarayıcıda açma/yeniden deneme hatası gösterilir.

## Mobile

- Ayarlarda `Veri ve Hesap` detay ekranı eklenir.
- Export: authenticated download, cache dosyası, native Share, retry, offline/error durumları.
- AsyncStorage yalnız durum, başlangıç zamanı ve dosya URI'si tutar; export içeriğini tutmaz.
- Hesap silme ayrı full-screen flow'dur. Safe-area, keyboard avoidance, screen reader live feedback, 44pt minimum touch hedefi uygulanır.
- Owned-server blocker sunucu adlarını ve yönetim yönlendirmesini gösterir.
- Password reauth ekranda yapılır. OAuth-only challenge e-posta gönderir; `whispr://reauth/account-delete/<token>` intent'i authenticated app içinde confirm edilir.
- Başarı sonrası auth context sign-out, query cache temizliği, export durum/dosya cleanup çalışır.

## Güvenlik ve performans

- IDOR yüzeyi yok: bütün route'lar kimliği session/bearer'dan alır.
- Export no-store; dosya adı kullanıcı ID'si içermez.
- Cursor page varsayılanı 250, üst sınırı 500.
- Stream backpressure'a uyar; iptalde sorgu kesilir.
- Reauth token loglanmaz, analytics'e gönderilmez, kalıcı depoya yazılmaz.
- Destructive submit client tarafında tek uçuşludur. Commit öncesinde doğrulanmış eşzamanlı tekrarlar mevcut `deletedAt` sonucunu güvenle alabilir; başarı sonrası tekrar, silinen kimlik bilgilerini yeniden kullanılabilir kılmamak için yetkisizdir.
- UploadThing anahtarları destructive transaction öncesinde yakalanır; cleanup işi aynı transaction içinde durable outbox'a yazılır. Commit sonrası hızlı deneme başarısız olursa worker güvenli biçimde tekrarlar.

## Test ve kabul

- Unit: JSON stream sınırları, BigInt, cursor, abort, preflight, hata eşleme, mobile persistence/deep-link.
- Route contract: auth, headers, strict body, owner blocker, reauth.
- Web component: export durumları, double submit, blocker, reauth, confirmation.
- Mobile component: download/share/reopen, offline, full-screen deletion, keyboard/accessibility.
- E2E: web destructive akış; mobile emulator/device akış.
- Ayrı rapor: source/local tests, Tauri runtime, mobile device, görsel kabul, UAT.

## Kapsam dışı

- Arka plan export job'u.
- Özel obje depolama.
- Byte-range resume.
- Hesap silme grace period veya geri alma.
- Migration, commit, push, deploy.
