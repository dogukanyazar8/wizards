# Hesap Tercihleri Faz 1 Tasarımı

## Durum

- Durum: Onay bekliyor
- Tarih: 2026-08-13
- Kapsam: Veri modeli, ortak sözleşmeler, web/mobile API temeli, iki platformun ayar kabuğu tasarımı, geriye uyumluluk ve test kapıları
- Bu belge kod, migration veya arayüz uygulaması yetkisi vermez.

## Amaç

Önizleme olarak görünen profil görünürlüğü, çevrimiçi görünürlüğü, saat dilimi, tarih/saat biçimi ve arayüz yoğunluğunun daha sonraki fazlarda güvenli biçimde etkinleştirilebilmesi için sunucuyu tek doğruluk kaynağı yapan, çapraz platform ve geriye uyumlu temel oluşturmak.

Faz 1 sonunda ayarlar kalıcı olarak saklanabilir ve API üzerinden doğrulanmış biçimde okunup yazılabilir. Web/mobile ayar kabukları production olarak yeniden tasarlanır; mevcut gerçek kontroller yeni yapıya taşınır. Davranışı uygulanmayan yeni kontroller gösterilmez. Görünürlük politikaları henüz profil veya presence veri yollarına uygulanmaz.

## Mevcut Durum ve Doğrulanmış Boşluklar

- `UserSettings` profil/presence görünürlüğü, saat dilimi, tarih/saat biçimi veya yoğunluk alanı taşımıyor.
- Web `/api/v1/users/me/settings` endpoint'i mevcut ayarları düz bir cevapla okuyor ve bağımsız alanlardan oluşan kısmi `PATCH` kabul ediyor.
- Mobil `/api/v1/mobile/account/settings` endpoint'i gizlilik ve mesaj görünümü ayarlarını sunucuya kaydediyor.
- Mobil profil/presence görünürlüğü ayrıca AsyncStorage'da `EVERYONE | FRIENDS | NOBODY` olarak tutuluyor; sunucu bunu uygulamıyor.
- Mobil hesap ayarları cevap şeması kökte ve iç nesnelerde `.strict()`. Mevcut endpoint cevabına yeni alan eklemek eski mobil sürümlerin bütün cevabı reddetmesine neden olabilir.
- Veri dışa aktarma `UserSettings` satırının tamamını alıyor; hesap silme `UserSettings` satırını siliyor. Yeni sütunlar bu iki backend akışına doğal olarak dahil olur.
- `INVISIBLE` durumu mevcut presence katmanında her zaman `OFFLINE` olarak yayınlanıyor. Bu güvenlik davranışı korunmalı.
- Aktif oturumlar/cihazlar ayrı bir domain ve veri kaynağı sorunu; Faz 1 kapsamında değil.

## Tasarım Seçenekleri

### A. Mevcut `UserSettings` modelini genişletmek — seçilen

Artıları:

- Kullanıcı başına mevcut bire bir ayar kaydını kullanır.
- Yeni tablo, join veya ek sorgu oluşturmaz.
- Mevcut silme ve dışa aktarma davranışına otomatik dahil olur.
- Varsayılanlarla eklemeli migration yapılabilir.

Eksisi:

- `UserSettings` genişlemeye devam eder. Bu fazdaki altı alan için yeni aggregate/tablo maliyeti daha yüksek olduğu için kabul edildi.

### B. Yeni `UserPreferences` tablosu

Domain ayrımı daha belirgin olur; fakat ikinci bire bir tablo, join/upsert ve yaşam döngüsü koordinasyonu getirir. Mevcut ölçek ve sorgu şekli bunu gerektirmiyor.

### C. JSON tercih sütunu

Şema evrimi kolay görünür; fakat tip güvenliği, migration görünürlüğü, veri doğrulama ve sorgulanabilirlik zayıflar. Seçilmedi.

## Kilit Tasarım Kararları

1. Kalıcı alanlar mevcut `UserSettings` modeline eklenir.
2. Profil ve presence görünürlüğü aynı değerleri kullansa da anlamları ve gelecekteki evrimleri farklı olduğu için ayrı enum'lardır.
3. Veritabanında `timeZone = null`, “cihaz/tarayıcı otomatik seçsin” anlamına gelir. API bunu açık biçimde `AUTO` olarak temsil eder.
4. Sunucu ayarların tek doğruluk kaynağıdır. Daha önce uygulanmayan yerel mobil görünürlük değerleri sunucuya taşınmaz.
5. Eski mobil istemcileri bozmamak için mevcut strict mobil hesap ayarları cevabına yeni alan eklenmez. Dar bir mobil preferences endpoint'i oluşturulur.
6. Web mevcut settings endpoint'ini genişletir; endpoint'in alan-bazlı kısmi `PATCH` davranışı korunur.
7. Yeni bağımlılık, yeni cache, yeni tablo veya yeni index eklenmez.
8. Faz 1'de kullanıcıya “gizlilik uygulandı” izlenimi verilmez. Eski preview satırları kaldırılır; yeni kontroller ilgili davranış fazına kadar gösterilmez.
9. Faz 1, web ve mobile production ayar kabuğunu aynı bilgi mimarisi ve platforma doğal etkileşimlerle yeniden tasarlar.

## Domain Sözleşmesi

| Alan                 | Wire değeri                      | DB temsili           | Varsayılan    | Anlam                                            |
| -------------------- | -------------------------------- | -------------------- | ------------- | ------------------------------------------------ |
| `profileVisibility`  | `EVERYONE \| FRIENDS \| NOBODY`  | `ProfileVisibility`  | `EVERYONE`    | Profili kimlerin görebileceği                    |
| `presenceVisibility` | `EVERYONE \| FRIENDS \| NOBODY`  | `PresenceVisibility` | `EVERYONE`    | Çevrimiçi durumunu kimlerin görebileceği         |
| `timeZone`           | `AUTO` veya doğrulanmış IANA adı | nullable `String`    | `null`        | Otomatik ya da kullanıcı seçimi zaman dilimi     |
| `dateFormat`         | `LOCALE \| DMY \| MDY \| YMD`    | `UserDateFormat`     | `LOCALE`      | Tarih bileşenlerinin sırası                      |
| `timeFormat`         | `LOCALE \| H12 \| H24`           | `UserTimeFormat`     | `LOCALE`      | 12/24 saat gösterimi                             |
| `interfaceDensity`   | `COMFORTABLE \| COMPACT`         | `InterfaceDensity`   | `COMFORTABLE` | Desteklenen yüzeylerde bileşen aralığı/yoğunluğu |

### Değer semantiği

- `profileVisibility = EVERYONE`: mevcut erişim kuralları içindeki tüm kimliği doğrulanmış kullanıcılar.
- `profileVisibility = FRIENDS`: hesap sahibi ve kabul edilmiş arkadaşlar.
- `profileVisibility = NOBODY`: yalnız hesap sahibi. Yetkili moderasyon/operasyon erişimi kullanıcı arayüzü görünürlüğü değildir ve ayrı yetkilendirme kurallarına tabidir.
- `presenceVisibility = EVERYONE`: mevcut ürün ilişki bağlamlarında izinli izleyiciler; herkese açık global presence yayını anlamına gelmez.
- `presenceVisibility = FRIENDS`: hesap sahibi ve kabul edilmiş arkadaşlar.
- `presenceVisibility = NOBODY`: yalnız hesap sahibi.
- Engelleme ve `INVISIBLE` kontrolleri görünürlük tercihlerinden üstündür. Hiçbir tercih engellenmiş kullanıcıya veri açamaz; `INVISIBLE` dışarıya daima `OFFLINE` kalır.
- `LOCALE`, uygulama dilinden ve platform locale'inden türetilen mevcut davranışı korur.
- `timeFormat` bugün önizleme satırı olmasa da tarih/saat gösterimini daha sonra breaking migration yapmadan tek sözleşmede tamamlamak için bu temelde yer alır.
- `interfaceDensity` yalnız düzen yoğunluğudur; yazı ölçeği, reduced motion, ekran okuyucu veya kontrast ayarı değildir.

## Veritabanı Tasarımı

Prisma'ya aşağıdaki enum ve alanlar eklenir:

```prisma
enum ProfileVisibility {
  EVERYONE
  FRIENDS
  NOBODY
}

enum PresenceVisibility {
  EVERYONE
  FRIENDS
  NOBODY
}

enum UserDateFormat {
  LOCALE
  DMY
  MDY
  YMD
}

enum UserTimeFormat {
  LOCALE
  H12
  H24
}

enum InterfaceDensity {
  COMFORTABLE
  COMPACT
}

model UserSettings {
  profileVisibility  ProfileVisibility  @default(EVERYONE)
  presenceVisibility PresenceVisibility @default(EVERYONE)
  timeZone           String?
  dateFormat         UserDateFormat     @default(LOCALE)
  timeFormat         UserTimeFormat     @default(LOCALE)
  interfaceDensity   InterfaceDensity   @default(COMFORTABLE)
}
```

Migration kuralları:

- Migration `packages/db/prisma/rebaseline-migrations/<timestamp>_user_account_preferences/migration.sql` altında oluşturulur.
- Uygulama anında güncel migration başı yeniden kontrol edilir; isim ondan sonra sıralanır. Mevcut çalışma ağacındaki rebaseline değişiklikleri üzerine körlemesine sabit timestamp kullanılmaz.
- Enum'lar oluşturulur; beş enum sütunu güvenli varsayılanlarla `NOT NULL`, `timeZone` nullable eklenir.
- Veri backfill sorgusu gerekmez; varsayılanlar mevcut davranışı korur.
- Index eklenmez. Bütün okumalar zaten unique `userId` üzerinden tek `UserSettings` satırına gider.
- Destructive down migration yazılmaz. Kod rollback'inde sütunlar yerinde bırakılır; daha sonra ayrı ve doğrulanmış temizlik kararı olmadan drop yapılmaz.

## Ortak Tip ve Doğrulama Sözleşmesi

Yeni `packages/types/src/account-preferences.ts` dosyası yalnız domain/wire sözleşmesini taşır:

- `ProfileVisibilitySchema`
- `PresenceVisibilitySchema`
- `TimeZonePreferenceSchema`
- `UserDateFormatSchema`
- `UserTimeFormatSchema`
- `InterfaceDensitySchema`
- `AccountPreferencesSchema`
- `AccountPreferencesPatchSchema`
- karşılık gelen TypeScript tipleri ve immutable varsayılan nesnesi

`AccountPreferencesPatchSchema`:

- Her alan bağımsız optional.
- En az bir tanımlı alan ister.
- Bilinmeyen alanları reddeder (`.strict()`).
- Client tarafında `timeZone`, `AUTO` veya trim sonrası 1–64 karakterlik adaydır.
- IANA semantik doğrulaması güven sınırı olan sunucuda ayrıca yapılır.
- Bu en-az-bir-alan ve `.strict()` davranışı yeni dar mobile preferences endpoint'ine aittir. Web'in birleşik settings PATCH'i ortak alan şemalarını kullanır; mevcut boş-body ve unknown-key davranışını bu fazda değiştirmez.

Sunucu zaman dilimi normalizasyonu:

1. `AUTO` -> DB `null`.
2. Diğer değer trim edilir; maksimum 64 karakter kontrol edilir.
3. `Intl.DateTimeFormat("en-US", { timeZone: value })` ile geçerlilik doğrulanır.
4. `resolvedOptions().timeZone` ile canonical değer saklanır.
5. Geçersiz değer mevcut güvenli API hata zarfıyla `400` döner; ham exception/stack kullanıcıya çıkmaz.

Yeni dependency kullanılmaz. `Intl` mevcut Node runtime yeteneğidir.

## API Tasarımı

### Web: mevcut endpoint'i genişlet

`GET /api/v1/users/me/settings` cevabına altı alan düz biçimde eklenir. Mevcut alanlar ve isimleri değişmez.

`PATCH /api/v1/users/me/settings` aynı altı alanı bağımsız kabul eder:

```json
{
  "profileVisibility": "FRIENDS",
  "timeZone": "Europe/Istanbul",
  "dateFormat": "DMY"
}
```

Kurallar:

- Gönderilmeyen alanlar değiştirilmez.
- Mevcut layout, notification ve privacy alanları aynı davranışı sürdürür.
- Yazma mevcut `settings:update` rate limit'ini kullanır.
- DB `null` zaman dilimi cevapta `AUTO` olur.
- Route test edilebilirlik için dar bir `route-logic`/dependency sınırına ayrılır; generic repository, factory veya yeni servis katmanı kurulmaz.
- Web route'u mevcut alanlarla `AccountPreferences` tipini birleştiren `UserSettingsResponse` tipini kullanır.
- `settings/client.ts` yeni `UserSettingsResponse` tipine geçer. Bu fazda dokunulmayan `settings-panel.tsx` import'unu kırmamak için route, `UserLayoutSettings` adını aynı tipe geçici alias olarak re-export eder.

### Mobile: yeni dar endpoint

`GET /api/v1/mobile/account/preferences`

```json
{
  "profileVisibility": "EVERYONE",
  "presenceVisibility": "EVERYONE",
  "timeZone": "AUTO",
  "dateFormat": "LOCALE",
  "timeFormat": "LOCALE",
  "interfaceDensity": "COMFORTABLE"
}
```

`PATCH /api/v1/mobile/account/preferences` aynı şeklin en az bir alanını kabul eder ve güncel tam nesneyi döndürür.

Kurallar:

- `requireMobileApiUserId` ve `mobile:account:settings` rate-limit anahtarı kullanılır; gereksiz yeni rate-limit ailesi yaratılmaz.
- Bütün cevaplarda mevcut mobil hesap ayarları endpoint'i gibi `Cache-Control: no-store, no-cache, must-revalidate` bulunur.
- Mevcut `/api/v1/mobile/account/settings` cevap ve request şekli değişmez. Eski strict mobil istemciler korunur.
- Yeni mobil client fonksiyonları bu endpoint'i çağırabilir; ekran bağlantısı ve yerel değer geçişi Faz 3'e aittir.

## Platform Uyumluluğu

### Eski veriler

- Bütün mevcut hesaplar etkin davranışı koruyan varsayılanlarla okunur.
- `timeZone = null` cevapta `AUTO` görünür.
- Hiçbir profil/presence verisi Faz 1 nedeniyle gizlenmez veya açılmaz; enforcement yoktur.

### Eski web/desktop istemcileri

- Mevcut alanlar değişmez.
- Cevaba eklenen alanlar aynı dağıtılan web kodu tarafından tüketilir; Tauri web yüzeyi de aynı sözleşmeyi kullanır.
- Ayar kabuğu değişir; mevcut gerçek kontrollerin davranışı değişmez. Yeni preference kontrolleri ilgili davranış fazına kadar görünmez.

### Eski mobil istemciler

- Mevcut strict `/mobile/account/settings` cevabı değişmediği için parse hatası oluşmaz.
- Yeni endpoint'i bilmeyen sürümler çalışmaya devam eder.
- AsyncStorage görünürlük değerleri bu fazda okunmaya/yazılmaya devam edebilir; henüz server canonical değeri ezmez.

### Sonraki mobil geçiş kuralı

Faz 3'te ilk geçiş için açık karar:

1. Başarılı server preference okumasından sonra sunucu değeri koşulsuz kazanır.
2. Eski AsyncStorage görünürlük değerleri sunucuya yazılmaz. Bu değerler backend tarafından uygulanmadığı ve birden fazla cihazda çelişebildiği için güvenilir kullanıcı politikası sayılmaz.
3. Server okuması başarılı olduktan sonra legacy anahtarlar temizlenir.
4. Ağ/validasyon hatasında son bilinen UI durumu korunabilir; legacy anahtar silinmez ve sunucuya yazma yapılmaz.
5. Özellik etkinleştiğinde kullanıcı yeni server-backed kontrol üzerinden bilinçli seçim yapar.

Bu algoritma Faz 1'de uygulanmaz; yalnız sözleşme uyumluluğu için şimdiden kilitlenir.

## Faz 1 Dosya Etki Haritası

Uygulama sırasında beklenen dar kapsam:

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/rebaseline-migrations/<timestamp>_user_account_preferences/migration.sql`
- `packages/db/prisma/schema-user-account-preferences.test.mjs` — yeni
- `packages/types/src/account-preferences.ts` — yeni
- `packages/types/src/account-preferences.test.ts` — yeni
- `packages/types/src/index.ts`
- `apps/web/src/app/api/v1/users/me/settings/route.ts`
- `apps/web/src/app/api/v1/users/me/settings/route-logic.ts` — yeni, dar test sınırı
- `apps/web/src/app/api/v1/users/me/settings/route-logic.test.ts` — yeni
- `apps/web/src/lib/settings/client.ts`
- `apps/web/src/components/settings/settings-panel.tsx` — production web ayar kabuğu
- `apps/web/src/components/settings/settings-sidebar.tsx` — responsive kategori navigasyonu
- ilgili web settings component/visual testleri
- `apps/web/src/app/api/v1/mobile/account/preferences/route.ts` — yeni
- `apps/web/src/app/api/v1/mobile/account/preferences/route-logic.ts` — yeni
- `apps/web/src/app/api/v1/mobile/account/preferences/route-logic.test.ts` — yeni
- `apps/mobile/src/account/mobile-account-preferences-client.ts` — yeni, UI'ya bağlanmaz
- `apps/mobile/scripts/mobile-account-preferences-client.test.ts` — yeni
- `apps/mobile/src/app/screens/mobile-account-settings-screen.tsx` — production mobile ayar kabuğu
- `apps/mobile/src/app/screens/mobile-account-settings-screen.styles.ts`
- `apps/mobile/component-tests/mobile-account-settings-redesign.test.tsx`
- `apps/mobile/component-tests/mobile-account-settings-screen-integration.test.tsx`
- `apps/web/src/lib/locale/messages/en.ts`
- `apps/web/src/lib/locale/messages/tr.ts`
- `apps/mobile/src/locale/mobile-copy.ts`
- `apps/web/src/lib/account/privacy-service.ts` — export `schemaVersion` 2
- `apps/web/src/lib/account/privacy-service.test.ts` — export karakterizasyonu

Faz 1'de dokunulmaması gerekenler:

- profil sorguları ve profil ekranları
- presence broadcast/cache/socket veri yolları
- density CSS/tasarım token'ları
- global tarih/saat formatter kullanımları
- oturum/cihaz kayıt modeli
- veri dışa aktarma streaming/iş kuyruğu
- hesap silme arayüzü

## Test Matrisi

| Katman                 | Zorunlu testler                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| DB şema                | Enum üyeleri tam; altı alan doğru tip/default/nullability; index eklenmemiş                                                              |
| Migration              | Doğru rebaseline dizininde; enum ve sütun SQL'i var; mevcut migration başından sonra sıralı                                              |
| Ortak tipler           | Tam cevap; her enum değeri; varsayılanlar; boş patch red; bilinmeyen alan red; uzun/geçersiz aday red                                    |
| Timezone               | `AUTO`; `Europe/Istanbul`; `UTC`; trim/canonicalization; geçersiz ad; 64+ karakter                                                       |
| Web GET                | Eski alanlarla yeni alanların tam cevabı; DB null -> `AUTO`                                                                              |
| Web PATCH              | Her alan bağımsız; çoklu patch; omitted alan korunur; invalid enum/IANA -> 400; rate limit/auth hatası korunur                           |
| Mobile GET/PATCH       | Mobile auth; no-store; tam cevap; en az bir alan; invalid input; DB/API mapping                                                          |
| Eski mobile sözleşmesi | `/mobile/account/settings` response shape değişmemiş; mevcut contract testleri aynen geçer                                               |
| Mobile client          | Doğru URL/method/body; response parse; hata iletimi; UI/store side effect yok                                                            |
| Web tasarım            | Responsive kategori navigasyonu; mevcut gerçek kontroller; preview satırı yok; loading/error/focus/light/dark görsel kabul               |
| Mobile tasarım         | Native navigation/sheet standardı; mevcut gerçek kontroller; preview satırı yok; safe-area/offline/accessibility/light/dark görsel kabul |
| Export                 | `schemaVersion` 2; `preferences.settings` içinde altı alan serialize edilir; hassas yeni veri/log yok                                    |
| Delete                 | Yeni tablo olmadığı için mevcut `userSettings.deleteMany` karakterizasyonu yeterli; regressionsız geçer                                  |

## Güvenlik

- Bütün input güven sınırında Zod ve IANA semantic kontrolünden geçer.
- Authentication ve authorization platforma özgü mevcut kapılardan geçer; ortak bir “iki auth türünü tahmin et” route'u yapılmaz.
- Engelleme ve `INVISIBLE` üstünlük kuralları Faz 3 enforcement tasarımında zorunlu kabul kriteridir.
- Faz 1 UI'yi etkinleştirmediği için uygulanmayan gizlilik garantisi kullanıcıya vaat edilmez.
- Yeni değerler log, telemetry veya error context'e eklenmez; zaman dilimi düşük hassasiyetli olsa da gereksiz toplanmaz.
- Hesap dışa aktarması kullanıcının kendi doğrulanmış akışında yeni tercihleri içerir.

## Performans

- Web mevcut `UserSettings` okuma/update'ına alan ekler. Yeni mobil endpoint çağrıldığında tek unique `userId` satırı okur/yazar.
- Yeni join, N+1, cache veya invalidation yok.
- Index yok; tekil `userId` lookup zaten indexlidir.
- Cevap artışı küçüktür.
- `Intl.DateTimeFormat` yalnız preference yazımında çalışır; hot read path'e eklenmez.

## Dağıtım ve Geri Alma

Dağıtım sırası:

1. Güncel rebaseline migration başı ve dirty WIP çakışması yeniden kontrol edilir.
2. Additive DB migration uygulanır.
3. Prisma client/types üretilir ve API/contract kodu dağıtılır.
4. UAT üzerinde eski web/mobile sözleşme smoke testleri ve yeni endpoint smoke testleri yapılır.
5. Web/mobile ayar kabukları UAT'ta doğrulanır; davranışı hazır olmayan preview veya aktif kontrol bulunmadığı doğrulanır.

Geri alma:

- Uygulama kodu eski sürüme alınabilir; eski kod ek sütunları yok sayar.
- Sütun/enum drop edilmez. Bu, hızlı rollback sırasında veri kaybını ve tablo kilidini önler.
- Yeni mobile endpoint eski istemciler tarafından çağrılmadığı için kaldırılması mevcut mobil akışı bozmaz.

## Kabul Kriterleri

Faz 1 ancak aşağıdakilerin tamamı kanıtlandığında tamamdır:

- [ ] Migration yalnız eklemeli; mevcut hesap verisi kaybolmuyor.
- [ ] Altı preference alanı güvenli varsayılanlarla kalıcı.
- [ ] Sunucu invalid enum ve IANA değerlerini reddediyor.
- [ ] Web GET/PATCH yeni alanları destekliyor; omitted alanlar korunuyor.
- [ ] Yeni mobile preferences GET/PATCH auth, rate limit ve no-store kurallarına uyuyor.
- [ ] Mevcut strict mobil hesap ayarları endpoint şekli değişmiyor.
- [ ] Eski hesaplar ve eski istemciler mevcut davranışı sürdürüyor.
- [ ] Export yeni alanları içeriyor; deletion mevcut UserSettings yaşam döngüsünü koruyor.
- [ ] Web/mobile production ayar kabukları tamam; mevcut gerçek kontroller çalışıyor; preview satırları kaldırılmış.
- [ ] Profile enforcement, presence enforcement ve formatter/density davranışı aktive edilmiyor; bunlara ait kontroller görünmüyor.
- [ ] Hedefli DB/types/web/mobile testleri geçiyor.
- [ ] İlgili typecheck/lint kapıları geçiyor.
- [ ] UAT smoke sonucu source/test kanıtından ayrı raporlanıyor.

## Faz 1 Sonrası Bağımlılıklar

- Aktif oturumlar/cihazlar: gerçek session registry ve revoke yeteneği gerektirir.
- Profil/presence görünürlüğü: bütün okuma, arama, cache ve socket yayın noktalarında merkezi enforcement gerektirir.
- Saat dilimi/tarih/saat biçimi: ortak formatter adaptörü ve kademeli çağrı noktası geçişi gerektirir.
- Interface density: tasarım token'ları ve erişilebilirlik regresyon testleri gerektirir.
- Veri dışa aktarma/hesap silme UI: mevcut backend'in arayüz, reauth ve büyük export davranışıyla bağlanmasını gerektirir.

Bu sonraki işler Faz 1'in kabul şartı değildir.

## Onay Paketi

Onayla birlikte şu kararlar kilitlenmiş sayılır:

1. Altı alan ve enum değerleri.
2. DB `null` / API `AUTO` zaman dilimi eşlemesi.
3. Profil ve presence için ayrı enum kullanımı.
4. Web mevcut endpoint genişletmesi.
5. Eski mobil strict sözleşmeyi koruyan yeni dar mobile endpoint.
6. Faz 1'de UI ve enforcement yapılmaması.
7. Mobile legacy görünürlük değerlerinin sunucuya taşınmaması; temizliğin Faz 3'e bırakılması.
8. Web/mobile ayar kabuğunun Faz 1'de production olarak yeniden tasarlanması; hazır olmayan kontrollerin gizlenmesi.

Beş fazın web/mobile tasarım standardı: `2026-08-13-account-settings-five-phase-cross-platform-design.md`.

Onaydan sonra ayrı uygulama planı çıkarılır; ardından test-first geliştirme başlar.
