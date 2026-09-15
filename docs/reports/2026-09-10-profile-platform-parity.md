# Profil ayarları: web, masaüstü, mobil

10 Eylül 2026. Kaynak kod denetimi; cihaz/browser kabul testi değildir. Bu tur banner penceresinin katman ve klavye sorunu düzeltildi. Platform eşitlemesi için aşağıdaki analiz hazırlandı; diğer alanlar etkinleştirilmedi.

## Banner penceresi düzeltmesi

`components/settings/settings-window.tsx` ayarları `z-[90]` katmanında gösteriyor. `components/ui/modal.tsx` varsayılanı `z-[80]`. Yeni banner penceresi varsayılanı kullandığı için ayarların arkasında kalıyordu.

Banner düzenleyicisi ve aynı kusuru taşıyan profil fotoğrafı penceresi `z-[110]` kullanacak şekilde düzeltildi. Fotoğraf kırpma penceresinin mevcut `z-[120]` katmanı korundu. Genel modalın varsayılan katmanı değiştirilmedi.

`SettingsWindow` ve `Modal` klavye dinleyicileri, olayın ait olduğu en yakın dialog'u denetliyor. Alt pencere üst pencereden gelen Escape/Tab olayını işleyemiyor; Escape üst pencereyi kapatınca ayarlar açık kalıyor. Kapanışta tetikleyiciye odak dönüşü mevcut modal davranışıyla korunuyor.

`apps/web/e2e/specs/settings/settings-window.spec.ts` içine gerçek ayarlar katmanı üzerinden regresyon eklendi: banner açma, `elementFromPoint` ile gerçekten üstte olduğunu kontrol etme, ileri/geri Tab, yalnız banner'ı Escape ile kapatma, odak dönüşü, tekrar açma. **Çalıştırılmadı.** Yalnız `toBeVisible` kontrolü, arkada kalan pencereyi de görünür sayabildiği için yeterli kabul edilmedi.

## Güncel özellik matrisi

Web ve masaüstü aynı `AccountProfileTab`, `AccountSection`, `ProfileHeroCard` bileşenlerini kullanıyor; bu profil alanlarında ayrı masaüstü uygulaması yok. Bu nedenle tek sütunda gösterildi. Mobilde profil merkezi, profil düzenleme ekranı ve hesap ayarları ayrı girişlerdir; bir özelliğin profil düzenleme ekranında bulunmaması uygulamanın tamamında bulunmadığı anlamına gelmez.

“Bağlı” gerçek kayıt yolu bulunduğunu ifade eder; testten geçtiğini ifade etmez.

| Özellik                      | Web + masaüstü                                                                                                                         | Mobil                                                                                                        | Ortaklaştırma ihtiyacı                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Görünen ad                   | Düzenleme/kayıt bağlı; başarılı kaydı hata gösterme kusuru var. Boş ad mevcut adı korur.                                               | Profil düzenleyicisi ve hesap düzenleme penceresinde var; boş ad `null` olabilir.                            | Tek boşaltma ve kayıt sonucu sözleşmesi.                                                       |
| Kullanıcı adı                | Düzenleme bağlı; backend 30 gün kuralı var, UI kilit tarihi bağlanmamış. Aynı kayıt sonucu kusuru var.                                 | Düzenleme var; profil düzenleyicisi 30 günlük kilidi okur/gösterir.                                          | Kilit tarihi, doğrulama ve hata gösterimi aynı olmalı.                                         |
| Avatar yükleme/değiştirme    | Var. Kare kırpma, sürükleme, zoom; 512 px çıktı.                                                                                       | Var. Galeriden seçim ve doğrulanmış yükleme claim'i.                                                         | Ortak sahiplik/doğrulama ve çıktı politikası.                                                  |
| Avatar kırpma/zoom           | Var.                                                                                                                                   | Aktif düzenleyicide yok; picker `allowsEditing: false`.                                                      | Mobilde eklenmeli.                                                                             |
| Avatar kaldırma              | Var.                                                                                                                                   | Aktif profil/hesap düzenleyicisinde kaldırma kontrolü yok.                                                   | Mobilde eklenmeli; boş avatarın gösterimi ortak olmalı.                                        |
| Banner yükleme/değiştirme    | Önceki tur bağlandı; bu tur pencerenin arkada kalması düzeltildi. Seçim önizlenir, Kaydet ile yüklenir.                                | Profil düzenle ekranında var; dosya seçimi/yükleme sonrası hemen claim edilir.                               | Kaydet/iptal davranışı eşitlenmeli veya açıkça anlatılmalı.                                    |
| Banner konum/renk/kaldırma   | Var. 0–1 odak noktaları; beş mobil renk ve varsayılan gradyan; kaldırma/konum URL karşılaştırmalı, kaldırma temizleme kuyruğuna bağlı. | Var. Taslak, genel profil PATCH'i ile kaydedilir. Aynı eşzamanlılık ve temizlik güvencesi yok.               | Mobil de ortak güvenli banner servisini kullanmalı.                                            |
| Zamir                        | Satır var; kapalı, veri bağlantısı yok. Public popover da taşımıyor.                                                                   | API/DB/public profil gösterimi var; aktif düzenleme kontrolü yok.                                            | Düzenleme iki tarafa, gösterim web/masaüstüne eklenmeli.                                       |
| Biyografi                    | Satır kapalı; tanımda 190 karakter. Kayıtlı mobil değer ayarlar taslağına alınmıyor. Public profil ve DM görünümü okuyabiliyor.        | Düzenleme/kayıt var; 500 karakter.                                                                           | Web bağlantısı; ortak sınır önerisi mevcut API gibi 500.                                       |
| Özel durum metni             | Satır kapalı; kayıtlı değer profil ayarlarına alınmıyor.                                                                               | Profil merkezindeki durum kartı ve kişinin kendi profil kartından açılan özel durum penceresi üzerinden var. | Web/masaüstü okuma/yazma bağlantısı ve ortak durum modeli.                                     |
| Durum emojisi                | Kapalı, beş seçenekli satır.                                                                                                           | Emoji picker ve gerçek kayıt var.                                                                            | Web/masaüstünde gerçek emoji değeri; platformlar aynı doğrulamayı kullanmalı.                  |
| Özel durum süresi            | Kapalı: 1 saat, 4 saat, gün sonu, süresiz.                                                                                             | Var: ayrıca 30 dakika. Süre koruma kusurları mevcut.                                                         | Ortak seçenekler; kullanıcı değiştirmedikçe kesin bitiş zamanı korunmalı.                      |
| Özel durum temizleme         | Hero'da yalnız yerel `ps` taslağını boşaltan kod var; kalıcı temizleme akışı değil.                                                    | Merkez kartında temizle + Kaydet; özel durum penceresinde üç alanı birlikte temizleyen kayıt var.            | Metin + emoji + bitiş zamanı atomik olarak temizlenmeli.                                       |
| Çevrimiçi/boşta/DND/görünmez | Dört durum var. Ayar satırındaki kayıt sonucu kusurundan ayrı olarak kullanıcı menüsünde çalışan yazma yolu var.                       | Profil merkezi/picker ve presence API üzerinden var.                                                         | Tek görünürlük ve kayıt sözleşmesi; özel durum metninden ayrı tutulmalı.                       |
| Süreli DND                   | Kullanıcı menüsünde 30 dakika, 1 saat, 8 saat, süresiz; önceki duruma dönüş altyapısı var.                                             | DND seçilebilir; süre seçimi yok, mobil presence gövdesi yalnız `status`.                                    | Mobilde süre ve önceki duruma dönüş desteği eklenmeli. Özel durum süresiyle birleştirilmemeli. |
| Profil/presence gizliliği    | Herkes / Arkadaşlar / Hiç kimse; gerçek okuma/yazma var.                                                                               | Hesap ayarlarında aynı seçenekler ve gerçek API var.                                                         | Seçenekler ortak; HTTP/socket uygulaması ve banner görünürlüğü eşit değil.                     |
| Public profil bilgileri      | Biyografi/banner gösterilir; zamir ve durum emojisi eksik. Özel durum süre kontrolü eksik.                                             | Zamir/emoji ve etkin özel durum gösterimi var; banner kendine/arkadaşlara verilir.                           | Bir public profil sözleşmesi ve aynı gizlilik kararı.                                          |

### Sadece bir tarafta bulunan aktif kontroller

- **Mobilde:** biyografi düzenleme; özel durum metni/emoji/süre/kalıcı temizleme; profil düzenleyicisinde kullanıcı adı kilit tarihinin gösterilmesi.
- **Web/masaüstünde:** avatar kırpma/zoom/kaldırma; süreli DND seçimi.
- **İkisinde de eksik:** zamir düzenleme. Mobil API desteği ve gösterim, düzenleme özelliği sayılmaz.
- **İkisinde de var ama eşit değil:** banner kaydetme/temizleme, ad boşaltma, kullanıcı adı kilidi, public profil görünürlüğü ve cihazlar arası güncelleme.

## Kaynak haritası

Web dosyaları `apps/web/src`, mobil dosyaları `apps/mobile/src` altındadır.

| Konu                                                        | Kaynak                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ortak web/masaüstü profil ekranı, gerçek kayıt ve tohumlama | `components/settings/sections/account/profile-tab.tsx`; `account-section.tsx:148`, `:172`, `:223`, `:253`                  |
| Kapalı alanlar, eksik eşleme, 190 karakter sınırı           | `lib/settings/availability.ts:9`; `components/settings/sections/account/account-surface.ts:98`; `lib/settings/tree.ts:191` |
| Web avatar işlemleri                                        | `components/settings/profile-avatar-field.tsx:117`, `:343`, `:376`; `lib/account/actions.ts`                               |
| Web banner işlemleri                                        | `components/settings/profile-banner-field.tsx`; `lib/account/banner-service.ts`; `app/api/uploadthing/core.ts`             |
| Aktif mobil profil ekranının mount edilmesi                 | `app/screens/mobile-screen-containers.tsx:698`                                                                             |
| Mobil ad/kullanıcı adı/bio/banner düzenleme                 | `social/mobile-profile-edit-screen.tsx:118`, `:185`, `:304`, `:414`, `:572`; `social/mobile-profile-edit-state.ts`         |
| Mobil avatar picker                                         | `media/mobile-image-picker.ts:153`                                                                                         |
| Mobil hesap ad/kullanıcı adı ve gizlilik                    | `app/screens/mobile-account-settings-screen.tsx:628`, `:676`, `:1133`                                                      |
| Aktif mobil özel durum kartı                                | `app/screens/settings-screen.tsx:401`; `social/mobile-profile-status-card.tsx:156`, `:241`, `:333`                         |
| Kendi profil kartından özel durum penceresi                 | `social/profile-card/profile-card-overlay.tsx:647`; `social/mobile-custom-status-sheet.tsx:50`                             |
| Alan şemaları/limitleri ve mobil presence                   | `packages/types/src/mobile-social.ts:222`, `:230`, `:257` (repo kökü)                                                      |
| DND                                                         | Web `components/shell/channel-sidebar.tsx:542`; `lib/presence/dnd.ts:23`                                                   |
| Public profil farkları                                      | Web `lib/social/web-user-profile-service.ts`; `lib/social/mobile-user-profile-service.ts:420`, `:467`                      |

## Additional observations

1. **medium — Başarılı web kaydı hata gösterilebilir.** `account-section.tsx` önce `pn/pu/pp` için API kaydı yapıyor, sonra `split.unmapped` nedeniyle `SETTINGS_WRITE_UNSUPPORTED` fırlatıyor. `account-surface.ts` bu üç anahtarı desteklenmeyenler arasına koyuyor. Sonuç: DB değişmişken UI geri dönmüş/hata vermiş olabilir. Önceki rapordaki “gerçek kayıt yolu var” ifadesi, bu sonucun doğru gösterildiği garantisi değildir. Bu tur analiz bulgusu olarak bırakıldı.

2. **medium — Public banner gizliliği farklı.** Mobil servis banner'ı yalnız kendine/arkadaşlara veriyor; web profil görünür olduğunda banner'ı da veriyor. Ortaklaştırırken yalnız kontrolleri eklemek yeterli değildir. Banner'ın genel profil görünürlüğünü mü yoksa arkadaş kuralını mı izleyeceği ürün kararıdır; iki endpoint aynı kararı uygulamalı.

3. **medium — Genel profil PATCH'i eşzamanlı alanları ezebilir.** `lib/account/service.ts:298` bütün profili okuyup değişmeyen alanları da yeniden yazıyor. Mobil banner kaldırması yeni web servisindeki URL karşılaştırması/temizleme kuyruğunu kullanmıyor. Yalnız istekte değişen kolonları yazmak ve banner işlemlerini ortak güvenli serviste toplamak gerekir.

4. **medium — Presence gizliliği ve süre kontrolü bütün tüketicilerde eşit değil.** `lib/account/service.ts:177`, `:355` ham özel durumu arkadaş/sunucu odalarına yayınlıyor; alıcı bazlı presence gizliliği uygulanmıyor. Web public profil ve arkadaş presence cache'i süreyi kontrol etmiyor. Canlı istismar veya cihaz testi yapılmadı; kaynakta politika farkı var.

5. **medium — Mobilde mevcut süre korunmayabilir.** `mobile-custom-status-sheet.tsx` açılırken süreyi `never` yapar; kendi profil kartında gerçekten kullanılıyor. `mobile-profile-edit-state.ts` ise başlangıçtaki süre seçeneğini kayıt anındaki kalan süreyle yeniden karşılaştırır; uzun açık ekranlarda istemeden süre değişikliği üretebilir. Profil merkezindeki aktif durum kartı da bu ortak taslak yardımcısını kullanıyor.

6. **medium — Açık profil cache'leri ve yayın sözleşmesi eksik.** `UserProfileUpdatedPayload` banner/bio/zamir/emoji/bitiş zamanını taşımıyor; web ve mobil realtime köprüleri bütün public profil sorgularını yenilemiyor. Yerel mutation sonrası doğru görünmesi, başka açık cihazın da yenilendiğini kanıtlamaz.

Önceki ayrıntılı kaynak denetimi: [banner ve alan raporu](./2026-09-10-profile-banner-and-fields-audit.md). Bu dosyadaki matris aktif mobil girişleri ve yeni bulunan kayıt sonucu kusurunu ayrıca ayırır.

## Önerilen ortak ürün sözleşmesi ve sıra

1. Önce yanlış kayıt sonucu, kısmi PATCH, özel durum gizliliği/süre koruma ve cache sözleşmesi düzeltilmeli. Bunlar düzelmeden daha çok aktif kontrol aynı kusurları yayar.
2. Tek profil veri modeli; ortak doğrulama: görünen ad 60, kullanıcı adı 2–32 ve 30 gün kuralı, zamir 40, biyografi 500, özel durum metni 128, emoji 16 karakter. Boşaltma için ortak `null` davranışı.
3. Web/masaüstüne biyografi, zamir ve özel durum metni/emoji/süre/temizleme bağlantısı; mobile zamir düzenleme, avatar kırpma/kaldırma ve süreli DND.
4. Banner/avatarda ortak sahiplik, doğrulanmış claim, hata ve eski dosya temizliği; banner konumu aynı 0–1 koordinatları. Kaydet/iptal davranışları tutarlı olmalı.
5. Özel durum `{text, emoji, expiresAt}` olarak birlikte temizlenmeli; DND ayrı `{status, expiresAt, restoreTo}` sözleşmesi kullanmalı. Sunucu kesin bitiş anını saklamalı, kullanıcı değiştirmedikçe süre yenilenmemeli.
6. Public profil ve socket aynı görünürlük/etkin durum kararını uygulamalı. İki cihaz açıkken değişiklik, süre dolumu, temizleme, gizlilik ve çatışma senaryolarıyla ortak kabul yapılmalı.

## Bu tur doğrulama

- Kaynak ve diff incelendi; Prettier tamamlandı; `git diff --check` geçti.
- E2E regresyon eklendi; test/build/typecheck/browser/masaüstü/mobil testi kullanıcı isteği gereği çalıştırılmadı.
- Graphify güncellemesi denendi; `graphify-out/.graph.tmp.json` dosyasının `graph.json` üzerine taşınması `WinError 5` ile engellendi. Kaynak denetimi doğrudan dosyalardan yapıldı; grafiğin güncellendiği iddia edilmiyor.
