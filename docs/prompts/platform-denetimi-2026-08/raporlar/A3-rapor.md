# A3 — Güvenlik denetimi

Temel commit: `5a2b3990733b17672cf65fba631b7ec44a7bf96a` · Tarih: 2026-08-08
Kanonik veri: [`A3.findings.json`](A3.findings.json)

Kapsam savunmacı: kendi kod tabanımızda zafiyet arandı, hiçbir zafiyet düzeltilmedi, canlı sisteme dokunulmadı, sömürü kodu yazılmadı.

## Kapsam ve yöntem

211 rotanın **ithal grafiği derinlik 2 izlenerek** tarandı (`scan-routes2.mjs`): route.ts → route-logic.ts → servis zinciri. Bu şart, çünkü bu kod tabanında **yetkilendirme rota dosyasında değil servis katmanında** duruyor.

Statik tarama üç turda kalibre edildi ve sonuç şu: **anahtar kelime taraması bu repoda yetkilendirmeyi ölçemiyor.** İlk tur 177 yanlış pozitif verdi (gerçek guard adı `requireApiUserId`'ydi, listede yoktu). Doğru isimler eklenince 46'ya, gerçek yetkilendirme yardımcıları (`ensureServerPermission`, `getAccessContext`, `PermissionBits`) eklenince **0'a** düştü. Yani tarama ne varlığı ne yokluğu kanıtlıyor — bu gözlemin kendisi A3-002 oldu.

Bu yüzden 12 yüksek riskli rota elle okundu.

**Kapsam boşluğu açıkça:** kimlik yüzeyinin 62 dosyasından 8'i okundu. Parola sıfırlama, oturum iptali, reauth, TOTP tam akışı, turnstile okunmadı. Socket handler'ların 4'ü okunmadı. `lib.rs` IPC girdi doğrulaması okunmadı. `cargo audit` çalıştırılmadı. **A3 ikinci bir tur istiyor.**

## Bulgu özeti

critical 0 · high 1 · medium 1 · low 0 — toplam **2**

| id     | Başlık                                                              | Sev    | Efor | Dalga |
| ------ | ------------------------------------------------------------------- | ------ | ---- | ----- |
| A3-001 | 3 yüksek önemli bağımlılık advisory'si; `ci` betiğinin ilk adımı bu | high   | S    | W0    |
| A3-002 | Yetkilendirme yalnız servis katmanında, araçla zorlanmıyor          | medium | L    | W2    |

## Bulgular

**A3-001 — Bağımlılık kapısı bugün kırmızı.** `pnpm audit --audit-level moderate` üç yüksek önemli bulgu dönüyor:

| Paket        | Sorun                                          | Yamalı sürüm |
| ------------ | ---------------------------------------------- | ------------ |
| `image-size` | ICNS ayrıştırıcısında sonsuz döngü (DoS)       | ≥ 2.0.3      |
| `image-size` | JXL/HEIF ayrıştırıcılarında sonsuz döngü (DoS) | ≥ 2.0.3      |
| `nanoid`     | Özel üreteçlerde `size = 0` sonsuz döngü (DoS) | ≥ 3.3.17     |

Üçü de Expo üzerinden geçişli (`nanoid` için 100 yol). Asıl mesele ikinci katman: kök `ci` betiği (`package.json:14`) tam olarak bu komutla **başlıyor**. Yani zincir ilk adımda kırılır — ya CI bu betiği koşmuyor ya da kapı kırmızı duruyor. Son commit'in adı `fix(security): patch js-yaml audit`, yani bu kapı bilinçli işletiliyor; bulgu "bilinmiyor" değil, "yeni oluşmuş, henüz kapatılmamış".

**A3-002 — Yetkilendirme denetlenemiyor.** Örnek: mobil kanal geçmişi silme ucu. `route-logic.ts:47` yalnız `authenticate` çağırıyor; asıl kontrol iki katman aşağıda, `channel-service.ts:366`'da `ensureServerPermission(access, PermissionBits.CLEAR_CHANNEL_HISTORY)`. Bu **doğru** çalışıyor — ama hiçbir lint kuralı, tip kısıtı veya sözleşme testi bu çağrının varlığını zorlamıyor. Yeni bir yıkıcı uç, kontrolü unutsa da mevcut rotalarla birebir aynı görünür. `route-contract.test.ts` ailesi kimlik ve şema kaydını zorluyor, yetkilendirmeyi zorlamıyor.

## Çürütülen bulgular

Denetimin en önemli bölümü. Beşi yazılmadan düştü; biri **yazıldıktan sonra** düştü.

| Hipotez                                                                    | Sonuç                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSP başlığı yok**                                                        | **Yanlış.** Bulgu olarak yazılmıştı, sonra çürütüldü. CSP `apps/web/src/proxy.ts:162`'de var (Next 16'da `middleware.ts` yerine `proxy.ts`). Üretimde `script-src 'nonce-<n>' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Tek gevşeme `style-src 'unsafe-inline'`. Bulgu **rapordan kaldırıldı.** |
| E2E rotaları üretimde erişilebilir                                         | **Hayır.** `lib/e2e/route-guard.ts` üç katman uyguluyor: `NODE_ENV !== production`, `E2E_TEST_MODE === "true"`, hem yapılandırılmış URL'lerde hem istek URL'inde yerel host kontrolü.                                                                                                                                                                            |
| Google OAuth `allowDangerousEmailAccountLinking: true` = hesap ele geçirme | **Hayır.** `auth.ts:711` yorumu doğru: `canOAuthUserSignIn` (`oauth-email.ts:128`) `email_verified` olmayan Google profilini reddediyor; GitHub tarafında `allowDangerousEmailAccountLinking: false` ve ayrı e-posta doğrulaması var.                                                                                                                            |
| Mobil oturum token'ı düz depoda                                            | **Hayır.** `expo-secure-session-store.ts` SecureStore kullanıyor.                                                                                                                                                                                                                                                                                                |
| SSRF: link önizleme / ek dosya indirme                                     | **Hayır.** `assertPublicHttpUrl` hem `link-preview.ts:232` hem `download-proxy.ts:119`'da; yönlendirme sonrası **yeniden** doğruluyor, yönlendirme sayısı 4 ile sınırlı.                                                                                                                                                                                         |
| Mobil giriş brute-force'a açık                                             | **Hayır.** `enforceMobileAuthRateLimit(request, "mobile:auth-login", subject)`.                                                                                                                                                                                                                                                                                  |
| Tauri capability'leri geniş                                                | **Hayır.** Uzak URL yükleyen pencerelerde `permissions: []`; ayrıcalıklı komutlar yalnız uzak URL yüklemeyen `desktop-control` penceresinde.                                                                                                                                                                                                                     |
| Repoda gömülü sır                                                          | **Yok.** Tek eşleşme bir test fixture'ı.                                                                                                                                                                                                                                                                                                                         |

## Rota guard tablosu (özet)

Tam tablo: `scratchpad/route-guard-table.json` (211 satır).

| Ölçüt                    | Değer                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| Toplam rota              | 211                                                                |
| Kimlik kapısı taşımayan  | **14** — 14'ünün tamamı elle doğrulandı, hepsi tasarım gereği açık |
| Oran sınırı taşıyan      | **206**                                                            |
| Şema doğrulaması taşıyan | **208**                                                            |
| Yazma metodu taşıyan     | 144                                                                |
| Yazma + oran sınırı yok  | **1** (`api/e2e/auth/session`, üretimde kapalı)                    |

Kimlik kapısı olmayan 14 rota: NextAuth catch-all, `health`, `app/version`, `app/updates/manifest`, `desktop/download`, `e2e/auth/session` (üç katmanlı kapı) ve 8 mobil auth ucu (`login`, `register`, `refresh`, `revoke`, `exchange`, `google`, `forgot-password`, `verification-email`) — hepsi oran sınırlı.

## Zafiyet sınıfı × yüzey matrisi

| Sınıf             | Web                    | Mobil                           | Desktop               | Backend      |
| ----------------- | ---------------------- | ------------------------------- | --------------------- | ------------ |
| Kimlik doğrulama  | kısmi tarandı, temiz   | temiz (SecureStore, rate limit) | kapsam dışı           | kısmi        |
| Yetkilendirme     | —                      | —                               | —                     | **A3-002**   |
| Veri sızıntısı    | taranmadı              | taranmadı                       | —                     | taranmadı    |
| Girdi doğrulama   | 208/211 şema           | taranmadı                       | okunmadı              | 208/211 şema |
| SSRF              | temiz                  | —                               | —                     | temiz        |
| Oran sınırlama    | 206/211                | temiz                           | —                     | 206/211      |
| Gerçek zaman      | kısmi (3/7 dosya)      | —                               | —                     | kısmi        |
| İstemci güvenliği | temiz (CSP + 5 başlık) | kısmi                           | temiz (capabilities)  | —            |
| Bağımlılık        | —                      | **A3-001**                      | cargo audit koşulmadı | **A3-001**   |

## Ölçümler

| Metrik                                        | Değer                 | Ağaç     |
| --------------------------------------------- | --------------------- | -------- |
| Rota (guard tablosu)                          | 211                   | baseline |
| Kimlik kapısı yok                             | 14 (hepsi doğrulandı) | baseline |
| Oran sınırı / şema                            | 206 / 208             | baseline |
| Yüksek önemli npm advisory                    | **3**                 | working  |
| Güvenlik başlığı                              | 5 + CSP               | baseline |
| CSP direktifi                                 | 14                    | baseline |
| `ensureServerPermission` / `getAccessContext` | 31 / 38               | baseline |
| Gömülü sır                                    | 0                     | baseline |
| Tauri capability dosyası                      | 5                     | baseline |

## Kapı sonucu

```
findings 2 sema disi 0
kanit hatasi 0        (dosya + satir + ALINTI eslesmesi dogrulandi)
rota kapsami 211/211  critical 0
```

## Açık sorular

1. `proxy.ts` satır 200–286'daki origin/CSRF doğrulaması okunmadı.
2. `cargo audit` çalıştırılmadı — `pnpm --filter @wizards/desktop release:cargo-audit-summary`.
3. Socket handler'ların 4'ü (`channel`, `dm`, `message`, `presence`) okunmadı: oda katılım yetkisi ve yayın hedefi doğrulanmadı; çıkarılan üyenin soketinin gerçekten düşüp düşmediği açık.
4. TOTP tam akışı (kurtarma kodları, brute-force sınırı, yeniden kayıt yetkisi) okunmadı; yalnız AES secret şifrelemesi ve 120 sn replay TTL'i doğrulandı.
5. Parola sıfırlama, oturum iptali, reauth akışları okunmadı — kimlik yüzeyinin en riskli üç akışı.
6. `lib.rs` içindeki 26 Tauri IPC komutunun girdi doğrulaması okunmadı.
7. UploadThing callback imzası ve attachment sahiplik kontrolü okunmadı.
8. `apps/mobile/src/storage` SQLCipher anahtar yönetimi doğrulanmadı.
9. `style-src 'unsafe-inline'` kaldırılabilirliği ölçülmedi (düşük riskli, bulgu yazılmadı).
