# Whispr — giriş · hesap oluşturma · kurtarma paketi

`design_handoff/giris-kayit-paketi/` tasarımının web · masaüstü · mobil uygulaması.
Dal: `uat`. Üç dalga, dokuz şerit.

## Dosyalar

| Dosya                    | İçerik                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| `PLAN.md`                | Kapsam, üç dalga, **K1–K14 bağlayıcı kararlar**, 13 kabul kriteri, riskler       |
| `00-ortak-baglam.md`     | Otorite sırası, kodda doğrulanmış gerçekler, 10 tuzak, referans↔SPEC çelişkileri |
| `01-…` … `09-…`          | Dokuz şeridin uygulama talimatı                                                  |
| `BASLATMA-PROMPTLARI.md` | Her şerit için hazır başlatma promptu + ortak ön ek                              |
| `raporlar/`              | Şerit raporları (`s1-…` … `s9-…`, `s1-metin-eslemesi.md`, `PAKET-OZETI.md`)      |

## Dalgalar

| Dalga | Şeritler            | Çıktı                                                                      |
| ----- | ------------------- | -------------------------------------------------------------------------- |
| **1** | Ş1 (kapı) → Ş2 ‖ Ş3 | Sözleşme + token + metin sözlüğü; kimlik backend; ortak UI parçaları       |
| **2** | Ş4 ‖ Ş5 ‖ Ş6        | 10 web ekranı                                                              |
| **3** | Ş7 ‖ Ş8 ‖ Ş9        | Masaüstü kabuğu; 3 mobil ekran; durumlar + a11y + parity kapısı + temizlik |

## Kapsam özeti

10 web ekranı · 2 çizili + 8 devralan masaüstü penceresi · 3 mobil ekran · 10 durum kartı ·
3 hata gösterim seviyesi · 10 bileşen × 5 etkileşim durumu · ~150 i18n metin çifti.

**Kapsam dışı (K1):** telefonla kayıt, SMS/sesli arama kodu, SPEC §4.6 ve §6.4 telefon doğrulama
ekranları.

## Sıra

1. `00-ortak-baglam.md` ve `PLAN.md` §3 okunur.
2. `BASLATMA-PROMPTLARI.md` içindeki ortak ön ek + şerit promptu kullanılır.
3. Her şerit bitince raporu `raporlar/` altına yazar; sonraki dalga o raporları okur.
