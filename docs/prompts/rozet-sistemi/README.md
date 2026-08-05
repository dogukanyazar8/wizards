# Rozet sistemi — run-prompt paketi

Whispr rozet sistemini uçtan uca kuran 4 dalgalık prompt paketi. Hedef yüzeyler:
mobil hızlı profil kartı (1a) + tam profil sayfası (1c), web/desktop profil popover'ı.

## Okuma sırası

| #   | Dosya                             | Dalga | Bağımlılık                            |
| --- | --------------------------------- | ----- | ------------------------------------- |
| 00  | `00-ortak-baglam.md`              | —     | uygulanmaz, her prompt önce bunu okur |
| 01  | `01-w1-katalog-ve-sema.md`        | W1    | —                                     |
| 02  | `02-w1-degerlendirici.md`         | W1    | 01                                    |
| 03  | `03-w1-okuma-yolu-ve-api.md`      | W1    | 01, 02                                |
| 04  | `04-w2-mobil-kart-ve-sayfa.md`    | W2    | 03                                    |
| 05  | `05-w2-web-popover.md`            | W2    | 03                                    |
| 06  | `06-w3-rozet-detayi.md`           | W3    | 04, 05                                |
| 07  | `07-w3-rozetlerim-ve-bildirim.md` | W3    | 06                                    |
| 08  | `08-w4-admin-grant-ve-iptal.md`   | W4    | 02, 03                                |
| 09  | `09-dogrulama-ve-kabul.md`        | —     | tüm dalgalar                          |

01→02→03 **sırayla** koşar (aynı dosyalara dokunuyorlar). 04 ve 05 **paralel** koşabilir
(farklı uygulamalar, ortak dosya yok). 06 ve 07 sırayla. 08 bağımsız, W2/W3 ile paralel olabilir.

## Dalga özetleri

- **W1 — motor.** Katalog (`packages/types/src/badges.ts`), Prisma şeması + migration,
  değerlendirici, tetikleyiciler, gecelik iş, backfill, iki platformun okuduğu tek uç.
  **Görsel çıktı bugünküyle birebir aynı kalır** — regresyon riski sıfır, kırmızıya
  düşen tek şey olmalı yeni testler.
- **W2 — görünürlük.** Mobil 1a/1c chip satırı kademe + `+N` taşmasıyla yeniden yazılır;
  web/desktop popover'a aynı chip satırı eklenir. 5 yeni glyph.
- **W3 — anlam.** Rozet detayı (mobil sheet + web panel), "Rozetlerim" ekranı, ilerleme
  çubuğu, `BADGE` bildirimi + socket olayı.
- **W4 — yönetim.** Admin grant/iptal paneli, gecelik iptal taraması, nadirlik yüzdesi.

## Kilitli kararlar (tartışma kapandı)

1. **16 rozet, 5 aile, 28 kademe.** Katalog `00-ortak-baglam.md` §4'te kanonik.
2. **`supporter` katalogda kalır, boş durur.** Faturalandırma akışı yok — rozet kimse
   tarafından kazanılamaz, bu bilinçli.
3. **Değerlendirme = olay tetikleyici + gecelik iş.** Okuma yolunda hesap yok.
4. **Web/desktop kapsamı = popover + rozet detayı + Rozetlerim.** Web'e yeni tam profil
   sayfası açılmaz.
5. **`Contributor.userId` migration'ı yapılır.** Katalog 16 rozet kalır.
6. **`earlyMember` = sabit tarih**, `WHISPR_EARLY_MEMBER_BEFORE` env'inden.
7. **Gizleme toggle'ı yok.** Tüm rozetler herkese açık; ilerleme yalnız kendi profilinde.
8. **Desktop ayrı iş değil.** `apps/desktop` Tauri kabuğu, `apps/web`'i yükler.
