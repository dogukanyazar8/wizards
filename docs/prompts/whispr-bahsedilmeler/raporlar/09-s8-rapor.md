# Dalga 2 · Ş8 raporu — bildirim ayarları modalı (496) + toast altyapısı

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Şerit tamamlandı. Yeni test: **27** (toast 14 · modal 13).

---

## Ne landed

| Dosya                                                               | Durum                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/web/src/components/ui/toast.tsx`                              | yeni — saf kuyruk mantığı + `ToastViewport`                              |
| `apps/web/src/components/ui/toast.test.tsx`                         | yeni — 14 test                                                           |
| `apps/web/src/components/providers/toast-provider.tsx`              | yeni — yığının sahibi, zamanlayıcı                                       |
| `apps/web/src/hooks/use-toast.ts`                                   | yeni — bağlam + `useToast()`                                             |
| `apps/web/src/components/providers/authenticated-app-providers.tsx` | **tek satır**: `ToastProvider`                                           |
| `apps/web/src/components/mentions/mention-settings-modal.tsx`       | yeni — kabuk + `MentionSettingsForm`                                     |
| `apps/web/src/components/mentions/mention-settings-modal.test.tsx`  | yeni — 13 test                                                           |
| `apps/web/src/components/mentions/mention-settings-row.tsx`         | yeni — anahtar satırı                                                    |
| `apps/web/src/components/mentions/mentions-page.tsx`                | menü eylemleri toast'a bağlandı, modal varsayılanı bağlandı              |
| `apps/web/src/components/mentions/mentions-rail-container.tsx`      | `read-all` elle `fetch` yerine `lib/mentions/client` + `Geri al` toast'ı |

`ui/modal.tsx`, `ui/toggle-switch.tsx`, `ui/segmented-control.tsx` ve
`voice/voice-invite-toasts.tsx` **değişmedi**.

---

## 1. Toast altyapısı

Dosya iki şey içeriyor ve ikisi bilerek ayrı:

1. **Saf kuyruk mantığı** — `enqueueToast` · `dismissToast` · `tickToasts` · `visibleToasts` ·
   `resolveToastDuration`. Zamanlayıcısız, saat okumayan fonksiyonlar. `tickToasts` geçen süreyi
   bir **parametre** olarak alıyor; bir geri alma penceresini gerçek saatle beklemek testi yavaş
   değil **kırılgan** yapardı.
2. **Çizim** — `ToastViewport`. Durum tutmuyor.

Kurallar:

- Tek yığın, sağ altta, en çok **3 görünür**; fazlası kuyrukta. Kuyrukta bekleyenin sayacı
  **işlemiyor** — görünmeden süresini tüketen bir toast okunamaz.
- Eylemsiz 5 sn, `action` taşıyan 10 sn (`read-all` geri alma penceresiyle aynı büyüklük).
- `role="status"`; `default` → `aria-live="polite"`, `danger` → `assertive`. `aria-live`
  **karta** konuyor, kaba değil: kapta olsaydı yığın her değiştiğinde ekran okuyucu bütün
  listeyi yeniden okurdu.
- Sayaç iki durumda duruyor: fare yığının üzerinde, ve pencere odak dışında ya da sekme gizli.
  İkincisi `Geri al` için şart — başka bir sekmeye geçen kullanıcı döndüğünde penceresini
  kapanmış bulmamalı.
- Aralık **yalnız** yığın doluyken kuruluyor; boş yığında hiçbir zamanlayıcı dönmüyor.
- Sağlayıcısız çağrı sessizce yutuluyor (`FALLBACK_TOAST_API`): toast bir yan bildirimdir,
  sağlayıcı ağaçta yoksa ekranı çökertmesi gerekmez.

`ToastProvider` oturum ağacının **en dışında** (`SocketProvider`ın hemen içinde): daha içeride
olsaydı ses ya da çağrı sağlayıcısı yeniden kurulduğunda görünen toast'lar sessizce düşerdi.

### Kullanıcıları (bu pakette bağlandı)

| Toast                                                | Nereden     | `Geri al`                                    |
| ---------------------------------------------------- | ----------- | -------------------------------------------- |
| `Mesaj bağlantısı kopyalandı`                        | kart menüsü | —                                            |
| `Sonra oku listesine alındı`                         | kart menüsü | var (`readLater: false`)                     |
| `{channel} sessize alındı` / `Sohbet sessize alındı` | kart menüsü | — (K12 süresiz; geri alma ayrı bir uç ister) |
| `Bahsetme listeden kaldırıldı`                       | kart menüsü | var (`dismissed: false`)                     |
| `{count} bahsetme okundu işaretlendi`                | ray başlığı | var (10 dakikalık `undoToken`)               |

## 2. `read-all` geri alma bağlandı

Ray artık elle `fetch` atmıyor; `markAllMentionsRead()` / `undoMarkAllMentionsRead(token)`
(`lib/mentions/client.ts`, Ş3) çağırıyor ve dönen `undoToken`ı `Geri al` toast'ına veriyor.
Önceki hâlde jeton okunmadan atılıyordu — geri alınabilir bir eylem geri alınamaz oluyordu.

`mentions-rail-container.tsx` içindeki **bayat `TODO(api)`** kaldırıldı: Ş3 o ucu yazmıştı,
yorum hâlâ "yazacak" diyordu.

## 3. Ayarlar modalı

- Değerler Ş4'ün ucundan, **Ayarlar sayfasıyla aynı sorgu anahtarını** paylaşarak
  (`settingsQueryKeys.mentions`). Biri kaydettiğinde diğeri kendiliğinden tazeleniyor.
- **İyimser güncelleme yok.** Bir bildirim ayarı sessizce yanlış kaydedilirse kullanıcı bunu
  ancak beklediği bildirim gelmediğinde fark eder; `Kaydet` yanıtı bekleniyor, hata satır içinde
  kalıyor, değerler geri sarılmıyor.
- **Yalnız değişen alanlar gönderiliyor** (`buildMentionSettingsPatch`), sessiz saatlerin
  yalnız değişen parçası dâhil.
- Taslak **türetiliyor**, efektle kopyalanmıyor: `edits` yalnız dokunulan alanları tutuyor ve
  gösterilen değer `base` ile onun birleşimi. Sunucu yanıtını bir efektte state'e kopyalamak
  fazladan bir render turu açar (React Compiler `set-state-in-effect` kuralı da yakalıyor) ve
  yanıt sonradan tazelenirse iki kaynak sessizce ayrışırdı.
- `suppress*` ters mantığı bu dosyada **hiç geçmiyor** (K6): anahtarın kendisi okunuyor.
- `ToggleSwitch` çatallanmadı — Mesajlar sözlüğündeki ölçüler (44×26, knob 20, iç boşluk 3)
  Bahsedilmeler sözlüğüyle **birebir aynı**.

---

## 4. Sapmalar (5 madde)

| #   | Konu                       | SPEC                                                      | Uygulanan                                                 | Gerekçe                                                                                                                                                                                                                                      |
| --- | -------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modal başlığı              | 38×38 zil kutusu + özel 32px kapat + başlık altı hairline | `Modal`ın kendi başlığı (`title` + `description` + kapat) | `ui/modal.tsx` başlığını kendi çiziyor, `hideHeader` gibi bir kapı yok ve dosya bu şeridin kümesinde yazılamaz. Ev içi örnek de aynı yolu izliyor (`dm/group-create-dialog.tsx`). Zil ikonu ve başlık bandının kendi iç boşlukları **kayıp** |
| 2   | Modal gövdesi ayrı bileşen | SPEC tek parça anlatıyor                                  | `MentionSettingsForm` dışa açıldı                         | `Modal` gövdeye portallanıyor ve `document` olmayan ortamda `null` döndürüyor; kabuğun içine gömülü bir gövde hiçbir zaman doğrulanamazdı. Form saf sunum, durum kabukta                                                                     |
| 3   | Açılışta odak              | "ilk anahtara"                                            | `queueMicrotask` ile ilk `role="switch"`                  | `Modal` açılışta kendi kapat butonuna odaklanıyor ve o buton çocuklardan önce çiziliyor. Mikro görev, sağlayıcının efektinden sonra koşan ilk noktadır ve bir zamanlayıcı kurmaz                                                             |
| 4   | Kirli formda kapatma       | SPEC sessiz                                               | ilk `Esc`/kapat uyarı yazıyor, ikincisi kapatıyor         | Kirli bir formu tek `Esc` ile atmak, kullanıcının yaptığı işi sormadan silmek olurdu (prompt bunu sapma olarak yazmayı zaten istiyordu)                                                                                                      |
| 5   | Segment yatay boşluğu      | 11                                                        | 12 (`SegmentedControl` varsayılanı)                       | Bileşen ölçü prop'u almıyor ve çatallanmaması isteniyor. `narrow` varyantı 10 verirdi ve o "dört ve üstü segment" için tanımlı — üç segmentte off-label olurdu. 1px fark                                                                     |

## 5. Kabul ölçütleri

- [x] Modal 496 genişlik / 22 yarıçap; gövde, sessiz saat şeridi ve altlık SPEC ölçülerinde
- [x] 4 anahtar doğru varsayılanlarla; `Thread yanıtları` kapalı
- [x] Masaüstü segmenti `Sadece bahsetmeler` seçili başlıyor
- [x] Sessiz saatler şeridi metni birebir; kapalı hâlde `Sessiz saatler kapalı` (SPEC vermiyor,
      §4'te sapma olarak değil, prompt'un kendi talebi olarak uygulandı); `Düzenle` şeridi
      yerinde iki `time` girdisine açıyor, ayrı modal yok
- [x] `Esc` kapatıyor; kirli formda önce uyarıyor; açılışta ilk anahtara odak; `Modal`ın odak
      tuzağı ve odak dönüşü devrede
- [x] `Kaydet` yalnız değişen alanları gönderiyor; hata durumunda değerler geri sarılmıyor
- [x] Ayarlar sayfasıyla tek kaynak (`settingsQueryKeys.mentions`)
- [x] Toast: 3 eşzamanlı sınırı, `Geri al`, odak dışında sayaç durması, `aria-live` ayrımı
- [x] `voice-invite-toasts.tsx` ve `ui/modal.tsx` değişmedi
- [ ] **Açık/koyu tema tarayıcıda görülmedi** — `/mentions` oturum arkasında; Dalga 3 / parity-QA

## 6. Kapı

```
pnpm --filter @wizards/web typecheck   ✔
pnpm --filter @wizards/web lint        ✔
pnpm --filter @wizards/web test        ✔ 4104 test · 4103 pass · 0 fail · 1 skip
```
