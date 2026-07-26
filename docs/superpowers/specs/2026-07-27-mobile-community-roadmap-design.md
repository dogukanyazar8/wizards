# Mobil topluluk yol haritası — tasarım

**Tarih:** 2026-07-27
**Dal:** uat
**Kapsam:** 4a geri bildirim ekranına yol haritası girişi + yol haritası ekranının iki sekmeli yeniden tasarımı

## Problem

Topluluk yol haritasına bugün tek bir yoldan ulaşılıyor: geri bildirim gönderdikten sonra
açılan 4b makbuzundaki "Tümünü gör". Yani ekranı görmek için önce bir şey göndermek
gerekiyor. Ulaşıldığında da ekran çıplak: sıralı bir liste, oy düğmesi, başka hiçbir şey.
`MobileRoadmapItem.description` hiç render edilmiyor, durumlar sadece metin içinde geçiyor
ve kullanıcının **kendi** gönderdiği geri bildirimlerin durumunu topluca görebileceği bir
yer yok — tek yol, bir durum değişikliği bildirimi gelmesini beklemek.

## Karar

İki iş, tek akış:

1. Geri bildirim formunun header'ına sağ üst giriş noktası. Yol haritası artık gönderim
   öncesi de okunabilir.
2. Yol haritası ekranı iki sekmeye ayrılır: **Topluluk** (oylanan maddeler, duruma göre
   filtreli) ve **Bildirdiklerim** (kullanıcının kendi kayıtları, takip numarası ve durumu).

## 1 — Geri bildirim ekranı header'ı

```
[←]  Geri bildirim              [◎ Yol haritası]
     Görüşün ürünü şekillendirir
```

- Sağdaki pill `backButton` metriklerini paylaşır (yükseklik 36, radius 13,
  `surface.card`, `border.subtle`); sadece genişliği içeriğe göre.
- `MobileLineIcon name="activity"` + kısa etiket. Tam ad erişilebilirlik etiketinde
  taşınır: "Topluluk yol haritası". Kısa etiket başlıkla yarışmasın diye pill'de duruyor.
- `onOpenRoadmap` zaten `MobileFeedbackFlowScreen`'e geliyor ve `FeedbackScreenContainer`
  `navigation.navigate("Roadmap")` yapıyor. Tek eksik, prop'un forma da aktarılması.
- `testID="mobile-feedback-roadmap-open"`.

## 2 — Yol haritası ekranı

Segment kabuğu `friends-hub.tsx`'teki mevcut dilden alınır (`surface.rail` üzerinde
`surface.card` + `elevation.headerCard` ile yükselen aktif segment). Yeni bir görsel dil
icat edilmez.

### Sekme A — Topluluk

- Üstte yatay durum çipleri: `Tümü · Değerlendiriliyor · Planlandı · Geliştiriliyor ·
Yayınlandı`, her biri sayılı. Sayılar yüklü listeden client'ta türetilir; ekstra istek
  yok, sunucu sayaç tutmaz.
- Çip görsel dili `topicChip`/`topicChipSelected`'ten gelir — aynı ekranın form tarafı
  zaten bu çipi kullanıyor.
- Satır bugünkü `MobileRoadmapRow` ama üç eksiği kapatır:
  - `description` iki satıra kadar gösterilir (bugün hiç görünmüyor),
  - durum kendi çipinde durur, meta metnine gömülü kalmaz,
  - `updatedAt` ile "3 gün önce güncellendi" satırı.
- `getItemType` tek değer döndürmeye devam eder; FlashList geri dönüşümü tek layout'ta
  kalır.
- Pull-to-refresh.
- Filtre sonucu boşsa ekran boş değildir, filtre boştur — ayrı mesaj: "Bu durumda madde
  yok".

### Sekme B — Bildirdiklerim

- Satır: `WSP-1284` · konu · durum çipi · göreli zaman · mesajın tek satırlık önizlemesi.
- Dokunma → `FeedbackSubmitted` (`feedbackId` ile). Takip ekranı zaten bu modda çalışıyor
  (FEEDBACK bildirimi böyle açıyor); yeni ekran açılmaz.
- Boş durum: "Henüz geri bildirim göndermedin" + `Geri bildirim gönder` eylemi geri döner.

## 3 — Sunucu

Tek yeni endpoint: `GET /api/v1/mobile/feedback`, viewer'a kapalı.

- `MobileFeedbackListItemSchema`: `{ createdAt, id, preview, publicNumber, rating, status,
statusChangedAt, topic }`. `preview` mevcut `buildFeedbackPreview` ile üretilir — konsol
  satırının kullandığı fonksiyonun aynısı.
- `listMobileFeedback(userId)`: `where: { userId }`, `orderBy: { createdAt: "desc" }`,
  `take: 100`. `@@index([userId, createdAt])` zaten var.
- Rate limit `mobile:feedback:list` → `{ limit: 60, windowSeconds: 60 }`, roadmap listesiyle
  aynı sınıf.
- `MobileRoadmapItemSchema`'ya `updatedAt` eklenir. Kolon Prisma'da zaten var, **migration
  yok**.

### Query key

`mobileQueryKeys.myFeedback()` = `[...all, "my-feedback"]`. Kasıtlı olarak
`feedbackRoot()` önekinin **dışında**: `applyMobileRoadmapVote` o öneki tarayıp bulduğu
her girdiyi `MobileFeedbackDetailResponse` olarak okuyor. Liste oraya düşerse yanlış tipte
gezinilir.

## Test yüzeyi

- `packages/types`: liste şeması kabul/ret, `updatedAt` zorunluluğu.
- `apps/web` route-logic: kimlik doğrulama, rate limit çağrısı, no-store header'ı.
- `apps/mobile` model birim testleri: durum sayaçları, filtreleme.
- `apps/mobile` component testleri: header butonu yol haritasını açar; çip filtreleme
  listeyi daraltır; kendi bildirimi takip ekranına gider; boş filtre mesajı.

## Kapsam dışı

- Yeni Prisma alanı veya migration.
- Sayfalama — 100 kayıt bu ekran için yeterli, sonsuz kaydırma yok.
- Yol haritasında arama.
- Kendi bildirimini düzenleme/iptal etme.
- Web tarafı; bu iş yalnızca mobil.
