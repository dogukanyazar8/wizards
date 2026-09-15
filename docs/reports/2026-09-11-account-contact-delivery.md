# Hesap iletişim bilgileri — 11 Eylül 2026

Web ve masaüstünün ortak Hesap sekmesine e-posta değiştirme ve telefon kaydı eklendi.

## Davranış

- Parolalı hesap: mevcut parola, etkinse mevcut 2FA/kurtarma kodu, yeni adrese gönderilen altı haneli kod.
- Parolasız Google hesabı: etkinse mevcut 2FA/kurtarma kodu, ayrı tarayıcıda yeniden Google yetkilendirmesi, ardından yeni adrese kod. Sağlayıcı hesabı `providerAccountId` üzerinden mevcut kullanıcıyla eşleşir; hesap bağlantısı korunur. İptal edilmiş doğrulamanın çerezi sonraki normal girişi ele geçirmez.
- Doğrulama tamamlanana kadar mevcut adres değişmez. Eski adrese değişim isteği bildirimi gönderilir.
- Kod 10 dakika geçerli, en fazla 5 deneme. Yeniden başlatmada en az 60 saniye beklenir. İstekler hesap başına 5/15 dakika; doğrulamalar 10/10 dakika. Redis hız sınırı mevcut fail-closed altyapıyı kullanır.
- Kodlar HMAC, Google geçiş belirteçleri SHA-256 özeti olarak saklanır. Tek kullanıcı için tek bekleyen kayıt; yeniden istek önceki kaydı geçersiz kılar.
- PostgreSQL kullanıcı satırı kilidi altında adres, doğrulama durumu, oturum iptali, eski doğrulama/yeniden doğrulama kayıtlarının silinmesi ve `EMAIL_CHANGED` kaydı tek transaction içinde işlenir. Adresin benzersizliği veritabanı kısıtıyla da korunur.
- Mevcut profil güncelleme yolu e-posta değiştiremez. Aynı adresi taşıyan eski profil istekleri de e-posta kolonunu tekrar yazmaz.
- Telefon ülke koduyla eklenir, değiştirilir veya boş bırakılarak kaldırılır. `phoneVerified: false`; yanıt ve ekran maskeli numara taşır. Doğrulama düğmesi pasif, “Yakında”.
- Hesap sekmesindeki tekrar doğrulama e-postası satırı ve bağlı hesapların profilde görüneceği açıklaması kaldırıldı. Bağlama düğmeleri pasif “Yakında”.

## Kayıt doğrulaması

`auth/actions.ts` kayıt sırasında doğrulanmamış kullanıcı oluşturur ve doğrulama gönderir. `auth/login-credentials.ts` doğrulanmamış adresle girişi reddeder. Google sağlayıcısında `auth.ts` ve `auth/oauth-email.ts` sağlayıcının doğrulanmış e-posta bilgisini denetler. Ayarlar satırının kaldırılması bu korumaları kaldırmaz; yeni adres ayrıca doğrulanır.

## Doğrulama

- PASS: değiştirilen dosyalarda ESLint ve Prettier.
- PASS: Graphify sorgusu kullanıldı, `graphify update .` tamamlandı: 38.821 düğüm, 92.045 ilişki. İlk Windows `WinError 5` hatası yeniden denemede giderildi; büyük grafik için HTML üretimi otomatik atlandı.
- PASS: son dar regresyon seçiminde 92/92 test. İletişim servisi/sözleşmesi, profil e-posta koruması, bağlı hesap metinleri, ayar çevirileri, giriş/oturum ve middleware kontrolleri.
- PASS: gerçek, geçici PostgreSQL üzerinde teslim migration'ı ve 5 entegrasyon testi. Aynı kodla 4 paralel istekten yalnız biri başarılı; 9 paralel yanlış deneme en fazla 5 hak tüketir; aynı yeni adresi isteyen iki hesaptan biri kazanır. Web/Desktop/Mobile `AuthSession` kayıtları iptal edilir, eski oturum ve doğrulama kayıtları silinir. Telefon ekleme/değiştirme/silme kalıcıdır; doğrulama yetkisi verilmez.
- Geniş odaklı test seçimi: 132 test, 128 PASS, 4 FAIL. Hatalar aşağıda ayrı listelendi. Yeni iletişim sözleşmesi, servis, Google eşleşmesi, ilgili giriş/oturum ve middleware testleri geçti.
- PASS: yeni Playwright dosyasında Chromium için 2 senaryo keşfedildi. Listeleme çalıştırmadır; tarayıcı kabulü değildir.
- NOT RUN: gerçek Google sağlayıcı akışı, Resend teslimatı, tarayıcı/Tauri ekran etkileşimi, tam uygulama build'i ve bütün monorepo testleri.
- Ana yerel/UAT/üretim veritabanı değiştirilmedi. Test konteynerleri ve geçici şema kaldırıldı. Commit/push/deploy yapılmadı.

Tekrarlanabilir PostgreSQL kontrolü, repo kökünden:

```powershell
node apps/web/scripts/test-email-change-postgres.mjs
```

Bu komut yalnız kendisinin oluşturduğu, loopback portuna bağlı `email_change_disposable` veritabanını kullanır. Gerçek e-posta göndermez; test teslimatı bellekte yakalanır.

## Yayın gereksinimleri

- Aktif migration dizini `packages/db/prisma/rebaseline-migrations`; yeni dosya `20260911120000_account_email_change/migration.sql`.
- Uygulama sürümünden önce bu migration hedef ortama uygulanmalı. Normal `db:migrate:deploy` komutu bekleyen bütün migration'ları kapsar; bu kirli çalışma ağacındaki diğer bekleyen değişiklikler de yayın öncesi incelenmeli.
- Mevcut `AUTH_SECRET`/`NEXTAUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` veya `RESEND_FROM`, Google istemci kimliği/gizlisi ve Redis yapılandırması kullanılır. Yeni dış bağımlılık eklenmedi.
- Google callback mevcut `/api/auth/callback/google`; sağlayıcıda yeni redirect URI gerekmez. `/settings/email-change/google` yalnız belirteçli yeniden doğrulama köprüsüdür; e-posta değiştirme işlemi oturum gerektiren server action'da kalır.

## Additional observations

- **medium** — `lib/settings/tree.ts:220`, profil `ps` satırındaki mevcut `defaultValue: ""`, `number | boolean` sözleşmesiyle uyuşmuyor (`TS2322`). Son web typecheck bu hatada başarısız; iletişim akışına ait yeni tip hatası bildirilmedi.
- **medium** — `profile-banner-field.tsx` mevcut profil testlerinde `No QueryClient set` ve `React is not defined` hataları üretiyor. İki Hesap sekmesi testi bu nedenle başarısız.
- **minor** — `functional-coverage.test.ts` mevcut masaüstü/hakkında kullanılabilirlik sınıflandırmasıyla; `tree.test.ts` mevcut `ps` özel bloğunun başlık taşımasıyla uyuşmuyor. Bu iki test başarısız. İletişim değişikliği dışındaki WIP düzeltilmedi.

Güvenlik tasarımında başvurulan kaynak: [OWASP — Authentication Cheat Sheet, Changing a User's Registered Email Address](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#changing-a-users-registered-email-address).
