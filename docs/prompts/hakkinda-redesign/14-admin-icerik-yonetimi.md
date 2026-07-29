# 14 — Admin panel: sürüm notu, yardım makalesi ve hata raporu yönetimi

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`. Branch `uat`, commit yok.
Bu prompt mobil ekranlardan bağımsızdır; `03`–`13` ile paralel çalıştırılabilir.

Hedef: prompt 01'de açılan üç veri kümesinin (Release, HelpArticle, BugReport) admin
panelden yönetilebilmesi. Mobil ekranlar boş içerikle test edilemez; içeriği ürün ekibi
buradan girer.

---

## 1. Yetenekler

`apps/web/src/lib/admin/capabilities.ts` içine üç yeni yetenek ekle
(mevcut adlandırma düzenine uy: `<alan>.<eylem>`):

| Yetenek         | Kim              | Ne                                         |
| --------------- | ---------------- | ------------------------------------------ |
| `release.read`  | ANALYST ve üzeri | Sürüm notu listesi ve detayı               |
| `release.write` | ADMIN ve üzeri   | Sürüm notu oluşturma, düzenleme, yayınlama |
| `help.write`    | ADMIN ve üzeri   | Yardım makalesi yönetimi                   |
| `support.read`  | SUPPORT ve üzeri | Hata raporu kuyruğu                        |

`ADMIN_CAPABILITIES` kapalı bir haritadır; ekleme yapıldığında
`admin-route-capability.test.ts` içindeki `ROUTE_CAPABILITY_PINS` ve rol matrisi testi
güncellenmezse kırmızıya düşer (00 §2).

---

## 2. API uçları (`apps/web/src/app/api/v1/admin/`)

`route.ts` + `route-logic.ts` + `route-logic.test.ts` üçlüsü, DI deseni, `requireAdminApi*`
kimlik + yetenek kontrolü, her mutasyonda **audit kaydı** (`writeAdminAuditLog`).

| Metot            | Yol                            | Yetenek                                               |
| ---------------- | ------------------------------ | ----------------------------------------------------- |
| GET              | `releases`                     | `release.read`                                        |
| POST             | `releases`                     | `release.write`                                       |
| GET/PATCH/DELETE | `releases/[releaseId]`         | `release.read` / `release.write`                      |
| POST             | `releases/[releaseId]/publish` | `release.write` (gövdesiz → contract listesine ekle)  |
| PUT              | `releases/[releaseId]/changes` | `release.write` (tüm madde listesini sırasıyla yazar) |
| GET/POST         | `help/articles`                | `help.write`                                          |
| PATCH/DELETE     | `help/articles/[articleId]`    | `help.write`                                          |
| GET              | `support/reports`              | `support.read`                                        |
| PATCH            | `support/reports/[reportId]`   | `support.read` (durum değişimi)                       |

Kurallar:

- Yayınlama ayrı bir eylem: `publishedAt` yalnız `publish` ucuyla dolar.
  Yayınlanmış sürümün `version` alanı **değiştirilemez** (409).
- `changes` PUT'u atomiktir: eski maddeler silinip yenileri `position` ile yazılır,
  tek transaction.
- Hata raporu yanıtında `logExcerpt` ve `deviceInfo` **yalnız detay** ucunda döner,
  listede dönmez (gereksiz veri sızdırma).
- Yeni hız sınırı eylemleri `api-rate-limit.ts` union'ına eklenir.

---

## 3. Admin panel sayfaları (`apps/web/src/app/admin/`)

Mevcut modül düzenine (`analytics`, `audit`, `feedback`, `flags`, `health`, `moderation`,
`notifications`, `servers`, `users`, `voice`) uyarak üç modül ekle:

### `admin/releases`

- `page.tsx` (liste) + `loading.tsx` + `[releaseId]/page.tsx` (düzenleme)
- Liste: sürüm, kanal, tarih, madde sayısı, durum (taslak/yayında), yayınla eylemi.
- Düzenleme: üst alanlar (versiyon, kod adı, kanal, tarih, build, boyut, zorunlu,
  özet, öne çıkan) + madde editörü (tip seçimi, başlık, açıklama, sıralama).
- Önizleme paneli: mobilde 1c/2a nasıl görünecek — kart genişliği 358px sabit,
  gerçek token'larla. (Zorunlu değil ama içerik hatasını en çok bu yakalar.)

### `admin/help`

- Liste (kategori, başlık, okuma süresi, görüntülenme, yayın durumu) + düzenleme formu
  (slug, başlık, kategori, okuma süresi, url, markdown gövdesi, sıra).

### `admin/support`

- Hata raporu kuyruğu: ticket, kategori, tarih, durum, kullanıcı (varsa).
- Detay: gövde, cihaz bilgisi, günlük özeti, ekran görüntüsü bağlantısı,
  durum değiştirme (`OPEN → TRIAGED → RESOLVED/DISCARDED`).
- `purgeAfter` tarihi görünür — 90 gün sözü panelde de doğrulanabilir olsun.

Nav kaydı: `apps/web/src/components/admin/shell/admin-nav-items.ts`.
Nav'a modül eklemek `admin-routing.test.ts` içindeki **rol × modül matrisini** ve
sayfa/loading/`requireAdminModule` kontrolünü tetikler — üçü de güncellenmeden test geçmez.

**Web bileşen testi tuzağı:** `renderToStaticMarkup` app-router context'i vermez;
client bileşende `useRouter()` "invariant expected app router to be mounted" ile patlar.
Admin panellerinde tazeleme `window.location.reload()` ile yapılıyor, aynı deseni izle.
Bu test dosyalarında `import React` zorunlu.

---

## 4. Testler

- Her `route-logic.test.ts`: yetenek reddi (403), doğrulama hataları, audit kaydının
  yazıldığı, yayınlanmış sürümde versiyon değişiminin 409 verdiği.
- `admin-route-capability.test.ts` ve `admin-routing.test.ts` güncellemeleri.
- `src/lib/releases/release-service.test.ts`: `changes` PUT'unun atomik davranışı.

## 5. Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

`apps/web` içinden:

```bash
node --test --import tsx src/app/api/v1/admin/admin-route-capability.test.ts
```

## 6. Bitiş kriterleri

1. Dört yeni yetenek tanımlı ve rol matrisi testi yeşil.
2. Dokuz admin ucu + testleri mevcut; her mutasyon audit yazıyor.
3. Üç admin modülü nav'da görünüyor ve rol kontrolü çalışıyor.
4. Yayınlama akışı taslak/yayında ayrımını koruyor.
5. Web typecheck 0 hata. **Commit atılmadı.**
