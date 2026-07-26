# Desktop Operasyon Konsolu ve Mobil Vaka Refakatçisi (Alt Proje F)

**Tarih:** 2026-07-26
**Dal:** uat
**Durum:** Tasarım yazıldı, onay bekliyor
**Bağımlılık:** B (capability haritası), **D1** (vaka API'leri). A istemci
başlıkları için faydalı ama zorunlu değil.
**Revizyon:** 2026-07-27 (spec-correction turu) — mobil yetkilendirme yolu
düzeltildi, push sağlayıcısı Expo olarak düzeltildi.

## Bağlam

Altı alt projeden sonuncusu. B, C, D, E web yüzünü kurar; F aynı veriyi
masaüstü ve mobilde operasyona uygun biçimde sunar.

Görev dağılımı bilinçli olarak asimetrik:

- **Web** tam komuta merkezi — politika, toplu işlem, dışa aktarma, analiz.
- **Desktop** canlı operasyon — ikincil pencere, tepsi rozeti, global kısayol.
- **Mobil** yalnızca refakatçi — uyarı, vaka görüntüleme, üç hızlı aksiyon.

Yüksek riskli işlemler (toplu ban, dışa aktarma, politika düzenleme, feature
flag değişimi, kampanya onayı) **yalnızca web'de** kalır.

Hedef kullanıcı: **platform operasyon ekibi**.

## Problem

### Doğrulanmış mevcut durum

**1. Desktop ince kabuk değil; native makine zaten kurulu.**

`apps/desktop/src-tauri/tauri.conf.json` — `frontendDist: "https://whispr.invalid"`,
`devUrl: "http://localhost:3000"`. Ayrı frontend kaynağı yok; web uygulaması
yükleniyor. `apps/desktop/src` dizini yok.

Ama `security.capabilities` üç yetenek listeliyor:
`["main", "voice-mini", "game-overlay"]`. Yani **ikincil pencere deseni zaten
üretimde çalışıyor**.

`apps/desktop/src-tauri/capabilities/main.json` izinleri arasında:
`allow-promote-desktop-main-window`, `allow-set-desktop-voice-mini-visible`,
`allow-publish-desktop-voice-mini-snapshot`, `allow-set-desktop-game-overlay-visible`,
`allow-get-desktop-companion-surfaces-status`, `allow-refresh-desktop-companion-surfaces`,
`allow-configure-desktop-voice-shortcuts`, `allow-set-desktop-autostart-enabled`,
`allow-export-desktop-diagnostics-bundle`, `notification:allow-is-permission-granted`.

`apps/desktop/src-tauri/src/lib.rs` — `WebviewWindowBuilder` ile `main`
penceresi kuruluyor (`:661`), pencere durumu kalıcılığı
(`desktop_window_state_flags:173`), tepsi (`tray_tooltip:387`), oyun overlay
çapası (`anchor:467`), ve komut yetkilendirmesi
(`is_authorized_desktop_command_window_label:751`,
`assert_desktop_main_command_window:755`).

Sonuç: F'nin desktop kısmı sıfırdan iş değil. `voice-mini` penceresi, admin
konsol penceresinin birebir şablonu.

**2. Derin bağlantı şeması kayıtlı.**
`tauri.conf.json` → `plugins.deep-link.desktop.schemes: ["whispr"]`.
`whispr://` bağlantıları desktop'ta açılabiliyor.

**3. Mobilde platform admin yüzü yok.**

`apps/mobile/src/navigation/mobile-navigation-types.ts` kök yığın rotalarını
tanımlıyor: `MainTabs` (`:13`), `UserProfile` (`:32`), `OpenSourceLicenses`
(`:50`) ve diğerleri. Admin rotası yok.

Mobilde admin'e benzer tek şey **sunucu yönetimi**
(`apps/mobile/src/app/features/use-mobile-server-management-feature.ts`,
`apps/mobile/src/workspace/mobile-server-management-client.ts`) — bu sunucu
sahibi işlevi, platform yönetimi değil.

Derin bağlantı haritası mevcut: `apps/mobile/src/navigation/mobile-linking.ts:79`
(`MainTabs`), `:92` (`UserProfile: "user/:userId"`).

**4. Push altyapısı hazır — sağlayıcı Expo, FCM değil.**
`apps/web/src/lib/mobile/push-sender.ts:5` Expo Push Service'e gönderiyor
(`https://exp.host/--/api/v2/push/send`). `MobilePushToken`
(`packages/db/prisma/schema.prisma:1255`) token'ı ve `platform` alanını tutuyor;
iOS kaydı destekleniyor (`push-notifications.test.ts:109` `platform: "ios"`).
`NotificationType.MODERATION` (`schema.prisma:40`) mevcut.

**5. Mobil auth çerez değil Bearer.**
`apps/web/src/lib/auth/api.ts:95` `requireMobileApiSession(request)` Bearer
token okuyor. Web admin yolu (`lib/admin/access.ts:130` → `auth()`) çerez
oturumuna dayanıyor. İkisi birbirinin yerine geçmez — bkz. Tasarım §4.

## Hedefler

1. Masaüstünde moderasyon kuyruğu ana pencereden bağımsız izlenebilir.
2. Bekleyen vaka sayısı sistem tepsisinde görünür.
3. Acil vaka mobil bildirime düşer; operatör telefondan vakayı görüp
   üstlenebilir veya reddedebilir.
4. Yüksek riskli hiçbir işlem mobil veya ikincil pencereden yapılamaz.

## Kapsam dışı

- Mobilde tam admin paneli. Analitik, kampanya, feature flag, toplu işlem,
  dışa aktarma mobile **gelmez**.
- Desktop'ta analitik ekranları. Grafik okumak için ana pencere/web yeterli.
- Çevrimdışı aksiyon kuyruğu. Ağ yoksa aksiyon alınamaz (gerekçe aşağıda).
- İçerik raporu delili gösterimi. Vaka dosyası delil kartlarını D2'de kazanır;
  F'nin mobil detay ekranı D1 kapsamındaki alanları gösterir.

## Tasarım

### 1. Desktop: admin konsol penceresi

Yeni yetenek dosyası `apps/desktop/src-tauri/capabilities/admin-console.json`,
`voice-mini.json` şablonundan türetilir. `tauri.conf.json` içindeki
`security.capabilities` listesine `"admin-console"` eklenir.

Pencere `admin-console` etiketiyle açılır ve web'in `/admin/moderation`
rotasını kompakt modda yükler (`?surface=console` sorgu parametresi;
web tarafı bu parametreyle sol navigasyonu gizler ve satır yoğunluğunu artırır).

Açılış: web admin arayüzünde "Konsolu ayır" düğmesi, mevcut komut köprüsü
üzerinden. Desktop dışında bu düğme görünmez.

**Karar: yeni bir frontend yazılmaz.** Konsol penceresi aynı web rotasını
farklı bir düzen bayrağıyla yükler. İkinci bir moderasyon arayüzü, iki ayrı
hata kaynağı demek.

**Komut yetkilendirmesi:** `is_authorized_desktop_command_window_label`
(`lib.rs:751`) genişletilir; `admin-console` penceresi yalnızca kendi
ihtiyaç duyduğu komutları çağırabilir. Ana pencereye ayrılmış komutlar
(`assert_desktop_main_command_window:755`) konsol penceresine açılmaz.

### 2. Desktop: tepsi rozeti ve global kısayol

Tepsi ipucu (`tray_tooltip:387`) açık vaka sayısını gösterir. Sayı web
tarafından socket üzerinden yayınlanır; desktop yalnızca dinler ve gösterir.

Global kısayol konsolu öne getirir. Mevcut `allow-configure-desktop-voice-shortcuts`
deseni izlenir — kısayol kullanıcı tarafından yapılandırılabilir, sabit
kodlanmaz (çakışma riski).

**Karar: rozet sayısı sunucudan gelir, desktop hesaplamaz.** Aksi halde
"açık vaka" tanımı iki yerde tutulur ve zamanla ayrışır.

### 3. Mobil: vaka refakatçisi

Yeni kök yığın rotası: `AdminIncidents` (liste) ve
`AdminIncidentDetail: { caseId: string }`. `MainTabs` içine **sekme olarak
eklenmez** — admin olmayan kullanıcıların çoğunluğu için boş bir sekme
gürültüdür.

Giriş noktası: Ayarlar ekranında yalnızca admin üyeliği olan kullanıcıya
görünen bir satır. Görünürlük sunucudan gelen bir bayrakla belirlenir.

Derin bağlantı: `whispr://admin/case/:caseId`, `mobile-linking.ts` haritasına
eklenir. Push bildirimine dokunmak doğrudan vakayı açar.

**Ekranlar:**

- **Liste:** açık vakalar, öncelik ve yaş sıralı. Filtre yok — mobilde
  filtre kurgulamak masaüstü işidir.
- **Detay:** D'nin zaman çizelgesinin okunur özeti. Raporlar, delil
  snapshot'ları, geçmiş aksiyonlar. Yan panel yok, dikey akış.

**Aksiyonlar — yalnızca üç:**

| Aksiyon       | Etki                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Üstlen        | `assigneeId` = aktör, `status` → `IN_REVIEW`                               |
| Reddet        | `status` → `DISMISSED`, karar nedeni zorunlu                               |
| Web'e yükselt | Vakayı `HIGH`/`URGENT` yapar ve "masaüstünde karar bekliyor" işareti koyar |

Ban, mesaj silme, uyarı gönderme mobilde **yok**. Sebep: bunlar geri alınması
zor kararlar ve telefon ekranında delilin tamamı okunamaz. Reddetme de bir
karardır ama tersine çevrilebilir (vaka yeniden açılabilir).

### 4. Yetki: mobil ayrı bir auth yolu kullanıyor — P0

**Doğrulanmış sorun.** İlk taslak mobil admin uçlarının
`requireAdminUser({ roles })` ile korunacağını söylüyordu. Bu çalışmaz:

- `apps/web/src/lib/admin/access.ts:130` — `requireAdminUser` içeride
  `auth()` çağırıyor, yani **NextAuth çerez oturumu** okuyor.
- `apps/web/src/lib/auth/api.ts:95` — mobil uçlar `requireMobileApiSession(request)`
  kullanıyor; bu `getBearerTokenFromRequest` ile **Bearer token** okuyup
  Redis oturum kontrolü + Postgres kullanıcı aramasını paralel koşuyor.

Mobil istemci çerez göndermiyor. `requireAdminUser` her mobil istekte 401
dönerdi.

**Çözüm: iki auth yolu, tek yetki haritası.**

```ts
// apps/web/src/lib/admin/access.ts
export async function requireMobileAdminCapability(
  request: Request,
  capability: AdminCapability,
): Promise<AdminAccessUser>;
```

İçeride: `requireMobileApiSession(request)` ile kimlik doğrulanır, sonra
dönen `userId` üzerinden `AdminMembership` aranır ve B'nin
`ADMIN_CAPABILITIES` haritası (B §5) uygulanır.

**Karar: capability haritası ortak, oturum çözümü ayrı.** Rol → yetki kuralı
tek yerde kalır; yalnızca "bu istek kimden geliyor" sorusunun cevabı taşımaya
göre değişir. İki ayrı yetki tablosu tutmak er geç ayrışır ve ayrışan taraf
mobil olur (daha az bakılan yüzey).

**Karar: bootstrap bayrağı yalnızca arayüz içindir.** Mobil ayarlar
ekranındaki "admin" satırının görünürlüğü sunucudan gelen bir bayrakla
belirlenir, ama her uç kendi yetkisini bağımsız doğrular. Bayrak elle `true`
yapılsa bile uç 403 döner.

Konsol penceresi için aynı kural: pencere etiketi kimlik değil; kimlik
oturumdur.

**Ön koşul sırası:** bu fonksiyon B'nin capability haritasına bağımlı, ve
mobil uçların çağıracağı vaka API'leri D1'de yazılıyor. F bu ikisinden sonra
gelir.

### 5. Bildirim

Vaka `URGENT` önceliğe çıktığında veya 24 saati aşan `OPEN` vaka oluştuğunda
admin üyelerine `NotificationType.MODERATION` bildirimi gider. Mevcut
`MobilePushToken` yolu kullanılır, yeni gönderim altyapısı yazılmaz.

Frekans: aynı vaka için 24 saatte en fazla bir bildirim (`Notification.dedupeKey`
alanı `schema.prisma:1231` bunun için zaten unique).

### 6. Çevrimdışı davranış

Ağ yokken liste son önbelleği gösterir, **aksiyon düğmeleri devre dışı** kalır.

**Karar: çevrimdışı aksiyon kuyruğu yok.** İki operatör çevrimdışıyken aynı
vakada çelişen karar verirse birleştirme kuralı yazmak gerekir; kazanç buna
değmez. Moderasyon kararı ağ gerektirir.

## Test planı

1. **Yetki:** admin olmayan kullanıcı mobil admin uçlarına 403 almalı;
   ayarlar satırı görünmemeli.
2. **İstemci bayrağı yetki değil:** bayrak elle `true` yapılsa bile uç 403
   dönmeli.
   2b. **Bearer yolu çalışıyor:** geçerli Bearer token'lı admin isteği 200
   dönmeli. Çerez tabanlı `requireAdminUser` ile korunan bir uç aynı istekte
   401 dönmeli — iki yolun ayrı olduğunu sabitler.
   2c. **Tek harita:** aynı capability web ve mobil yolda aynı rol listesini
   uygulamalı (tablo testi).
3. **Mobil aksiyon sınırı:** mobil uç ban veya mesaj silme talebini
   reddetmeli (uç bu aksiyonları hiç sunmamalı).
4. **Derin bağlantı:** `whispr://admin/case/:id` doğru vakayı açmalı;
   yetkisiz kullanıcıda güvenli ekrana düşmeli.
5. **Bildirim tekilliği:** aynı vaka için 24 saatte ikinci bildirim
   `dedupeKey` çakışmasıyla engellenmeli.
6. **Çevrimdışı:** ağ yokken aksiyon düğmeleri devre dışı; istek atılmamalı.
7. **Konsol penceresi izinleri:** `admin-console` etiketli pencere ana
   pencereye ayrılmış komutu çağırdığında reddedilmeli
   (`assert_desktop_main_command_window` davranışı).
8. **Tepsi rozeti:** sunucudan gelen sayı değiştiğinde ipucu güncellenmeli;
   desktop kendi başına sayı hesaplamamalı.
9. **Kompakt mod:** `?surface=console` ile yüklenen rota sol navigasyonu
   göstermemeli.
10. **Üstlenme yarışı:** mobilden ve webden eşzamanlı üstlenmede D'nin
    koşullu güncelleme kuralı geçerli olmalı.

## Bitti kanıtı

- Desktop'ta konsol penceresi ana pencereden bağımsız açık kalıyor ve tepsi
  bekleyen vaka sayısını gösteriyor.
- `URGENT` bir vaka açıldığında telefona bildirim düşüyor; dokunmak vakayı
  açıyor; "Üstlen" web arayüzünde anında görünüyor.
- Mobil uçtan ban denemesi reddediliyor.

## Riskler

| Risk                              | Etki                                            | Karşılık                                                                         |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| İkinci pencere ikinci arayüz olur | Bakım iki katına çıkar                          | Konsol aynı rotayı yükler; ayrı bileşen ağacı yok                                |
| Mobil kapsam büyümeye zorlanır    | "Bir de şunu ekleyelim" ile web'in kopyası olur | Aksiyon listesi spec'te üçle sınırlı; genişletme yeni spec gerektirir            |
| Pencere etiketi kimlik sanılır    | Yetki atlatma                                   | Test 2 ve 7; yetki her istekte sunucuda                                          |
| Bildirim gürültüsü                | Operatör bildirimi kapatır                      | `dedupeKey` ile vaka başına günde bir; yalnızca `URGENT` ve 24 saati aşan `OPEN` |
| iOS beklentisi                    | Kapsam yanlış anlaşılır                         | Kapsam dışı olarak açıkça yazıldı                                                |

## Sonraki adım

Onaydan sonra `writing-plans`. Kod değişikliği plan onayından önce başlamaz.
