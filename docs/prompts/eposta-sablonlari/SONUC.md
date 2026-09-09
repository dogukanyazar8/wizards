# SONUÇ — Whispr işlemsel e-posta paketi

Tarih: 2026-08-27 · Branch: `uat` · Commit atılmadı · İki dalga da tamamlandı.

Kaynak tasarım `design_handoff/eposta-handoff/` birebir uygulandı. Kayıt doğrulama, şifre
sıfırlama ve kayıt denemesi e-postaları tek sunucu render katmanından çıkıyor; web, masaüstü ve
mobil aynı çıktıyı alıyor.

---

## Teslim

| Katman                | Dosya                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokenlar              | `apps/web/src/lib/email/email-theme.ts`                                                                                                                              |
| Ham yardımcılar       | `email-html.ts`                                                                                                                                                      |
| Adresler (K1)         | `email-links.ts`                                                                                                                                                     |
| Kabuk                 | `email-shell.ts`                                                                                                                                                     |
| Bloklar               | `email-blocks.ts`                                                                                                                                                    |
| Düz metin             | `email-text.ts`                                                                                                                                                      |
| İstek bağlamı (K5/K6) | `email-request-context.ts`                                                                                                                                           |
| Şablonlar             | `templates/verification-code-email.ts`, `templates/password-reset-email.ts`, `templates/registration-attempt-email.ts`, `templates/account-deletion-reauth-email.ts` |
| Galeri (K8)           | `apps/web/src/app/dev/email-preview/page.tsx`                                                                                                                        |

Gönderim yolları: `apps/web/src/lib/auth/email-verification.ts`,
`apps/web/src/lib/auth/password-reset.ts` ve `apps/web/src/lib/auth/reauth-email.ts`.
İmzalar korunmuş, yalnız şifre sıfırlamaya isteğe bağlı istek bağlamı parametresi eklenmiştir.
Kod tabanında artık tek `escapeHtml`, tek e-posta kabuğu ve dört gönderim noktası var; dördü de
aynı tasarımı üretiyor.

## Sayılar

| Ölçü                 | Değer                                                   |
| -------------------- | ------------------------------------------------------- |
| E-posta modülü testi | 181 (`src/lib/email/**`) + 1 güncellenen uç testi       |
| Web test toplamı     | 7723 (0 hata)                                           |
| Sözlük               | 64 yeni `auth.email.*` anahtarı; 28 ölü anahtar silindi |
| En büyük varyant     | 11 753 bayt (sınır 15 360)                              |
| Varyant sayısı       | 7 şablon durumu × 2 dil = 14                            |

## Kabul ölçütleri

00 §15'teki 11 maddenin tamamı yeşil (ayrıntı: `raporlar/dalga-2.md` §6).
Birebirlik kapısı iki referans dosya için de fark üretmedi.

## Sapmalar

| #   | Sapma                                                                          | Kaynak                                    |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| K1  | Bağlantılar ürün rotalarına bakıyor                                            | kullanıcı kararı                          |
| K3  | Tek gönderen                                                                   | kullanıcı kararı                          |
| E1  | Kayıt denemesi bant etiketi                                                    | SPEC çizmiyor                             |
| E2  | Kayıt denemesi göz üstü etiketi                                                | SPEC çizmiyor                             |
| E3  | Kayıt denemesi eylemsiz düzen                                                  | SPEC çizmiyor                             |
| E4  | İngilizce tarih 24 saat                                                        | SPEC yalnız tr örneği veriyor             |
| E5  | Kodsuz doğrulama varyantı (önizleme + konu + boşluk)                           | ürün gerçeği, SPEC çizmiyor               |
| E6  | Hesap silme bant etiketi                                                       | SPEC çizmiyor                             |
| E7  | Hesap silme göz üstü etiketi                                                   | SPEC çizmiyor                             |
| E8  | Hesap silme yedek kutu etiketi SPEC'in `Düğme çalışmıyorsa` metnini kullanıyor | eski cümle kısa etiket biçimine uymuyordu |
| E9  | Hesap silme önizleme satırı yazıldı                                            | eski şablonda preheader yoktu             |

Bunların dışında tasarımdan sapma yok.

## Koşulamayan

- `pnpm --filter @wizards/web e2e:api` — ortam ön denetimi `E2E_TEST_MODE`,
  `E2E_DATABASE_URL`/`DATABASE_URL` ve `E2E_TEST_PASSWORD` eksikliğini bildiriyor.
- Piksel karşılaştırması — bu oturumda tarayıcı paneli görüntülenmediği için ekran görüntüsü
  alınamadı. Düzen, çerçeve içindeki hesaplanmış değerlerle doğrulandı (`raporlar/dalga-2.md` §4).

## Açık kalan kararlar

1. Kayıt denemesi metni "siz" dilinde, SPEC şablonları "sen" dilinde. K4 metni dondurdu; dil
   birliği istenirse ayrı karar.
2. Üretimde `hesap@` / `guvenlik@` gönderici ayrımı istenirse K3 tersine döner ve iki yeni
   ortam değişkeni gerekir.
3. Gerçek gönderim üzerinden duman testi yapılmadı (Resend'e tek bir mektup gönderilip gelen
   kutusunda açılmadı); istemci uyumu yalnız kod ve tarayıcı düzeyinde doğrulandı.

## Raporlar

- `raporlar/dalga-1.md` — tasarım katmanı + doğrulama kodu + kayıt denemesi
- `raporlar/dalga-2.md` — şifre sıfırlama + istek bağlamı + galeri + doğrulama; §10 hesap silme
  yeniden kimlik doğrulama e-postasının aynı kabuğa geçirilmesi
