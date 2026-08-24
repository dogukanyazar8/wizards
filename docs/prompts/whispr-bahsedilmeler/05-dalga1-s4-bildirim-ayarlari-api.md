# Dalga 1 · Ş4 — Bildirim ayarları uçları (sessiz saatler, masaüstü kipi)

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş3.

En küçük şerit. Modalın (Ş8) arkasındaki kalıcılık ve mevcut Ayarlar sayfasıyla eşleme.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/notifications/mention-settings-service.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/notifications/mention-settings/route.ts` (yeni — `GET`, `PATCH`)
- `apps/web/src/lib/notifications/quiet-hours.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/settings/client.ts` (yalnız yeni sorgu anahtarı + fetch/patch)
- `apps/web/src/components/settings/*` — **yalnız** mevcut bildirim ayarları sayfasındaki
  `suppressRoleMentions` / `suppressEveryoneMentions` kontrollerinin yeni alanlara bağlanması
  (`graphify query "notification settings page toggles"` ile dosyayı doğrula; başka satır değişmez)

**Okunur, yazılmaz:** `workspace/message-notification-service.ts` (Ş2 sahibi),
`mobile/push-sender.ts`.

---

## İş

### 1. Alan eşlemesi (K6)

Modal 4 anahtar gösteriyor; DB'de iki tanesi zaten ters mantıkla duruyor. Eşleme **tek yerde**:

| Modal anahtarı          | Kolon                                                                | Yön                                |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| `Bana özel bahsetmeler` | `mentionSelf` (yeni)                                                 | doğrudan                           |
| `Rol bahsetmeleri`      | `suppressRoleMentions` (mevcut)                                      | **ters** (`açık = suppress false`) |
| `@herkes ve @burada`    | `suppressEveryoneMentions` (mevcut)                                  | **ters**                           |
| `Thread yanıtları`      | `mentionThreadReplies` (yeni, varsayılan **kapalı**)                 | doğrudan                           |
| `Masaüstü bildirimi`    | `desktopMentionMode` (`ALL`/`MENTIONS`/`OFF`, varsayılan `MENTIONS`) | doğrudan                           |
| Sessiz saatler          | `quietHoursEnabled/From/To/TimeZone`                                 | doğrudan                           |

Ters mantık **servis katmanında** çözülür; ne route ne bileşen `!suppress…` yazar.

### 2. Uçlar

```
GET  /api/v1/notifications/mention-settings  → MentionSettings
PATCH /api/v1/notifications/mention-settings → kısmi güncelleme, güncel MentionSettings
```

- Satır yoksa varsayılanlarla **lazy** oluşturulur (`upsert`), okuma yazma yapmaz —
  `GET` satır yoksa varsayılanı döndürür, `PATCH` oluşturur.
- `PATCH` gövdesi `MentionSettingsSchema.partial()` ile doğrulanır; bilinmeyen alan reddedilir.
- `quietHoursFrom` / `quietHoursTo` `HH:mm` (24 saat) — `"23:00"`, `"08:00"`. Geçersiz format 400. `from === to` 400 ("sıfır uzunlukta aralık" sessizce hep-açık anlamına gelirdi).
- `quietHoursTimeZone` yoksa `UserAccountPreferences.timeZone`, o da yoksa `"Europe/Istanbul"`.

### 3. Sessiz saatler mantığı (`quiet-hours.ts`)

```ts
isWithinQuietHours(settings, at: Date): boolean
```

- Gece aşan aralık (`23:00 – 08:00`) doğru çalışır: `from > to` ise birleşim, değilse kesişim.
- **Etkisi:** sessiz saatlerde push ve masaüstü bildirimi **gönderilmez**, ama bahsetme satırı
  ve sayaç normal yazılır (tasarım metni birebir bunu söylüyor: `bahsetmeler sayaçta birikir`).
- Bu fonksiyon Ş2'nin fan-out yolundan çağrılır. Ş2 ile temas noktası **yalnız bu imza**dır;
  Ş4 fonksiyonu ve testini yazar, Ş2 çağırır. Ş2 önce biterse `TODO(api):` ile geçici
  `() => false` adapter kullanır ve Dalga 2 başlamadan gerçek çağrıya döner.

### 4. Masaüstü kipi

- `desktopMentionMode` masaüstü (Electron) ve web bildirim yolunun **tek** girdisi olur.
- Mevcut `desktopNotifications` boolean'ı **kaldırılmaz**; `OFF` ile `false` eşlenir
  (geriye dönük uyum), ama okuma yolu artık enum'dur.
- `MENTIONS` = yalnız bu ekranın ürettiği dört tür; `ALL` = ek olarak DM ve normal mesaj
  bildirimleri; `OFF` = hiçbiri.

---

## Kabul

- [ ] `GET` satır yokken varsayılanı döndürüyor ve **yazmıyor**; `PATCH` satırı oluşturuyor.
- [ ] `suppress*` ters eşlemesi tek yerde; bileşen ve route'ta `!suppress` yok.
- [ ] Ayarlar sayfasındaki mevcut iki kontrol ile modal aynı değeri gösteriyor (iki yüzey,
      tek kaynak) — test ikisini de aynı servis üzerinden doğruluyor.
- [ ] `23:00 – 08:00` aralığı 00:30'da `true`, 09:00'da `false` veriyor; `from === to` 400.
- [ ] Sessiz saatte bahsetme **sayaca yazılıyor**, push gönderilmiyor.
- [ ] `mentionThreadReplies` varsayılanı `false`.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
