# Dalga 3 kapısı · Ş11 — Parity, a11y, kırılımlar, performans, QA

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Ş9 ve Ş10 bitti. Bu şerit paketi **kapatır**.

---

Whispr monorepo, `uat` dalı. Görev: `design_handoff/mesajlar-paketi/` paketinin **22 ekranını**
ürünle karşılaştır, sapmaları kapat, erişilebilirlik ve kırılım davranışını doğrula, kapanış
raporunu yaz.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md`, `SPEC-MESAJLAR.md` tamamı,
`design_handoff/mesajlar-paketi/PROMPT.md` "Kabul kriterleri" listesi ve
`raporlar/01…11-rapor.md` (önceki şeritlerin bıraktığı açık maddeler).

## Sahiplenilen dosyalar

- `apps/web/src/lib/messages/metrics.test.ts` (parity beklentileri genişletilir)
- `apps/web/e2e/specs/messages/**` (yeni spec dosyaları)
- `apps/web/src/components/messages/**` ve `apps/web/src/components/dm/**` içinde **yalnız
  bulunan sapmayı kapatan** düzeltmeler
- `docs/prompts/whispr-mesajlar-profil/raporlar/12-rapor.md`

Yeni özellik **eklenmez**. §1–§14'te bulunan sapma varsa rapora yazılır ve düzeltme ayrı iş
olarak önerilir — o bölüm bu paketin kapsamı değil (bkz. 00 §2).

## 1. Ekran parity — 22 ekran

Her ekranı 1360×920, koyu tema, ×1'de aç ve `screens/NN.png` ile karşılaştır.

| #     | Ekran                                   | Durum                             |
| ----- | --------------------------------------- | --------------------------------- |
| 01–12 | §1–§14 (önceki tur)                     | **doğrula, düzeltme önerisi yaz** |
| 13    | DM `...` menüsü                         | Ş9                                |
| 14    | Grup `...` menüsü                       | Ş9                                |
| 15    | Kullanıcı profili · Genel               | Ş5 + Ş6                           |
| 16    | Kullanıcı profili · Genel (kaydırılmış) | Ş6                                |
| 17    | Kullanıcı profili · Medya               | Ş7                                |
| 18    | Kullanıcı profili · Ayarlar             | Ş8                                |
| 19    | Grup profili · Genel                    | Ş5 + Ş6                           |
| 20    | Grup profili · Üyeler                   | Ş7                                |
| 21    | Grup profili · Ayarlar                  | Ş8                                |
| 22    | Üye ekle penceresi                      | Ş10                               |

Karşılaştırmada bak: kolon genişlikleri, satır yükseklikleri, yarıçaplar, boşluklar, font
ağırlık/boyutları, tint yoğunlukları, ikon boyutları, metinlerin **birebir** aynılığı.
Sapma bulunca önce `Mesajlar.dc.html` inline değerine bak (otorite), sonra düzelt.

## 2. Durum bütünlüğü — 17 durum

SPEC §2'nin durum haritası:

- Aynı anda **iki panel** açık kalmıyor (thread · arama · profil tek yuva).
- Aynı anda **iki menü** açık kalmıyor (satır menüsü · mesaj menüsü · başlık menüsü · alt menü).
- Profil açılınca thread ve arama kapanıyor.
- Görünüm ya da sohbet değişince `panel`, `modal`, `menu`, `profileTab`, `toast` sıfırlanıyor;
  `profileTab` `genel` oluyor (tuzak 3).
- DM'de `uyeler` sekmesi hiçbir yoldan seçilemiyor.
- Modal açıkken arka plan kaydırmıyor ve focus modalın içinde kalıyor.

Bunları e2e spec'e yaz — birim testi tek bileşene bakar, bu davranış ekranın tamamına ait.

## 3. Erişilebilirlik

- `pnpm --filter @wizards/web e2e:a11y` (mevcut a11y spec ailesi) yeni ekranları kapsayacak
  şekilde genişletilir.
- Klavye turu: `Tab` ile başlıktan menüye, menüden alt menüye, panele, sekmelere, modala;
  hiçbir tuzak kırık değil, hiçbir öğe atlanmıyor.
- `Esc` sırası: alt menü → ana menü → panel/modal. Üst üste kapanmıyor (bir `Esc` bir katman).
- Ekran okuyucu: presence noktalarının metin karşılığı, okunmamış sayacının okunabilir etiketi,
  anahtarların `role="switch"` + `aria-checked`, radyoların `radiogroup`, menülerin `role="menu"`,
  aday listesinin `listbox`/`option`, toast'ın `role="status"`.
- Kontrast: koyu **ve** açık temada danger satırlar, muted alt metinler, `Aktif` pill'i ve
  seçili sekme metni WCAG AA'yı geçiyor.
- `prefers-reduced-motion`: anahtar topuzu, toast girişi, anket çubuğu ve panel geçişi duruyor.

## 4. Kırılımlar ve ölçek

| Genişlik | Beklenen                                                   |
| -------- | ---------------------------------------------------------- |
| ≥1100    | sağ panel yerinde (profil 330, thread/arama 340)           |
| <1100    | sağ panel **overlay**, focus tuzağı devrede                |
| <960     | sohbet rayı **drawer**'a taşınıyor (`MobileDrawerTrigger`) |

Ölçek adımları (SPEC-ANA-SAYFA §8.1): 1360×920 ×1 · 1920×1080 ×1.15 · 2560×1440 ×1.5 ·
3840×2160 ×2, artı 1600×900 ve 5120×1440 (ultra geniş, ×1.5'te kalmalı).
Her boyutta **ve** her iki temada: kaydırma yok, metin kırpılmıyor, profil paneli gövdesi
kendi içinde kaydırıyor, hiçbir bölüm kesilmiyor.

Ayrıca: profil panelinde çıplak px kalmadığını doğrula (`grep` ile `px-\[`, `w-\[`, `text-\[`
arbitrary değerleri ara — kural 2).

## 5. Performans

- Profil paneli açılışı mesaj listesini yeniden render **etmiyor** (React Profiler ya da render
  sayacı ile ölç).
- Seçilmeyen sekmenin sorgusu koşmuyor (network kaydıyla doğrula).
- Medya ızgarası `loading="lazy"`; 18 karo ilk boyada hepsini indirmiyor.
- Menü açılışı ana iş parçacığını 16 ms'ten uzun bloke etmiyor.
- Toast zamanlayıcısı unmount'ta temizleniyor (sızıntı testi).
- Sohbet rayı ve mesaj listesi `Skeleton` davranışı bozulmadı.

## 6. Güvenlik gözden geçirmesi

Dalga 1'de açılan **her** uç için tek tek doğrula:

- `requireApiUserId` + `enforceApiRateLimit` + zod + üyelik/rol kontrolü var.
- Yönetici/sahip eylemleri sunucuda **yeniden** doğrulanıyor (istemciyi kapatıp uca doğrudan
  istek atarak test et).
- Yıkıcı uçlar `AuditLog` yazıyor.
- Yanıtlarda e-posta, IP, ham `User`/`UserSettings` satırı yok.
- `historyFromAt` görünürlük kuralı medya, dosya ve bağlantı kiplerinin **üçünde** de uygulanıyor.
- Rapor ucunun rate limiti gerçekten dar.

## 7. Kapanış

- Tüm birim ve e2e testleri yeşil.
- `SPEC_DEVIATIONS` listesi güncel: kapatılan sapma listeden çıkmış, yeni bulunan eklenmiş.
- `raporlar/12-rapor.md`: 22 ekranın parity durumu (geçti / sapma / açık), §1–§14'te bulunan ve
  bu paketin dışına önerilen maddeler, kalan `TODO(api):` listesi, ölçülen performans sayıları,
  güvenlik kontrol listesi sonucu.

## Kapı

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web e2e
```

Commit **atılmaz** — kullanıcı açıkça istemedikçe.
