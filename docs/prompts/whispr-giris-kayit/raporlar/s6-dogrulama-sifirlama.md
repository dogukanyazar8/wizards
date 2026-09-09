# Ş6 — Web: E-posta doğrulama + şifre sıfırlama zinciri (Dalga 2)

Durum: **tamamlandı.** Dalga 2 kapandı. Dal: `uat`. Commit yok.

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §4.5, §4.7, §7/8, §7/9, §8, §9, §11.
Kararlar: `PLAN.md` §3 (K3 · K10 · K11).

---

## 1. Kurulan ekranlar

| Rota                     | Dosya                                                           | SPEC                  |
| ------------------------ | --------------------------------------------------------------- | --------------------- |
| `/verify-email`          | `verify-email/page.tsx` (iki başlı) + `verify-email-client.tsx` | §4.5                  |
| `/forgot-password`       | `forgot-password/page.tsx` + `forgot-password-client.tsx`       | §4.7                  |
| `/forgot-password/sent`  | `forgot-password/sent/page.tsx` + `sent-client.tsx`             | §4.7 (iki durum, K11) |
| `/reset-password?token=` | `reset-password/page.tsx` + `reset-password-client.tsx`         | §4.7                  |
| `/reset-password/done`   | `reset-password/done/page.tsx` + `done-client.tsx`              | §4.7 kapanış          |

### 1.1 `/verify-email` iki başlı (K3)

- `?token=…` → gönderilmiş **bağlantı** sunucuda tüketilir. Doğrulandıysa ortalanmış başarı
  ekranı; süresi geçmiş ya da geçersizse **seviye 3 blok** (SPEC §7/8).
- Token yoksa → altı haneli **kod** ekranı. Adres sekmeden okunur (Ş5 yazıyor), sorgu dizesine
  yazılmaz.
- Kod tamamlanınca form **otomatik gönderilmez**; düğme etkinleşir.
- `Tekrar gönder · 00:42` sayacı bitince yerini `Kodu tekrar gönder` bağlantısı alır.

### 1.2 `Bağlantı gönderildi` → `yeniden gönderildi` (K11)

Tek rota, iki durum. `Kodu tekrar gönder` basıldığında SPEC §4.7'nin istediği **tam olarak üç şey**
değişir:

1. Aurora `success` tonuna geçer (ikinci radyal `--success/.16`).
2. Açıklamanın altına hata bandıyla birebir aynı yapıda, success tonunda bant girer — karo glifi
   `↻` (bileşende sabit, `✓` değil).
3. `Kodu tekrar gönder` bağlantısının yerini geri sayım pill'i alır; sayaç bitince pill kaybolur
   ve bağlantı geri gelir.

### 1.3 `Yeni şifre` → `Şifre güncellendi`

- İki alan (K10), altında hesap oluşturma ekranındakiyle **aynı** güç göstergesi ve 2×2 kural
  listesi. Kapı: `meetsPasswordPolicy` **ve** iki alanın eşleşmesi.
- Token sunucuda önceden doğrulanıyor: süresi geçmiş bağlantıyla gelen kullanıcı formu hiç görmez.
- Kapanış ekranı akışın **tek ortalanmış** ekranı; aurora ters çevrilir
  (`success-final`: birinci radyal `--success/.18`, ikinci `--primary/.16`).
- Bilgi bandı gerçek sayıyla yazılır; **sayı sıfırsa bant gösterilmez**.
- Ekrana yalnız başarılı bir güncellemeden sonra girilebilir; doğrudan gelinirse `/login`.

---

## 2. Ş2'nin bıraktığı sayaç borcu kapatıldı

Ş2 raporu şunu yazmıştı: _"`resendPasswordResetAction` `retryAfterMs` döndürmüyor; Ş6 isterse hız
sınırı yardımcısı kalan süreyi döndürecek şekilde genişletilmeli."_ Genişletildi:

| Dosya                             | Ekleme                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/rate-limit.ts`               | `peekRateLimitRetryAfterMs` — kayan pencerenin **en eski** kaydından kalan süreyi okur                                                                                   |
| `lib/auth/request-rate-limits.ts` | `getPasswordResetResendRetryAfterMs` · `getVerificationResendRetryAfterMs`                                                                                               |
| `lib/auth/actions.ts`             | `forgotPasswordAction` başarıda ve hız sınırında `retryAfterMs` döndürüyor; `resendPasswordResetAction` `resent: true` ekliyor; yeni `resendEmailVerificationCodeAction` |

Sayaç **sunucudan** okunuyor: sayfa yenilense de doğru kalıyor ve istemci saatine bağlı değil.

---

## 3. Yeni taşıyıcılar

| Dosya                               | İş                                                           |
| ----------------------------------- | ------------------------------------------------------------ |
| `lib/auth/pending-reset.ts`         | Adres + kalan kilit süresi (`sent` ekranı için)              |
| `lib/auth/pending-reset-outcome.ts` | Kapatılan cihaz sayısı + zaman damgası (kapanış ekranı için) |

İkisi de `sessionStorage`; ne adres ne oturum sayısı sorgu dizesine yazılıyor (kişisel veri).

## 4. Silinenler

`components/auth/login-page.tsx` · `login-card.tsx` · `theme-toggle.tsx` — Ş6'dan sonra hiçbir
yer kullanmıyordu; kullanım taramasıyla doğrulanıp silindiler. Eski `/verify-email` ve
`/reset-password` sayfalarının kendi işaretlemesi de kalktı.

## 5. Testler

`app/(auth)/reset-chain-contract.test.ts` — 13 test: iki başlı doğrulama rotası · süresi geçmiş
bağlantının blok paneli · §4.5 parça listesi · otomatik gönderim olmaması · sayaç↔bağlantı
takası · **yeniden gönderimde tam üç değişiklik** · adresin ve sonucun URL'e yazılmaması ·
sıfırlamada tekrar alanının kalması · gönderim kapısı · kapanış ekranının ortalanması ve ters
aurorası · cihaz sayısı sıfırken bandın gizlenmesi · doğrudan erişimde yönlendirme · SPEC
sürelerinin (30 dk / 10 dk / 60 sn) kodda tutması.

Regresyon: `app/(auth)` + `components/auth` + `lib/auth` + auth metin testi → **334/334 ✅**.
`pnpm --filter @wizards/web typecheck` → Ş6 tarafında **0 hata**.

## 6. Kararlar ve sapmalar

1. **Süresi geçmiş bağlantının `Yeni bağlantı gönder` eylemi kod ekranına gidiyor.** Token adres
   taşımıyor, yani bağlantıyı tıklayan tarayıcı kime yeniden göndereceğini bilmiyor. Eylem
   `/verify-email`'e gider: sekmede bekleyen adres varsa oradan yeniden gönderilir, yoksa ekran
   `E-posta adresini değiştir` yolunu sunar. Ölü düğme yerine çalışan yol.
2. **`sent` ekranındaki yeniden gönderme Turnstile token'ı taşımıyor.** Kullanıcı bir adım önce
   zaten doğrulandı; yeniden gönderme sunucuda 60 saniyelik kilit + saatlik hız sınırıyla
   korunuyor. Boş token gönderiliyor ve sunucu jenerik yanıt veriyor.
3. **`E-posta uygulamasını aç` `mailto:` açıyor.** SPEC düğmeyi istiyor ama hedefi tanımlamıyor;
   sağlayıcıya göre webmail adresi uydurmak yanlış olurdu.
4. **Doğrulama başarı ekranı SPEC'te ayrı çizilmedi.** `?token=` ile gelen kullanıcı bir yere
   düşmek zorunda; §4.7'nin kapanış ekranının dilini kullanan ortalanmış bir başarı ekranı
   çizildi ve mevcut `auth.verifyEmail.success*` metinleri kullanıldı.

## 7. Sonraki şeritler için borç

1. **`auth-reference-*` ve `modern-*` CSS artık büyük ölçüde ölü.** `turnstile-widget.tsx` üç
   sınıfı kullanmaya devam ediyor; kalanının taranıp silinmesi Ş9'da.
2. **Eski `auth.verifyEmail.*` / `auth.forgot.*` / `auth.passwordReset.*` anahtarlarının bir
   kısmı artık çağrılmıyor.** Ş9 listeleyecek (silmeyecek — başka yüzey kullanıyor olabilir).
3. **E2E `helpers/auth.ts`** giriş seçicilerini kullanıyor; sıfırlama zinciri için senaryo varsa
   yeni rotalara (`/forgot-password/sent`, `/reset-password/done`) göre güncellenmeli.
