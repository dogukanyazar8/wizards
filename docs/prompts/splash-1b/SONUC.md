# Splash 1b — paket kapanış raporu

Üç dalga da koştu (2026-08-26, branch `uat`, **commit yok**). Açılış ekranı web, masaüstü ve
mobilde tasarımdaki hâliyle çiziliyor; eski `AppStartupScreen` kaldırıldı.

| Dalga | Kapsam                                      | Rapor                                      |
| ----- | ------------------------------------------- | ------------------------------------------ |
| 1     | Sözleşme + token + motor (6 şerit)          | [raporlar/dalga-1.md](raporlar/dalga-1.md) |
| 2     | Web + masaüstü + dört durum + e2e (5 şerit) | [raporlar/dalga-2.md](raporlar/dalga-2.md) |
| 3     | Mobil + native açılış + kapanış (4 şerit)   | [raporlar/dalga-3.md](raporlar/dalga-3.md) |

## Son durum

| Kapı                                         | Sonuç                                                      |
| -------------------------------------------- | ---------------------------------------------------------- |
| `@wizards/types` test                        | 565, 0 fail                                                |
| `@wizards/web` test                          | 7306 (7303 pass, 3 eski skip), 0 fail                      |
| `@wizards/web` typecheck + lint              | temiz                                                      |
| `@wizards/mobile` test                       | 1970, 0 fail                                               |
| `@wizards/mobile` typecheck                  | temiz                                                      |
| mobil bileşen testleri                       | 7, 0 fail                                                  |
| `cargo test` + `cargo clippy -- -D warnings` | 30 test, temiz                                             |
| desktop node testleri                        | 96, 0 fail                                                 |
| e2e `splash-parity.spec.ts`                  | **koşulamadı** — yerel e2e ortamı (tohumlu DB + build) yok |
| cihazda mobil doğrulama                      | **koşulamadı** — cihaz/emülatör yok                        |

## SPEC §10 kabul kriterleri

Altısı da karşılandı; dördüncüsünün kanıtı yazılı ama koşulmamış e2e spec'inde
(ayrıntı: [dalga-3 §Ş15](raporlar/dalga-3.md)).

## Kararlar

14 bağlayıcı karar `00-ortak-baglam.md` §2'de. Paket sırasında verilen ek kararlar:

- **K14 — soket için 20 sn tavan.** SPEC'te yok. Dördüncü adım realtime'a bağlı olduğu için
  soket gelmezse açılış ekranı süresiz duvar oluyordu; tavan yalnız soketi affeder.
- **Güncelleme cümlesi şablon.** SPEC `Sürüm 2.5.0 · 18,4 MB.` diye sabit yazıyor; sabit metin
  her güncellemede yanlış sayı gösterirdi. Cümlenin kalanı birebir.
- **Masaüstü penceresi 648 × 474.** Görünen kabuk tam 630 × 420; fark, gölgenin kırpılmaması
  için saydam kenar payı.
- **`updating` ve `sessionExpired` mobilde.** Web ve masaüstünde tetiklenmiyor.

## Kalan tek boşluk

`updating` durumunun **açılış anında** bir üreticisi yok: indirme akışları uygulama zaten
açıkken (Hakkında ekranı / masaüstü kontrol penceresi) başlıyor. Bileşen tarafı hazır ve
testli; eksik olan, açılışta indirme başlatan akış — bu bir ürün kararıdır.

## Bilinen sapmalar

| Sapma                                                  | Gerekçe                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Masaüstü **Tauri**, Electron değil                     | `PROMPT.md` Electron varsayıyor; uygulama Tauri v2.                     |
| Pencere 648 × 474 (kabuk 630 × 420)                    | Gölge payı; kabuk ölçüsü tasarımdaki gibi.                              |
| Mobil durum düğmesi 44px (SPEC 32px)                   | Dokunma hedefi alt sınırı; depo bunu ölçüyor.                           |
| Native katmanda aurora/metin yok                       | K11 — statik pencere arka planının sınırı.                              |
| Logo gradyanı sabit renk                               | SPEC §2 onu tokenlı tanımlamıyor; mobilde `design/palette.ts`'te durur. |
| `updating` tonu `--primary-readable` / `accent.strong` | SPEC doygun `--primary` yazıyor, o AA'yı geçmiyor.                      |
| `--text-muted` %46 (SPEC %52)                          | Depo kontrast düzeltmesi; splash tokeni okuyor.                         |
| Web'de üç nokta yok                                    | Referans web karesinde de yok.                                          |
| Dar web (<768px) mobil düzeni                          | K12 — SPEC dar ekran kuralı vermiyor.                                   |

## Sonraki adımlar

1. E2E ortamını ayağa kaldırıp `splash-parity.spec.ts`'i koş.
2. Windows'ta masaüstü penceresini elle doğrula: 648 × 474 pencere, 630 × 420 kabuk,
   yuvarlak köşe, gölge, sürükleme, 180 ms kapanış.
3. Android/iOS cihazda native → JS geçişinde zemin ve işaret sıçraması yok mu bak.
4. `WHISPR_BUILD_NUMBER`'ı PROD ve UAT deploy ortamlarında doldur.
5. `updating` üreticisi kararını ver.
