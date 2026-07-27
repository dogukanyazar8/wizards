# Admin Panel Kabuğu (Alt Proje B)

**Tarih:** 2026-07-26
**Dal:** uat
**Durum:** Tasarım yazıldı, onay bekliyor
**Bağımlılık:** yok. A ile paralel koşabilir (farklı dosyalar).
**Revizyon:** 2026-07-27 (spec-correction turu) — B1 (API yetki politikası) ve
B2 (rota bölünmesi) olarak ikiye ayrıldı; B1 canlı bir yetki açığını kapatıyor
ve ilk sırada. Komut paleti, varlık arama ve tema codegen'i v2'ye ertelendi.

## Bağlam

Admin paneli yeniden tasarımının altı alt projesinden ikincisi. A telemetri
verisini düzeltir; B o verinin gösterileceği kabuğu kurar. C, D, E ekranlarının
hepsi B'nin kurduğu rota ve navigasyon iskeletine oturur — bu yüzden B erken
gelmeli, yoksa her alt proje kendi kabuğunu uydurur.

Hedef kullanıcı: **platform operasyon ekibi** (küçük, tam yetkili).

## Problem

### Doğrulanmış mevcut durum

**1. Panel tek sayfa, navigasyon sahte.**

`apps/web/src/app/admin/page.tsx` — tek server component. `requireAdminUser()`
ve `getAdminDashboardSnapshot(days)` paralel çağrılıyor, sonuç tek prop olarak
`AdminDashboard`'a geçiyor.

`apps/web/src/components/admin/admin-dashboard.tsx:49` — `NAV_ITEMS` sekiz
girdi: `#overview`, `#users`, `#activity`, `#servers`, `#management`,
`#feedback`, `#notifications`, `#audit`. Hepsi **anchor**, rota değil.
Karşılıkları aynı dosyada `<section id="overview">` (`:367`),
`id="users"` (`:481`), `id="servers"` (`:579`), `id="notifications"` (`:652`),
`id="audit"` (`:691`), `id="activity"` (`:275`).

Sonuçlar: derin bağlantı yok (bir vakayı meslektaşına yollayamazsın), tarayıcı
geri tuşu bölüm değiştirmiyor, sekme başına yükleme durumu yok, ve her bölüm
her zaman DOM'da.

**2. Tek istekte 26 sorgu.**

`apps/web/src/lib/admin/dashboard.ts:290` — `getAdminDashboardSnapshotUncached`
tek `Promise.all` içinde 26 Prisma sorgusu koşuyor: metrikler, kullanıcı
sayıları, oturumlar, sunucular, kanallar, mesajlar, ek dosya toplamı, aktif
oturum satırları, medya grupları, istemci/cihaz/ülke/tarayıcı/OS kırılımları,
en iyi sunucular/kanallar, son kullanıcılar, son mesajlar, son kampanyalar,
son audit kayıtları.

TTL cache var (`dashboard.ts:257`), ama cache soğukken Audit sekmesine bakmak
tüm platform istatistiğini sorguluyor. C, D, E kendi ekranlarını eklerse bu
sayı büyür ve panel açılışı gitgide yavaşlar.

**3. Yetki ayrımı yok — ve açık UI'da değil, API'de.**

`apps/web/src/app/admin/layout.tsx` — `requireAdminUser()` rol filtresi olmadan
çağrılıyor. Beş rolün (`OWNER`, `ADMIN`, `SUPPORT`, `ANALYST`, `MODERATOR`)
hepsi aynı sayfayı, aynı verilerle görüyor.

Asıl sorun bir katman aşağıda: dört admin API rotası da rol filtresi olmadan
çağırıyor (`users/route.ts:20`, `servers/route.ts:9`,
`reports/activity.csv/route.ts:9`, `dashboard/route-logic.ts:27`). Yani
`ANALYST` rolündeki bir hesap ham e-posta listesini ve **tüm aktivite CSV
dışa aktarımını** alabiliyor — panelde hiçbir düğmeye basmadan, doğrudan
istekle.

Bu, UI refactor'ünden bağımsız bir güvenlik açığı. Ayrıntı ve çözüm: §5.

**4. Tasarım dili iki yerde ayrı gelişiyor.**

Mobil: `apps/mobile/src/design/themes.ts` — `MobileTheme` tipi (`:177`),
`lightTheme` (`:520`), `darkTheme` (`:808`). Tam token seti.

Web: `apps/web/src/app/globals.css` — HSL tabanlı CSS değişkenleri
(`--background`, `--foreground`, `--card`, `--primary`, `--danger`,
`--success`, `--warning` ve `-soft`/`-foreground` varyantları), artı
`--desktop-titlebar-height: 34px`. `apps/web/tailwind.config.ts` bunları
Tailwind'e bağlıyor.

İki set birbirinden habersiz. Aynı "tehlike kırmızısı" iki yerde ayrı ayrı
tanımlı ve senkron kalacağının garantisi yok.

**5. Tek dosya 756 satır.** `admin-dashboard.tsx` içinde biçimlendiriciler
(`formatNumber:59`, `formatBytes:75`, `formatDuration:63`), sunum primitifleri
(`Pill:150`, `MetricCard:163`, `SectionHeader:205`, `BreakdownList:232`,
`UsageChart:268`), `Sidebar:308` ve altı bölümün tamamı bir arada. Bir bölümü
değiştirmek dosyanın tamamını okumayı gerektiriyor.

## Hedefler

1. **Her admin API rotası capability ile korunur.** Rol filtresi unutulamaz
   hale gelir. (P0 — tek başına değer üretir, refactor'den önce uygulanabilir.)
2. Her bölüm gerçek rota olur; derin bağlantı, geri tuşu ve bölüm başına
   yükleme durumu çalışır.
3. Bir bölüm yalnızca kendi verisini sorgular.
4. Sol navigasyon kalıcı kabuk olur; bölüm içeriği `children` olarak akar.
5. Rol; hem navigasyon görünürlüğünü, hem sayfa erişimini, hem API erişimini
   aynı haritadan belirler.
6. Yoğunluk ölçeği admin'e özgü olur.

## Kapsam dışı

- Yeni metrik, yeni veri toplama yok. Mevcut veri neyse o gösterilir.
- Moderasyon kuyruğu (D), platform sağlık ekranları (C), kampanya değişiklikleri (E).
- İşlem bazlı scope sistemi. B yalnızca **rol → bölüm görünürlüğü** kurar;
  işlem düzeyi scope D ve E'nin ihtiyacı olduğunda onların spec'inde gelir.
- PII maskeleme — hedef kullanıcı tam yetkili operasyon ekibi.
- Mobil ve desktop admin yüzeyleri (F).
- **Komut paleti, varlık arama ve tema token codegen'i** — v2'ye ertelendi
  (§7). B'nin v1 kapsamı: gerçek rotalar + merkezi yetki politikası.
- Mobil admin uçlarının yetkilendirmesi. Mobil Bearer token kullanıyor,
  `requireAdminCapability` çerez oturumuna dayanıyor; mobil karşılığı F'de
  tanımlanır.

## Tasarım

### 1. Rota bölünmesi

Next.js App Router segmentleri:

```
apps/web/src/app/admin/
  layout.tsx                 # yetki + kabuk (sol nav, komut paleti)
  page.tsx                   # /admin → komuta merkezi (eski "overview")
  users/page.tsx
  servers/page.tsx
  activity/page.tsx
  operations/page.tsx
  feedback/page.tsx
  notifications/page.tsx
  audit/page.tsx
```

Her `page.tsx` kendi server component'i; kendi veri yükleyicisini çağırır.
Her segment kendi `loading.tsx` dosyasını alır — bölüm yüklenirken kabuk
ayakta kalır.

**Eski anchor bağlantıları — sunucuda yönlendirilemez.**
URL fragment'i (`#users`) HTTP isteğine hiç dahil edilmez; sunucu yalnızca
`/admin` görür. Sunucu tarafı yönlendirme teknik olarak imkânsız.

Karar: `/admin` sayfasına küçük bir client-side shim konur — mount anında
`window.location.hash` okunur, bilinen bir bölüm adıysa `router.replace` ile
karşılığına gidilir, hash temizlenir. Bilinmeyen hash yok sayılır.

Shim tek `useEffect`, sekiz elemanlı bir eşleme tablosu. Ömrü sınırlı: panel
kullanıcı sayısı bilinen ve küçük olduğu için üç ay sonra kaldırılabilir
(dosyaya kaldırma tarihi yorumu yazılır).

### 2. Snapshot bölünmesi

`getAdminDashboardSnapshot` bölüm başına yükleyicilere ayrılır:

| Yükleyici                       | Bölüm                  | Kaynak sorgular                                                 |
| ------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `getAdminOverviewSnapshot`      | `/admin`               | metrikler, kullanıcı/sunucu sayıları, kullanım serisi           |
| `getAdminUsersSnapshot`         | `/admin/users`         | kullanıcı listesi, durum kırılımı, son kayıtlar                 |
| `getAdminServersSnapshot`       | `/admin/servers`       | sunucu sayıları, en iyi sunucular/kanallar                      |
| `getAdminActivitySnapshot`      | `/admin/activity`      | aktif oturumlar, istemci/cihaz/ülke/tarayıcı/OS kırılımı, medya |
| `getAdminAuditSnapshot`         | `/admin/audit`         | son audit kayıtları                                             |
| `getAdminNotificationsSnapshot` | `/admin/notifications` | son kampanyalar                                                 |

`buildDailyMetricSeries` (`dashboard.ts:136`) ve `getDashboardDateRange`
(`:81`) saf fonksiyonlar — olduğu gibi paylaşılır, taşınmaz.

TTL cache deseni (`dashboard.ts:257`) yükleyici başına tekrarlanır; cache
anahtarı `${loader}:${days}` olur. `resetAdminDashboardSnapshotCacheForTests`
(`:62`) tüm yükleyicileri temizleyecek şekilde genelleştirilir.

**Karar: `AdminDashboardSnapshot` tipi kaldırılmaz, daraltılır.**
`Awaited<ReturnType<...>>` deseni (`dashboard.ts:43`) yükleyici başına
tekrarlanır. Böylece bileşenler hangi veriyi aldığını tipten okur ve bir
bölüme yanlışlıkla başka bölümün verisi geçirilemez.

### 3. Bileşen bölünmesi

`admin-dashboard.tsx` (756 satır) altıya ayrılır:

```
apps/web/src/components/admin/
  shell/admin-shell.tsx           # sol nav + kabuk (layout'tan çağrılır)
  shell/admin-command-palette.tsx
  shell/admin-nav-items.ts        # rol → bölüm haritası
  primitives/                     # Pill, MetricCard, SectionHeader,
                                  # BreakdownList, UsageChart
  format/admin-format.ts          # formatNumber/Bytes/Duration/DateTime
  sections/admin-overview.tsx
  sections/admin-users.tsx
  sections/admin-servers.tsx
  sections/admin-activity.tsx
  sections/admin-audit.tsx
```

`admin-management-panel.tsx` (631 satır), `admin-feedback-panel.tsx`
(658 satır), `notification-composer.tsx` (301 satır) yerlerinde kalır;
yalnızca yeni rotalardan çağrılırlar. Bunların iç bölünmesi kendi alt
projelerine (D ve E) bırakılır — B'nin işi değil.

### 4. Rol → bölüm görünürlüğü

`admin-nav-items.ts` içinde bildirimsel harita:

| Bölüm          | Görebilen roller                         |
| -------------- | ---------------------------------------- |
| Komuta merkezi | hepsi                                    |
| Kullanıcılar   | `OWNER`, `ADMIN`, `SUPPORT`, `MODERATOR` |
| Sunucular      | `OWNER`, `ADMIN`, `SUPPORT`, `MODERATOR` |
| Aktivite       | hepsi                                    |
| Operasyonlar   | `OWNER`, `ADMIN`                         |
| Geri bildirim  | `OWNER`, `ADMIN`, `SUPPORT`              |
| Bildirimler    | `OWNER`, `ADMIN`                         |
| Audit          | `OWNER`, `ADMIN`                         |

**Karar: harita tek kaynak, üç katmanda birden uygulanır.** Navigasyondan
gizlemek kozmetiktir; sayfa koruması URL'yi elle yazanı durdurur; ama asıl
açık API katmanındadır (bkz. §5). Üçü de aynı haritayı okur.

### 5. Merkezi API yetki politikası — P0

Bu bölüm B'nin en kritik parçası. Panel UI'sinden bağımsız olarak bugün açık
olan bir yetki boşluğunu kapatır.

**Doğrulanmış açık:** aşağıdaki rotalar `requireAdminUser()`'ı **rol filtresi
olmadan** çağırıyor, yani `ANALYST` dahil her admin rolü erişebiliyor:

| Rota                                         | Satır | Ne sızıyor                           |
| -------------------------------------------- | ----- | ------------------------------------ |
| `api/v1/admin/users/route.ts`                | `:20` | Kullanıcı listesi, ham e-posta dahil |
| `api/v1/admin/servers/route.ts`              | `:9`  | Sunucu listesi                       |
| `api/v1/admin/reports/activity.csv/route.ts` | `:9`  | Tüm aktivite CSV dışa aktarımı       |
| `api/v1/admin/dashboard/route-logic.ts`      | `:27` | Platform geneli snapshot             |

Desen zaten mevcut ama tutarsız uygulanmış — `feedback/route-logic.ts:57`,
`notification-campaigns/route.ts:27`, `users/[userId]/route.ts:20` rolleri
doğru geçiyor. Yani sorun eksik altyapı değil, unutulabilir çağrı sözleşmesi.

**Çözüm: capability haritası + zorunlu parametre.**

```ts
// apps/web/src/lib/admin/capabilities.ts
export const ADMIN_CAPABILITIES = {
  "audit.read": ["OWNER", "ADMIN"],
  "campaign.send": ["OWNER", "ADMIN"],
  "export.activity": ["OWNER", "ADMIN"],
  "feedback.write": ["OWNER", "ADMIN", "SUPPORT"],
  "server.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  "user.ban": ["OWNER", "ADMIN", "MODERATOR"],
  "user.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  // ...
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminCapability = keyof typeof ADMIN_CAPABILITIES;

export async function requireAdminCapability(capability: AdminCapability): Promise<AdminAccessUser>;
```

`requireAdminCapability` mevcut `requireAdminUser`'ı sarar ve haritadaki rol
listesini uygular. Aynı harita `admin-nav-items.ts` tarafından da okunur —
bölüm görünürlüğü capability'den türer, ayrı liste tutulmaz.

**Karar: `requireAdminUser` parametresiz çağrılamaz hale getirilir.**
Bugünkü imza (`options: RequireAdminOptions = {}`) rol vermemeyi varsayılan
yapıyor; unutmak sessizce "herkese açık" demek. `roles` zorunlu parametre
olur ve `requireAdminCapability` tek genel giriş kapısı haline gelir. ESLint
kuralı `requireAdminUser`'ın `lib/admin/` dışından çağrılmasını yasaklar.

**Karar: yeni rota eklemek yetki tanımını zorunlu kılar.** Sözleşme testi
`app/api/v1/admin/**` altındaki her `route.ts` dosyasını tarar ve
`requireAdminCapability` çağrısı içermeyeni kırmızıya düşürür. Aksi halde bu
düzeltme bir kere yapılır ve altıncı yeni rotada yeniden bozulur.

**Kapsam notu:** bu bölüm panelin UI refactor'ünden bağımsız değer üretir ve
**önce uygulanabilir**. Rota bölünmesi ertelenirse bile bu kalır.

### 6. Tasarım tokenları

> **Güncelleme (2026-07-27):** görsel kaynak artık
> `design_handoff/design_handoff_admin_panel/` — kabuk, kit ve ölçüler
> [G spec'inden](2026-07-27-admin-design-handoff-implementation.md) gelir.
> Aşağıdaki yoğunluk token'ları yaklaşımı G'nin README ölçüleriyle
> değiştirildi; bu bölüm tarihsel gerekçe olarak duruyor.

**Yoğunluk ölçeği.** Renk paylaşılır, boşluk paylaşılmaz:

```css
--admin-row-height: 34px; /* mobil dokunma hedefi 44px */
--admin-row-gap: 4px;
--admin-section-gap: 20px;
--admin-control-height: 32px;
```

Sebep: admin ekranı fare ve klavyeyle kullanılır, ekranda satır yoğunluğu
kullanışlılığın kendisidir. Mobil dokunma hedefini masaüstü tablosuna taşımak
her tabloyu üçte bir daha az satır gösterir hale getirir.

**Renk için v1'de elle hizalama, codegen v2'de.**
Mobil `themes.ts` (`lightTheme:520` / `darkTheme:808`) referans alınır ve
`globals.css` değerleri ona göre bir kez düzeltilir. Türetme script'i +
sözleşme testi **v2'ye ertelendi** — iki tema sistemini otomatik senkronize
etmek kendi başına bir alt proje ve B'nin asıl işi (rota + yetki) onu
beklememeli. v1'de fark bir yorum satırıyla işaretlenir:
`globals.css` başında "renk kaynağı: apps/mobile/src/design/themes.ts".

### 7. v2'ye ertelenenler

Aşağıdakiler tasarımda kalıyor ama v1 kapsamında değil:

- **Komut paleti** (`Ctrl/Cmd+K`). Değerli, ama rota bölünmesi ve yetki
  politikası olmadan üzerine kurulacağı zemin yok. Rotalar gerçek olduğunda
  gezinme kısmı neredeyse bedava gelir.
- **Tema token codegen'i.** Yukarıda gerekçelendirildi.
- **Varlık arama.** Komut paletiyle birlikte gelir.

Bu erteleme B'yi tek bir cümleye indirger: _gerçek rotalar + merkezi yetki
politikası_. İkisi de ölçülebilir ve ikisi de sonraki alt projelerin ön koşulu.

## Test planı

TDD: davranışı önce sabitleyen testler, sonra refactor.

**Yetki (önce yazılır, refactor'den bağımsız):**

1. **API capability matrisi:** her admin rotası × beş rol. `ANALYST` ile
   `GET /api/v1/admin/users` **403** dönmeli; bugün 200 dönüyor.
2. **CSV dışa aktarımı kapalı:** `ANALYST` ile
   `GET /api/v1/admin/reports/activity.csv` 403.
3. **Kapsama sözleşmesi:** `app/api/v1/admin/**` altındaki her `route.ts`
   `requireAdminCapability` çağırmalı — dosya taraması testi. Yeni rota
   eklenip yetki verilmezse kırmızıya dönmeli.
4. **`requireAdminUser` kaçağı yok:** `lib/admin/` dışından çağrı ESLint
   kuralıyla engellenmeli.
5. **Tek harita:** navigasyon görünürlüğü ile API capability aynı kaynaktan
   türemeli — birinde olup diğerinde olmayan bölüm testi kırmalı.

**Refactor (davranışı önce sabitle):**

6. **Yükleyici eşdeğerliği:** bölüm yükleyicilerinin birleşimi, mevcut
   `getAdminDashboardSnapshot` çıktısıyla aynı değerleri üretmeli. Bu test
   refactor'dan **önce** yazılır ve refactor boyunca yeşil kalır.
7. **Sorgu izolasyonu:** `/admin/audit` yüklenirken kullanıcı/sunucu/medya
   sorguları koşmamalı (Prisma client mock'u üzerinden çağrı sayımı).
8. **Sayfa koruması:** `ANALYST` ile `/admin/audit` sayfası yönlendirilmeli
   ve navigasyonda görünmemeli.
9. **Anchor shim'i:** `/admin` sayfası `#users` hash'i ile açıldığında
   client-side `/admin/users`'a geçmeli; bilinmeyen hash yok sayılmalı.
   (Sunucu tarafı yönlendirme test edilmez — fragment sunucuya ulaşmıyor.)
10. **Yoğunluk:** admin tablo satırı `--admin-row-height` kullanmalı, mobil
    dokunma hedefi tokenı kullanmamalı (sözleşme testi).

## Bitti kanıtı

- `ANALYST` rolüyle `GET /api/v1/admin/users` ve `activity.csv` **403**
  dönüyor. (Bugünkü davranış: 200 + ham e-posta / tam CSV.)
- `app/api/v1/admin/**` altına yetkisiz yeni bir `route.ts` eklendiğinde
  sözleşme testi kırılıyor.
- `/admin/users` adresine doğrudan gidildiğinde çalışıyor; tarayıcı geri tuşu
  `/admin`'e dönüyor.
- Ağ panelinde `/admin/audit` yükleniyorken yalnızca audit sorguları görünüyor.

## Riskler

| Risk                                            | Etki                              | Karşılık                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yetki düzeltmesi refactor'e bağlanır ve gecikir | Açık üretimde kalır               | Yetki bölümü (§5) bağımsız teslim edilebilir; refactor beklemez                                                                                                               |
| Capability haritası eksik kalır                 | Yeni rota korumasız açılır        | Test 3 dosya taraması; ESLint kuralı doğrudan çağrıyı engeller                                                                                                                |
| Rol daraltması mevcut kullanımı kırar           | Operatör iş yapamaz               | Hedef kullanıcı tek ekip; roller bugün fiilen `OWNER`/`ADMIN`. Daraltma öncesi `AdminMembership` rol dağılımı sorgulanır                                                      |
| Çalışan kodun refactor'ü                        | Sessiz gerileme                   | Test 6 refactor'dan önce yazılır, eşdeğerliği sabitler                                                                                                                        |
| Paralel oturum çakışması                        | A, C, D, E aynı dosyalara dokunur | B yalnızca `app/admin/*`, `components/admin/{shell,sections,primitives}` ve `lib/admin/capabilities.ts` altına yazar; `lib/admin/dashboard.ts` bölünmesi tek oturumda yapılır |

## Sonraki adım

Onaydan sonra `writing-plans` ile uygulama planı. Kod değişikliği plan
onayından önce başlamaz.
