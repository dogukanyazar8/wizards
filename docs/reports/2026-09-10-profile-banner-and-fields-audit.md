# Profil banner ve alan denetimi — 10 Eylül 2026

Kapsam: web/masaüstü profil banner özelliğinin uygulanması; zamir, biyografi, özel durum, emoji, temizleme ve süre akışlarının kaynak koddan denetimi. Diğer profil alanları bu değişiklikte etkinleştirilmedi. Test, build, typecheck ve uygulama içi doğrulama kullanıcıya bırakıldı. Aşağıdaki bulgular çalışma zamanı testi sonucu değildir.

## Banner: uygulanan değişiklik

Önceden profil bölümü `bannerUrl: ""` veriyordu; hero içindeki yükle/kaldır düğmeleri koşulsuz kapalıydı. Mevcut mobil banner da bu yüzden ayarlarda görünmüyordu.

- `apps/web/src/components/settings/profile-banner-field.tsx`: gerçek banner okuma, dosya seçme ve önizleme, kaydederek yükleme/değiştirme, kaldırma, yatay/dikey odak konumu, ortalama, mobildeki beş renk ve varsayılan gradyan. Yeni görsel ortadan başlar; yükleme sonrasında yeniden açılan düzenleyicide konumu değiştirilebilir.
- `apps/web/src/lib/account/banner-actions.ts` ve `banner-service.ts`: oturum doğrulaması ve mevcut hız sınırları. Dışarıdan kullanıcı kimliği veya yeni görsel URL'si kabul edilmez. Yalnız banner kolonları yazılır; ad, e-posta, durum ve diğer profil taslakları etkilenmez.
- `apps/web/src/app/api/uploadthing/core.ts`: ayrı `profileBannerUploader`. Sabit `profile-banner` amacı; tarayıcı oturumu. Mobil yükleyicinin bearer kimlik doğrulaması ve geri dönüş kuralları genişletilmedi.
- `apps/web/src/lib/mobile/mobile-media-uploadthing.ts`, `mobile-media-verifier.ts`, `mobile-media-upload-service.ts`: mevcut gerçek görsel doğrulama, sahiplik, süreli claim, tekrar tüketim koruması ve eski dosya temizliği yeniden kullanılır. Web claim'i başka amaçla yüklenmiş bir dosyayı tüketemez.
- JPEG/PNG/WebP, en fazla 4 MB; sunucuda kenar başına 4096 ve toplam 16 milyon piksel sınırı. Tarayıcı dosya türü/boyut kontrolü güvenlik sınırı sayılmaz; gerçek içerik sunucuda doğrulanır.
- Kaldırma/konumlandırma, ekranda görülen URL ile veritabanındaki URL eşleşirse uygulanır. Başka cihazda değişmiş bir banner üzerine eski kaldırma/konum isteği uygulanmaz. Kaldırma, URL ve odak noktalarını temizler; renk korunur. Sahibine ait ilgili dosyanın temizleme kuyruğu aynı transaction içinde güncellenir.
- Başarısız kayıt mevcut banner'ı iyimser biçimde silmez. Tek işlem kilidi çift tıklamayı engeller; geçici önizleme URL'leri serbest bırakılır. Geçici okuma hatası son başarılı banner'ı korur.
- `apps/web/src/lib/social/web-user-profile-service.ts` ve `components/shared/user-profile-popover.tsx`: kaydedilen odak noktası profil önizlemesinde de uygulanır. Sıfır koordinatı yanlışlıkla merkeze dönüştürülmez. Görselsiz renk üzerinde eski varsayılan gradyan kalmaz.
- Profil kartının mevcut `overflow-hidden rounded-[inherit]` geometrisi korunur; ikinci çerçeve eklenmez. Web ve masaüstü ortak bileşeni kullanır.

### Banner sınırları

Yükleme mevcut UploadThing yapılandırmasına ihtiyaç duyar. Yapılandırma kapalıysa yeni dosya seçimi kapalıdır; mevcut banner kaldırma, konum ve renk düzenleme çalışacak şekilde ayrılmıştır. Yeni ortam değişkeni, bağımlılık veya migration eklenmedi.

Dosya silme, mevcut outbox worker temizliği ve fırsatçı temizlik üzerinden gerçekleşir; kullanıcı isteği içinde depodan anında silinme garantisi verilmez (`apps/web/src/lib/outbox/worker.ts`, `cleanupMobileMediaUploads`).

Yerel `account-banner` ve `user-profile` sorguları güncellenir. Mevcut banner claim yolu socket olayı yayınlamadığı için başka açık cihazların banner cache'i anında yenilenmez; yeniden okuma gerekir. Bu çalışmada socket sözleşmesi genişletilmedi. Mevcut E2E sahte yükleme yoluna doğrulamasız banner claim'i eklenmedi; gerçek yükleme kabulü yapılandırılmış ortamda yapılmalı.

## Alan envanteri

| Alan                                | Web/masaüstü profil sekmesi                                               | Mobil düzenleyici                                       | Veritabanı/API/tüketim                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Zamir (`pz`)                        | Satır var, kapalı; okuma/yazma bağlanmamış                                | Düzenleme taslağında yok; public profilde gösterim var  | `pronouns` DB ve mobil PATCH/yanıtında var; mobil public profil tüketiyor. Web popover yanıtı/görünümü taşımıyor.            |
| Biyografi (`pbio`)                  | Satır var, kapalı; okuma/yazma bağlanmamış                                | Düzenleme, temizleme, kayıt var                         | DB + mobil API; en fazla 500 karakter. Web popover ve DM profilinde görüntüleniyor.                                          |
| Özel durum (`ps`)                   | Satır var, kapalı; hero yalnız yerel satır taslağını okuyor               | Profil düzenleyici ve özel durum penceresinde kayıt var | DB + mobil API; en fazla 128 karakter. Görünürlük/süre tüketimleri tutarsız; aşağıdaki bulgulara bakın.                      |
| Durum emojisi (`pe`)                | Satır var, kapalı; seçim indeksi API emojisine bağlanmamış                | Emoji seçimi ve aynı PATCH ile kayıt var                | DB + mobil API; en fazla 16 karakter. Mobil public profilde tüketim var; web popover bunu almıyor.                           |
| Özel durum temizleme                | Hero'da kod var; yalnız `ps` taslağını boşaltıyor. Kalıcı temizleme değil | Metin, emoji, bitiş zamanı birlikte `null` gönderiliyor | Mobil kayıt yolu gerçek; web satır yazma adaptöründe bu alanlar desteklenmiyor.                                              |
| Otomatik temizleme (`px`)           | Satır var, kapalı; `1h/4h/today/never`                                    | `30m/1h/4h/today/never`; düzenleme hataları mevcut      | `customStatusExpiresAt` DB/API'de var. Bazı okumalarda süre dolunca saklanıyor; her tüketimde ve açık cache'te uygulanmıyor. |
| Çevrimiçi/boşta/DND/görünmez (`pp`) | Gerçek hesap yazma/okuma yolu var                                         | Ayrı presence akışı var                                 | Özel durum metni/süresiyle aynı özellik değildir. `statusExpiresAt` ile `customStatusExpiresAt` karıştırılmamalı.            |

Başlıca kaynaklar:

- `apps/web/src/lib/settings/availability.ts`: `ACCOUNT_UNAVAILABLE_ROWS` içinde `pz/pbio/ps/pe/px`.
- `apps/web/src/components/settings/sections/account/account-surface.ts`: `splitAccountPatch` bu alanları `unmapped` döndürür.
- `apps/web/src/components/settings/sections/account/account-section.tsx`: gerçek profil yazımı ve `store.applyRemote` yalnız ad/kullanıcı adı/presence alanlarını bağlar.
- `apps/web/src/lib/account/actions.ts`: `UpdateAccountSettingsSchema` ve `AccountSettingsState` bu ek profil alanlarını taşımaz.
- `apps/web/src/components/settings/blocks/profile-hero-card.tsx`: `useSettingValue`, `clearCustomStatus("")`; emoji/süre temizleme veya API çağrısı yok.
- `packages/db/prisma/schema.prisma`: `User.bio`, `pronouns`, `customStatus`, `customStatusEmoji`, `customStatusExpiresAt`.
- `packages/types/src/mobile-social.ts`: `MobileProfileUpdateSchema`, uzunluk sınırları ve nullable alanlar.
- `apps/web/src/app/api/v1/mobile/account/profile/route-logic.ts`: doğrulanan mobil PATCH ve görünür özel durum yanıtı.
- `apps/web/src/lib/account/service.ts`: `updateAccountProfile`, boş metinlerin `null` normalizasyonu; `resolveVisibleCustomStatus`.
- `apps/mobile/src/social/mobile-profile-edit-state.ts`, `mobile-custom-status-sheet.tsx`: gerçek düzenleme/temizleme gövdeleri.
- `apps/mobile/src/social/profile-page/mobile-profile-page-sections.tsx`: zamir gösterimi.
- `apps/mobile/src/social/mobile-social-query.ts`: başarılı yazım sonrası profil, hesap, bootstrap ve arkadaş sorguları yenilenir.

## Additional observations

### 1. medium — Profil socket yayını presence gizliliğini ayırmıyor

`apps/web/src/lib/account/service.ts`, `broadcastUserProfileUpdate`: aynı payload arkadaş kullanıcı odalarına ve ortak sunuculara topluca gönderiliyor. `updateAccountProfile` bu payload'a ham `customStatus` ve presence durumu koyuyor. HTTP profil servisi ise `canViewPresence` kararını kullanıyor (`web-user-profile-service.ts`). Gizlenmiş özel durumun socket üzerinden alıcıya ulaşma riski var; yalnız UI'da gizlemek yeterli değildir. Kaynak bulgusu; canlı istismar testi yapılmadı. Öneri: alıcıya göre görünürlük uygulayan mevcut presence politikasını kullanmak veya kişisel değer taşımayan invalidation olayıyla güvenli HTTP okumasına dönmek.

### 2. medium — Süresi dolmuş özel durum bazı web tüketimlerinde kalabilir

`apps/web/src/lib/social/web-user-profile-service.ts` özel durumu okur, bitiş zamanını seçmez. `apps/web/src/lib/friends/service.ts` içindeki `getUserPresenceBroadcast`, `cacheUserPresence`, `persistUserPresence` de ham metni döndürür/cache'ler; bitiş zamanını denetlemez. Mobil public profil `readActiveCustomStatus` ve DM profil servisi süre kontrolü yapar. Sonuç: aynı kullanıcı farklı ekranlarda farklı görünür. Öneri: okuma/cache/yayın hattında tek etkin-durum hesabı; açık ekranlarda süre geçişinde yenileme. DND zamanlayıcısının varlığı bu alanın temizlendiğini kanıtlamaz.

### 3. medium — Mobil özel durum penceresi süreyi kalıcıya çevirebilir

`apps/mobile/src/social/mobile-custom-status-sheet.tsx`: pencere açıldığında `setDuration("never")`; mevcut `customStatusExpiresAt` prop'u yok. Zamanlı bir durumun metnini/emoji'sini düzenleyip kaydetmek `null` bitiş zamanı gönderir. Öneri: mevcut kesin bitiş zamanını korumak, yalnız kullanıcı süreyi açıkça değiştirince yeni zaman hesaplamak.

### 4. medium — Uzun açık kalan mobil profil taslağı bitiş zamanını uzatabilir

`apps/mobile/src/social/mobile-profile-edit-state.ts`: taslak oluşturulurken kalan süre bir seçenekle eşleştirilir; `buildMobileProfileEditPatch` aynı eşleştirmeyi daha sonraki `now` ile tekrar yapar. En yakın seçenek değişince kullanıcı süreye dokunmasa da değişiklik kabul edilir. Örneğin dört saatlik durumla açılan ekran üç saat bekledikten sonra biyografi kaydında yeniden dört saatlik bitiş gönderebilir. Öneri: başlangıç seçimini veya kesin zamanı taslakta sabitlemek; kullanıcı değişikliğini geçen zamandan ayırmak.

### 5. medium — Ortak profil yazımı eşzamanlı değişiklikleri ezebilir

`apps/web/src/lib/account/service.ts`, `updateAccountProfile`: önce bütün profil okunur; yalnız bir alan değişse bile `nextProfile` bütün profil alanlarıyla yazılır. İki cihazın eşzamanlı biyografi/banner/durum yazımları son yazan tarafından ezilebilir. Eski banner'ın tekrar yazılması, dosya temizliğiyle de çakışabilir. Yeni web banner servisinin dar kolon yazımı ve URL karşılaştırması bu serviste uygulanmıştır; mevcut genel mobil profil yazımı ayrıca düzeltilmelidir. Öneri: yalnız istekte bulunan alanları yazmak; banner değiştirme/kaldırmada aynı sahiplik ve eşzamanlılık sözleşmesini kullanmak.

### 6. medium — Profil olayı ve açık profil cache'leri eksik eşleşiyor

`apps/web/src/lib/socket/events.ts` içindeki `UserProfileUpdatedPayload`, biyografi/zamir/banner/emoji/bitiş zamanı taşımıyor. Web `wizards-shell.tsx` üye, mesaj ve DM liste cache'lerini güncelliyor; açık public profil sorgusunu yenilemiyor. Mobil `realtime-query-bridge.ts` arkadaş/bootstrap/workspace cache'lerini güncelliyor; public profil/hesap sorgularını yenilemiyor. Aynı cihazın kendi mutation invalidation'ı başka cihaz için güvence değildir. Öneri: görünürlük politikasını koruyan, dar kapsamlı profil invalidation sözleşmesi.

### 7. minor — Süre seçenekleri platformlar arasında farklı

`packages/types/src/settings.ts` web ayarları 30 dakikayı içermez; `apps/mobile/src/social/mobile-profile-status-expiry.ts` içerir. Web alanları bağlanmadan önce ortak ürün seçeneği kararlaştırılmalı. Emoji için de web seçim indeksi yerine mobil API'nin gerçek emoji değeriyle dönüşüm gerekir.

## Önerilen sonraki sıra

1. Presence gizliliği, etkin özel durum hesabı ve açık cache yenileme sözleşmesini düzeltmek.
2. Genel profil PATCH'ini yalnız değişen alanlara daraltmak; mobil süre koruma hatalarını gidermek.
3. Zamir/biyografi/metin/emoji/süre/üçlü temizlemeyi web/masaüstü okuma-yazma adaptörüne bağlamak; mobil zamir düzenlemesini eklemek. Ortak doğrulamayı korumak.
4. Ortak süre seçenekleriyle web, masaüstü ve mobil kabul testleri.

## Doğrulama durumu ve kullanıcı kabulü

Backend için 12 odaklı regresyon eklendi: oturum/hız sınırı, strict girdi, sabit claim amacı, yanlış amaçla claim tüketmeme, sahiplikli temizlik ve transaction/URL çatışması. Hero render regresyonu eklendi; mevcut profil yanıtı ve kapalı kontrol beklentileri güncellendi. Bunlar çalıştırılmadı; eklenmiş test başarı kanıtı değildir.

Elle kabul: mevcut mobil banner'ı web ve masaüstünde açma; geçerli yükleme/değiştirme; dosya seçimini iptal; geçersiz/büyük dosya ve ağ hatası; aynı dosyayı yeniden seçme; çift tıklama; 0/100 odak sınırları; kaldırınca rengin kalması; profil önizlemesi ve yeniden açınca kalıcılık; iki cihazda eski kaldırma/konum isteğinin reddi; UploadThing kapalıyken mevcut banner işlemleri. Köşe/renk taşması açık ve koyu temada ayrıca görülmeli.
