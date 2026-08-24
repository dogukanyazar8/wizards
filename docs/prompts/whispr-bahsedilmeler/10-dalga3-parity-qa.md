# Dalga 3 · Ş9 — Parity kapısı, a11y, kırılımlar, performans, kabul

**Ön koşul:** Dalga 2 kapısı yeşil. **Tek şerit** — paralel yok, çünkü işi diğerlerinin
çıktısını ölçmek.

---

## Sahiplenilen dosyalar

- `apps/web/e2e/specs/mentions/mentions.spec.ts` (yeni)
- `apps/web/e2e/specs/a11y/a11y.spec.ts` (yalnız bahsedilmeler bloğu)
- `apps/web/src/lib/mentions/parity.test.ts` (yeni — ölçü sözlüğü ↔ referans HTML)
- `docs/prompts/whispr-bahsedilmeler/raporlar/10-parity-raporu.md`
- Bulunan kusurların düzeltmeleri (sahibi olan şeridin dosyasında; her düzeltme rapora
  `şerit · dosya · sapma` olarak yazılır)

---

## 1. Parity matrisi

11 ekran görüntüsü (`screens/01…11`) × 2 tema × 5 çözünürlük.

| Ekran | Durum                                              |
| ----- | -------------------------------------------------- |
| 01    | Tüm bahsedilmeler (`filter=all`, `group=time`)     |
| 02    | Okunmamış                                          |
| 03    | Rol · @herkes                                      |
| 04    | DM bahsetmeleri                                    |
| 05    | Bağlam paneli açık (başlıktaki iki ikon **gizli**) |
| 06    | Satır içi yanıt açık                               |
| 07    | Kart menüsü açık                                   |
| 08    | Bildirim ayarları modalı                           |
| 09    | Boş durum                                          |
| 10    | Aydınlık tema                                      |
| 11    | Kaynağa göre gruplama                              |

Çözünürlükler: `1360×920` · `1600×900` · `1920×1080` · `2560×1440` · `3840×2160`
(+ `5120×1440` ultra geniş kontrolü).

Her hücrede aranan: kaydırma yok, kırpma yok, başlık taşmıyor, kart oranları sabit,
4K'da gövde metni fiziksel olarak ×1'deki kadar okunur.

## 2. Ölçekleme kapısı (SPEC-ANA-SAYFA §8)

- [ ] Kök font boyutu adımı `min(100vw / 1360, 100dvh / 920)` ile seçiliyor:
      16 · 18 · 24 · 32 px. `zoom` **kullanılmıyor** (tuzak #5).
- [ ] Bahsedilmeler dosyalarında arbitrary px sınıfı yok:
      `rg -n "\[\d+px\]" apps/web/src/components/mentions apps/web/src/lib/mentions` temiz.
- [ ] Hairline'lar `hairline()` ile; 4K'da 2px'e çıkmıyor.
- [ ] İkonlar `em`, avatarlar rem.
- [ ] Hiçbir adımda tıklama hedefi 44px fiziksel altına düşmüyor.

## 3. Token ve tipografi kapısı

- [ ] `rg -n "#[0-9a-fA-F]{3,8}|rgba?\(" apps/web/src/components/mentions` — yalnız
      tasarımın `#fff` ters metni çıkıyor, başka hex yok.
- [ ] `--info` token tanımlı ve iki temada da çalışıyor; bileşen içine gömülü ton yok.
- [ ] `rg -n "Outfit|Figtree" apps/web/src/components/mentions apps/web/src/lib/mentions` boş.
- [ ] Tema anahtarı ile 11 ekranın hepsi doğru; hiçbir parça tek temaya sabitlenmemiş.

## 4. Erişilebilirlik

- [ ] Kart `article`; her eylem gerçek `button`; ikon-only butonlarda `aria-label`.
- [ ] Okunmamış şeridi ve sayaçlar metin karşılığı taşıyor (`2 okunmamış bahsetme`).
- [ ] `⋯` menüsü ve modal klavyeyle gezilebiliyor: `Esc` kapatır, focus tuzağı, açılışta ilk
      öğeye focus, kapanışta focus tetikleyiciye döner.
- [ ] `J/K` (ve `↑/↓`) kart gezinme, `R` yanıtla, `E` okundu; input odaktayken tetiklenmiyor.
- [ ] Focus stili token'dan (`ring-ring`); hiçbir yerde `outline: none` tek başına yok.
- [ ] `pnpm --filter @wizards/web e2e:a11y` bahsedilmeler bloğu dahil yeşil.
- [ ] Ekran okuyucu ile akış `role="feed"` olarak geziliyor, grup başlıkları duyuluyor.

## 5. Kırılımlar

- [ ] `<1100px` bağlam paneli overlay; odak tuzağı kuruluyor.
- [ ] `<960px` bahsetme rayı drawer (`MobileDrawerTrigger`); ikinci drawer mekanizması yok.
- [ ] Kırılımlar CSS'te (tuzak #8); hidrasyon uyarısı yok.

## 6. Performans

- [ ] Ray ve akış bağımsız yükleniyor; akış askıdayken ray dolu (ağ kısıtlamalı ölçüm).
- [ ] 30 günlük pencerede liste sorgusu p95 < 120 ms; `EXPLAIN ANALYZE` çıktısı rapora ekli.
- [ ] `counts` + `summary` tek yardımcıdan; `/mentions` ilk boyada 3'ten fazla istek yok.
- [ ] 200 kartlık akışta kaydırma 60 fps; sanallaştırma devrede.
- [ ] `mention:new` geldiğinde kaydırma konumu bozulmuyor; şerit çıkıyor.
- [ ] Rol fan-out'u mesaj gönderme p95'ini ölçülebilir şekilde artırmıyor (outbox).

## 7. Uçtan uca (`mentions.spec.ts`)

Gerçek veriyle, seed üzerinden:

1. `@kullanıcı` bahsetmesi → kart görünür, nav rozeti 1 artar.
2. `@rol` bahsetmesi → rol üyesinde kart, üye olmayanda yok.
3. `@herkes` → kanalı gören herkeste kart, yazarında yok.
4. Thread yanıtı → takipçide kart, takibi kapatanda yok.
5. `Okundu işaretle` → rozet düşer; `Okunmadı işaretle` → geri artar (20 tekrar, sapma yok).
6. `Tümünü okundu işaretle` → boş durum + rozet kaybolur; **arkadaşlık isteği bildirimi
   okunmamış kalır**; `Geri al` durumu geri getirir.
7. `Listeden kaldır` → kart düşer, mesaj kanalda durur.
8. `Sonra oku` → kart en üstte, filtre değişse de görünür.
9. Satır içi yanıt → mesaj kanala/thread'e düşer, kart okunur.
10. `Bağlamda gör` → panel ±2 mesajı gösterir, `Kanalda aç` doğru adrese gider.
11. Ayarlar modalı → `Kaydet` sonrası değer kalıcı, sayfa yenilendiğinde duruyor.
12. URL paylaşımı → `?filter=unread&source=<id>&group=source` aynı görünümü açıyor.

## 8. Kapsam denetimi

- [ ] `git diff --stat` sol tarafa dokunmuyor: `server-rail.tsx`, `app-nav-panel.tsx`
      (rozet kaynağı hariç, o da Ş3'te `summary` üzerinden), kullanıcı barı **değişmedi**.
- [ ] `lib/home/mentions-service.ts` ve eski `mentions-screen.tsx` kaldırıldı; kalan import yok.
- [ ] Kullanılmayan eski `mentions.filter.*` anahtarları temizlendi.
- [ ] Bütün `TODO(api):` notları listelendi; her biri ya kapatıldı ya rapora gerekçesiyle yazıldı.
- [ ] Bütün SPEC sapmaları (`SPEC_DEVIATIONS` + metinsel sapmalar) tek listede.

## 9. Nihai kabul (PROMPT'un kendi listesi)

PROMPT.md'deki 16 maddelik kabul listesi tek tek işaretlenir ve rapora kanıtıyla
(ekran görüntüsü / test adı / komut çıktısı) eklenir.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
pnpm --filter @wizards/web e2e:a11y
pnpm --filter @wizards/web e2e -- e2e/specs/mentions
```
