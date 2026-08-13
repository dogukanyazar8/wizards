# Faz 2: Aktif Oturumlar ve Cihazlar Tasarımı

## Amaç

Web, Tauri desktop ve mobil istemcilerin aynı güvenilir oturum kayıtlarını görmesi; tek oturumun veya mevcut oturum dışındaki tüm oturumların gerçekten geçersiz kılınması.

## Kararlar

- Yeni `AuthSession` modeli oturum güvenliğinin kalıcı gerçek kaynağıdır.
- `AppSession` socket/analitik yaşam döngüsüdür; güvenlik oturumu olarak kullanılmaz.
- Eski `Session` modeli JWT akışına bağlı değildir ve tokenları düz metin alanlarda tutar; yeniden etkinleştirilmez.
- Redis mobil refresh ailesini hızlı kapatır. Redis temizliği başarısız olsa bile DB'deki `revokedAt` erişimi reddeder.
- Ham IP, User-Agent, access/refresh token veya bunların hashleri `AuthSession` içinde saklanmaz ve API'ye dönmez.
- Kullanıcıya yalnız istemci türü, cihaz sınıfı, işletim sistemi, tarayıcı, uygulama sürümü, iki harfli ülke kodu ve zamanlar gösterilir.
- Web JWT'si sunucu üretimli `authSessionId` taşır. Mobil JWT'deki mevcut `sid`, aynı kaydın kimliğidir.
- Eski web/mobil oturumlar ilk doğrulanmış kullanımda tembel olarak kaydedilir; migration kullanıcıları zorla çıkış yaptırmaz.

## Veri modeli

`AuthSession`: `id`, `userId`, `clientType`, `deviceType`, `os`, `browser`, `countryCode`, `appVersion`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt`.

- `id` gizli olmayan, tahmin edilemez oturum kimliğidir.
- Kullanıcı silinince cascade silinir.
- Aktif liste `userId + revokedAt + lastSeenAt`, süpürme `expiresAt` indekslerini kullanır.
- `lastSeenAt` yazımları zaman penceresiyle seyreltilir; her istekte koşulsuz update yapılmaz.

## Güvenlik davranışı

1. İmzalı token doğrulanır.
2. Hesabın aktifliği ve global `sessionsRevokedAfter` kontrol edilir.
3. Kayıt varsa `revokedAt` ve `expiresAt` kontrol edilir; iptal edilmiş/bitmiş kayıt 401 üretir. Mobil bearer isteklerinde bu kontrol her erişimde, web JWT'de mevcut performans penceresi nedeniyle en geç 60 saniye içinde yapılır.
4. Kayıt yoksa eski geçerli oturum güvenli istek bağlamıyla kaydedilir.
5. Tekli iptal yalnız oturum sahibine izin verir, DB'yi önce iptal eder, mobil Redis ailesini best-effort temizler.
6. “Diğerlerini kapat” mevcut kimliği hariç tutan tek DB güncellemesidir; etkilenen mobil aileler best-effort temizlenir.
7. Mevcut oturum iptalinde istemci yerel kimlik bilgisini temizler ve giriş ekranına gider.

## API sözleşmesi

- Web/desktop: `GET /api/v1/users/me/sessions`, `DELETE /api/v1/users/me/sessions/:id`, `POST /api/v1/users/me/sessions/revoke-others`.
- Mobil: aynı davranış `GET /api/v1/mobile/account/sessions`, `DELETE /api/v1/mobile/account/sessions/:id`, `POST /api/v1/mobile/account/sessions/revoke-others`.
- Liste yalnız aktif ve süresi dolmamış kayıtları, en yeni etkinlik önce, en fazla 100 kayıt olarak döner.
- Her satırda `current` sunucuda hesaplanır; istemci bunu tahmin etmez.
- Kimliği bulunmayan veya başka kullanıcıya ait hedef 404 döner; kaynak keşfi yapılmaz.

## Arayüz

### Web ve desktop

Güvenlik kartında gerçek aktif oturum listesi: mevcut cihaz vurgusu, cihaz/istemci adı, OS-tarayıcı, yaklaşık ülke, son etkinlik, açılış ve bitiş zamanı. Satır iptali ve “diğer tüm oturumları kapat” için açık destructive onay; loading, empty, error ve retry durumları.

### Mobil

Güvenlik ekranındaki “Aktif cihazlar” önizlemesi gerçek liste olur. Özet satırı listeyi açar; cihaz detay sheet'i güvenli alanları gösterir ve iptal onayı ister. Mevcut cihaz iptal edilirse başarılı API cevabından sonra yerel çıkış çalışır. Uzun cihaz adları ve ekran okuyucu etiketleri desteklenir. Henüz bağlı olmayan veri dışa aktarma satırı gösterilmez.

## Kabul ölçütleri

- İki platform aynı DB kayıtlarını ve aynı `current` anlamını görür.
- Tekli/çoklu iptal mobil bearer erişimini sonraki istekte, web JWT erişimini en geç 60 saniyelik kontrol penceresinde reddeder.
- Başka kullanıcının oturumu iptal edilemez.
- Ham hassas istemci verisi kalıcılaşmaz veya yanıtta görünmez.
- Sözleşme, servis, route, web bileşen ve mobil bileşen davranışları odaklı testlerle korunur.
- Gerçek cihaz ve görsel kabul kaynak/yerel test başarısından ayrı raporlanır.
