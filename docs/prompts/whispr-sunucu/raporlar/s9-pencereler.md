# Ş9 — Davet · kanal bildirimleri · etkinlik pencereleri

> Dalga 4. Kaynak: `docs/prompts/whispr-sunucu/10-dalga4-s9-davet-bildirim-etkinlik-pencereleri.md`.
> Otorite: `design_handoff/design_handoff_sunucu/design/Sunucu.dc.html` inline `style` >
> `Sunucu-referans.html` > `SPEC-SUNUCU.md` > `PROMPT.md`.
> Bağımlılık: Ş0 (sözlük + sözleşme), Ş3 (davet API + QR), Ş8 (kabuk + parçalar).
> Dal: `uat`. Tarih: 2026-08-25.

---

## 0. Şeride başlarken bulunan gerçek — Ş8 aynı anda koşuyordu

Şerit dosyası hem "Bağımlılık: **Ş8**" hem de "Paralel: Ş8, Ş10" diyor. İşe başlandığında
`components/servers/modals/` ve `components/servers/shared/` **yoktu**; üç pencere de kabuksuz
çizilemezdi. Karar: Ş8'in şerit dosyasının §1–§3'ünde tanımlı iki parça (`server-modal-shell.tsx`
ve `option-chip-group.tsx`) Ş8'in **kendi yollarında**, Ş8'in yazdığı sözleşmeyle kuruldu — ikinci
bir kabuk yazmak yerine.

Ş8 çalışma sırasında kendi sürümlerini indirdi ve ikisi de değişti:

| Dosya                           | Sonuç                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modals/server-modal-shell.tsx` | Ş8'in sürümü kaldı; `bodyClassName` + `bodyPaddingX` ekledi (Ş10 iki kolonlu gövde için). Ş9'un kullandığı `footer` · `scrollBody` · `tone` · `width` yuvaları korundu |
| `shared/option-chip-group.tsx`  | Ş8'in sürümü kaldı; API `options`/`value`/`onChange`/`title` + `variant` oldu. Davet penceresi bu API'ye uyarlandı (`variant="settings"`)                              |

Yani şerit **hiçbir dosyayı çiftlemedi**; Ş8'in nihai sürümleri kazandı, Ş9 onların tüketicisi oldu.

Ayrıca prompt'un iki varsayımı kodda yanlış çıktı:

1. **"Mobil bildirimleri de sustur"un sunucu karşılığı yok"** — var.
   `UserChannelSettings.mobilePush` kolonu `schema.prisma:1965`'te duruyor (varsayılan `true`).
   Eksik olan kolon değil, onu okuyan/yazan uçtu. `TODO(api):` + mock yazmak yerine mevcut uç
   (`/channels/[channelId]/notification-settings`) alanı okumaya ve yazmaya başladı — yeni uç
   yok, yeni migration yok (§2.2).
2. **Ş3 "web QR'ı yok" bırakmamış** — `lib/invites/qr.ts` (`renderInviteQr`) hazır ve renkleri
   token'dan okuyor. Ş9 yalnız canvas'ı bağladı; ikinci bir QR üreticisi yazılmadı.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                                         | Satır | İş                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/servers/invite-form.ts`                                     | 196   | §6.3 saf mantık: 6+6 çip kataloğu, gövde, bağlantı, bilgi kutusu anahtarı, arkadaş filtresi, yetki kapısı                                                                                            |
| `apps/web/src/lib/servers/invite-form.test.ts`                                | 127   | 11 test (çip↔şema kesişimi, `channelId` üç hâli, Türkçe küçültmeli arama)                                                                                                                            |
| `apps/web/src/lib/servers/channel-notifications.ts`                           | 120   | §6.4 saf mantık: 3 seçenek + tonlar, `mobilePush` adapteri, ok tuşu adımı                                                                                                                            |
| `apps/web/src/lib/servers/channel-notifications.test.ts`                      | 79    | 7 test                                                                                                                                                                                               |
| `apps/web/src/lib/servers/event-form.ts`                                      | 365   | §6.5 saf mantık: sayaçlar, `gg.aa.yyyy`+`ss:dd` → ISO, sıralama kuralı, `entityType` türetimi, ayak metni                                                                                            |
| `apps/web/src/lib/servers/event-form.test.ts`                                 | 171   | 15 test                                                                                                                                                                                              |
| `apps/web/src/components/servers/modals/channel-invite-modal.tsx`             | 687   | Davet penceresi (480) + QR + arkadaş sekmesi                                                                                                                                                         |
| `apps/web/src/components/servers/modals/channel-invite-modal.test.tsx`        | 164   | 13 çizim testi                                                                                                                                                                                       |
| `apps/web/src/components/servers/modals/channel-notifications-modal.tsx`      | 386   | Kanal bildirimleri (460)                                                                                                                                                                             |
| `apps/web/src/components/servers/modals/channel-notifications-modal.test.tsx` | 99    | 8 çizim testi                                                                                                                                                                                        |
| `apps/web/src/components/servers/modals/create-event-modal.tsx`               | 511   | Etkinlik oluştur (560), gövde + ayak ayrı                                                                                                                                                            |
| `apps/web/src/components/servers/modals/create-event-modal.test.tsx`          | 164   | 12 çizim testi                                                                                                                                                                                       |
| `apps/web/src/components/servers/modals/modal-focus-contract.test.ts`         | 66    | 5 kaynak denetimi: üç pencere kendi tuzağını yazmıyor, `ui/modal` üç davranışı hâlâ taşıyor. **Ş8 bu dosyayı sonradan genişletti** (kendi iki penceresi + K11 katman sözleşmesi) — dosya artık ortak |

**Toplam 3 135 satır, 71 yeni test.**

### 1.2 Düzenlenen dosyalar

| Dosya                                                            | Ne değişti                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/modal.tsx`                                        | `style` · `overlayStyle` prop'ları (rem hesaplı kart ölçüsü bir Tailwind sınıfına sığmıyor ve `app-overlay`in zeminini yalnız satır içi bir değer ezer); `initialFocusRef` `exactOptionalPropertyTypes` için `\| undefined` aldı                      |
| `app/api/v1/channels/[channelId]/notification-settings/route.ts` | GET yanıtı `{ level, mobilePush }`; PATCH gövdesi **opsiyonel** `mobilePush`. Alan atlanırsa satırın mevcut mobil tercihi korunur                                                                                                                     |
| `lib/workspace/client.ts`                                        | `ChannelNotificationSettingsResponseSchema` + `mobilePush`; `updateChannelNotificationSettings` hem düz düzey hem `{level, mobilePush}` alır; `createServerInvite` artık `CreateServerInviteInput` tipini kullanıyor (elle yazılmış ikiz tip silindi) |
| `lib/store.ts`                                                   | `inviteModal.channelId` alanı + `channelNotificationsModal` ve `serverEventModal` durumları, açma/kapatma eylemleri. Açma eylemleri diğer ikisini kapatır (K11: aynı anda tek pencere)                                                                |
| `components/shell/workspace-modals.tsx`                          | Eski davet penceresi (JSX + 5 state + mutation + kopyalama yardımcısı) **silindi**, yerine üç yeni pencere mount edildi; ölü `useEffect`/`useRef`/`cn` importları temizlendi                                                                          |
| `lib/locale/messages/{tr,en}.ts`                                 | **55** yeni anahtar (`server.modal.invite.*` 32 · `server.modal.notifications.*` 9 · `server.modal.event.*` 14) + `validation.event.endBeforeStart` (sözleşmenin mesaj anahtarı iki dilde de karşılıksızdı)                                           |

### 1.3 Uç sözleşmesi (değişen tek uç)

```
GET   /api/v1/channels/[channelId]/notification-settings
      -> { level: "all"|"mentions"|"muted", mobilePush: boolean }
PATCH /api/v1/channels/[channelId]/notification-settings
      { level, mobilePush? }  ->  { level, mobilePush }
```

Davet ve etkinlik uçlarına **dokunulmadı**: `POST /servers/[serverId]/invites` (Ş3) ve
`POST /servers/[serverId]/events` (`CreateServerScheduledEventSchema`) olduğu gibi kullanıldı.

---

## 2. SPEC'ten sapmalar

### 2.1 Davet bağlantısı `whispr.app/i/<kod>` değil `<origin>/invite/<kod>`

Tasarım `whispr.app/i/mobile-test-9fd2` yazıyor. Üründe davet rotası **`/invite/[code]`** ve tek
gerçek konak tarayıcının kendi kaynağı. Sabit bir alan adı gömmek, UAT'ta üretilen bir bağlantının
üretime gitmesi demekti. `buildServerInviteUrl(origin, code)` kaynağı dışarıdan alıyor; satırda
`https://` gösterilmiyor (tasarımda da yok).

### 2.2 Bilgi kutusunun kopyalanmadan önceki hâli ayrı anahtar

SPEC'in cümlesi "Bağlantı **kopyalandı** · 7 gün sonra kendiliğinden sona erer." ve kutu tasarımda
hep duruyor. Kutuyu hiç kopyalamamış kullanıcıya aynı cümleyle göstermek, olmamış bir eylemi
bildirmek olurdu. `notice.readyExpiring` / `notice.readyNever` eklendi; SPEC'in yazdığı iki cümle
**birebir** korundu ve yalnız kopyalandıktan sonra çıkıyor.

### 2.3 Süresiz davette sona erme cümlesi kurulmuyor

`Süresiz` seçiliyken "… sonra kendiliğinden sona erer." doğru olmaz. `notice.never` /
`notice.readyNever` ayrı metin. SPEC yalnız 7 günlük durumu yazıyor, süresiz hâli vermiyor.

### 2.4 Pencere varsayılanı `Sınırsız`, ayarlar bölümünün varsayılanı `25`

§6.3 kartı `KULLANIM Sınırsız`, §8.7'nin "Yeni davet" kartı `25 kullanım` ile açılıyor. İkisi de
SPEC'te açıkça yazılı; Ş9 yalnız pencerenin değerini taşıyor, Ş13 kendi varsayılanını kurar.

### 2.5 Davet penceresine iki sekme eklendi

K3 "arkadaş seçerek davet" istiyor, SPEC §6.3 tek kolonlu bir pencere çiziyor. 480 px'e ikinci bir
liste dikey olarak eklenseydi pencere kaydırılır hâle gelirdi. Şerit dosyasının izin verdiği
"ikinci bir **sekme**/blok" yolu seçildi: `Bağlantı` · `Arkadaşlar`.

### 2.6 QR kutusunun ölçüsü tasarımda yok

Referansta yalnız kesikli bir "QR kod" çipi var ve K3 onu kaldırıyor (Ş3'ün `qr.ts` başlığı da
bunu kaydediyor). Kutu 132 px seçildi — 480'lik gövdeye açıklama metniyle yan yana sığan ölçü.
Sözlüğe **konmadı**: SPEC'ten gelmeyen bir sayı `SERVER_METRICS`'e girerse parity denetimi onu
tasarımdan gelmiş gibi kilitler.

### 2.7 Etkinlik bitişi aynı gündür

Tasarımda tek `TARİH` kutusu var. `22:00–01:00` sessizce ertesi güne taşınsaydı kullanıcı hiç
görmediği bir tarihe etkinlik kurmuş olurdu. Bitiş başlangıçtan küçük **veya eşitse** sözleşmedeki
`validation.event.endBeforeStart` hatası veriliyor (şemanın `hasOrderedSchedule` kuralı kesin
büyüklük istiyor; sıfır uzunlukta etkinlik uçta `400` alırdı).

### 2.8 `entityType` `STAGE` üretmez

Sözleşme `STAGE | VOICE | EXTERNAL` taşıyor ama üründe sahne kanalı türü yok
(`WorkspaceChannelType = TEXT | VOICE`). Kanal sesliyse `VOICE`, değilse/seçilmemişse `EXTERNAL`.

### 2.9 Kanal çipi tekrar tıklanınca seçim kalkar

SPEC varsayılan olarak `live-room` seçili bir liste gösteriyor. Üründe kanal **opsiyonel**
(`channelId` nullable) ve kanalsız etkinlik `EXTERNAL` olarak geçerli. Bu yüzden çip iki durumlu:
seçili çipe basmak seçimi kaldırır. Varsayılan seçim yok — kanal adı sunucudan sunucuya değişiyor
ve "live-room" her sunucuda bulunmuyor.

### 2.10 Bildirim penceresinin ayağı ortak ayak düzeninde değil

Sözlüğün `SPEC_DEVIATIONS` başlığında zaten kayıtlı (Ş0). `modal.plainFooter*` kullanıldı:
üst kenar ve `surface-secondary/.5` zemin yok, boşluk `16px 22px 18px`.

### 2.11 Bildirim penceresinin `Kaydet` düğmesi değişiklik yokken pasif

SPEC pasiflik kuralı vermiyor. Değişiklik yokken aktif bir `Kaydet`, hiçbir şey yapmayan bir
istek atardı; pasif düğme dili (00 §6: `surface-tertiary` + `text-muted` + `not-allowed`) zaten
tanımlı olduğu için aynı dil uygulandı.

---

## 3. TODO(api)

**Yok.** Üç pencerede de mock alan kalmadı:

- Davet: `POST /servers/[serverId]/invites` (Ş3, düz + hedefli), `GET /friends`.
- Bildirim: `GET`/`PATCH /channels/[channelId]/notification-settings` (mobil anahtarı dâhil).
- Etkinlik: `POST /servers/[serverId]/events`.

Kalan tek boşluk **uç değil, tetikleyici** (§5).

---

## 4. Doğrulama çıktısı

| Komut                                                                                                                             | Sonuç                 |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `pnpm --filter @wizards/web exec node --test --import tsx src/lib/servers/{invite-form,channel-notifications,event-form}.test.ts` | **33/33 ✅**          |
| `pnpm --filter @wizards/web exec node --test --import tsx src/components/servers/modals/channel-invite-modal.test.tsx`            | **13/13 ✅**          |
| `pnpm --filter @wizards/web exec node --test --import tsx src/components/servers/modals/channel-notifications-modal.test.tsx`     | **8/8 ✅**            |
| `pnpm --filter @wizards/web exec node --test --import tsx src/components/servers/modals/create-event-modal.test.tsx`              | **12/12 ✅**          |
| `pnpm --filter @wizards/web exec node --test --import tsx src/components/servers/modals/modal-focus-contract.test.ts`             | **5/5 ✅**            |
| `pnpm --filter @wizards/types test`                                                                                               | **529/529 ✅**        |
| `pnpm --filter @wizards/web typecheck`                                                                                            | **✅ temiz**          |
| `pnpm --filter @wizards/web lint`                                                                                                 | **✅ temiz** (exit 0) |
| `pnpm --filter @wizards/web test` (tam paket)                                                                                     | _§4.1_                |

### 4.1 Tam paket ve paralel şeritler

Tam paket koşusu sırasında Ş8'in aynı anda indirdiği `channel-advanced-settings.test.tsx`
kırmızıydı: bileşen `server.channel.bitrate.title` gibi **henüz sözlüğe girmemiş** anahtarları
çiziyor, testi ise `Audio bitrate` bekliyor. Ş9'un dokunduğu hiçbir dosya bu hatanın yolunda
değil; anahtarlar Ş8'in i18n adımıyla gelecek.

`e2e:a11y` ve `server-parity.spec.ts` **koşulamadı**: ikisi de ayakta bir sunucu ve tohumlanmış
veritabanı istiyor.

---

## 5. Sonraki şerit için not

### 5.1 Üç pencerenin tetikleyicisi bağlanmayı bekliyor

Pencereler `workspace-modals.tsx` içinde mount edildi ve store eylemleri hazır; her biri **tek
satırla** açılıyor:

| Pencere            | Açan çağrı                                                                                                                            | Kimin şeridi                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Davet              | `openInviteModal(serverId, { channelId })` — bugün kenar çubuğu, sunucu menüsü ve üye paneli çağırıyor; `channelId` yeni ve opsiyonel | Ş4 · Ş5 (bağlı)                                                              |
| Kanal bildirimleri | `openChannelNotificationsModal(channelId, channelName)`                                                                               | **Ş6** — `chat-area.tsx`'teki zil bugün hâlâ kendi satır içi menüsünü açıyor |
| Etkinlik oluştur   | `openServerEventModal(serverId)`                                                                                                      | **Ş13** — ayarların Etkinlikler bölümündeki `+ Etkinlik oluştur`             |

Ş6 ve Ş13 bu iki çağrıyı bağladığında pencereler uçtan uca çalışır; başka iş yok.

### 5.2 `chat-area`in bildirim menüsü Ş6'da silinmeli

`chat-area.tsx` bugün üç seçeneği bir popover'da çiziyor (`channel-notification-settings-menu`).
§6.4 aynı üç seçeneği bir pencerede istiyor. İkisi bir arada kalırsa aynı ayarın iki yüzeyi olur.
Pencere **aynı sorgu anahtarına** yazıyor (`["workspace","channel",id,"notification-settings"]`),
bu yüzden başlıktaki zil ve çip kaydetme anında güncelleniyor — Ş6'nın ek bir invalidate'e
ihtiyacı yok.

### 5.3 `mobilePush` artık gerçek; mobil tarafta karşılığı kontrol edilmeli

Uç bugün alanı yazıyor. Mobil push gönderiminin bu kolonu okuyup okumadığı **doğrulanmadı** —
okumuyorsa anahtar web'de çalışıp cihazda etkisiz kalır. Ş14'ün denetim listesine girmeli.

### 5.4 `updateChannelNotificationSettings` iki imzalı

Geriye dönük uyum için hem `("all")` hem `({ level, mobilePush })` kabul ediyor. Ş6 pencereye
geçtiğinde düz dize yolu tek çağıransız kalır ve silinebilir.

### 5.5 `ui/modal.tsx` artık satır içi `style` alıyor

Üç pencere de kart ölçüsünü oradan geçiriyor. Prop **opsiyonel** ve yalnız verildiğinde
yayılıyor (`exactOptionalPropertyTypes`); mevcut 30+ çağıran etkilenmedi.

### 5.6 Ş13 davet bölümünü yazarken

`lib/servers/invite-form.ts` çip kataloglarını, gövde kurucusunu, bağlantı biçimlendiricisini ve
arkadaş filtresini zaten taşıyor. §8.7'nin tek farkı varsayılanlar (`25 kullanım`) ve `Hedef kanal`
çip grubu; ikisi de aynı katalogdan beslenmeli, ikinci bir liste yazılmamalı.
