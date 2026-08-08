# A3 — Güvenlik denetimi

Ön koşul: `00-ortak-baglam.md` okundu.
Çıktı: `raporlar/A3.findings.json` + `raporlar/A3-rapor.md`.

Kapsam **savunmacıdır**: kendi kod tabanımızda zafiyet bulmak ve kapatma yolunu yazmak. Sömürü aracı, canlı sisteme saldırı, üçüncü taraf hedefleme yok. Bulunan zafiyet **düzeltilmez, raporlanır**; düzeltme `W0` dalgasına girer.

## Amaç

Kimlik, yetki, veri sızıntısı ve istemci güvenliği açısından üretim seviyesinde bir platformun taşıyamayacağı her açığı kanıtla ortaya koymak. Ölçüt OWASP Top 10 + OWASP API Top 10 + platformun kendi tehdit modeli (çok kiracılı sunucu/kanal izolasyonu, gerçek zamanlı yayın, medya/ses).

## Tohum sorgular

```bash
graphify query "authentication session and token handling" --budget 8000
graphify query "authorization capability checks and permission gates" --budget 8000
graphify explain "requireAdminCapability"
graphify explain "rate limit"
graphify path "apps/web/src/auth.ts" "apps/web/src/app/api"
graphify query "file upload and attachment handling" --budget 8000
graphify query "livekit token generation" --budget 8000
graphify query "tauri ipc commands and capabilities" --budget 8000
```

## Kapsam matrisi

| Yüzey                                                           | Birim       | Hedef kapsam                                   |
| --------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| `apps/web/src/app/api/**/route.ts`                              | 228 rota    | **%100** — her rota için guard var/yok tablosu |
| Socket handler + `rate-limits.ts`                               | 7 dosya     | %100                                           |
| `apps/web/src/auth.ts` + `lib/auth/**`                          | tamamı      | %100                                           |
| `apps/web/src/middleware.ts`, `proxy.ts`                        | 2 dosya     | %100                                           |
| Yükleme / ek dosya yolu                                         | tamamı      | %100                                           |
| `apps/mobile/src/security`, `storage`, `auth`                   | tamamı      | %100                                           |
| `apps/mobile/src/deep-link`                                     | tamamı      | %100                                           |
| `apps/desktop/src-tauri` (`lib.rs`, capabilities, `tauri.conf`) | tamamı      | %100                                           |
| Ortam değişkeni sözleşmesi (`lib/env.ts`, `.env.example`)       | tamamı      | %100                                           |
| Bağımlılıklar                                                   | npm + cargo | `pnpm audit`, `cargo audit` çıktısı            |

228 rotanın guard tablosu bu eksenin **çıkarılabilir en değerli artefaktıdır**. Statik olarak üret, sonra guard'sız görünen her rotayı elle doğrula (bir kısmı `middleware`/`proxy` katmanında korunuyor olabilir — bu çürütmedir, rapora yazılır).

## Aranacak zafiyet sınıfları

### 1. Kimlik doğrulama

- Oturum üretimi/yenilemesi: token ömrü, yenileme penceresi, iptal (revocation) yolu. Çıkışta sunucu tarafı gerçekten geçersiz kılıyor mu, yoksa yalnız istemci mi siliyor?
- Parola: hash algoritması ve maliyet parametresi; `passwordHash`'in herhangi bir yanıt/oturum nesnesine sızması.
- TOTP/2FA: secret üretimi, saklanması, doğrulama penceresi, kurtarma kodları, brute-force sınırı, yeniden kayıt (re-enroll) yetkisi.
- OAuth: state/PKCE, hesap birleştirme (account linking) ile hesap ele geçirme, e-posta doğrulanmadan birleştirme.
- Yeniden kimlik doğrulama (reauth challenge) akışının atlanabilirliği.
- Mobil oturum: token nerede duruyor (secure store mu, düz AsyncStorage mı), yenileme yarışları, 401 dışında oturum silinmesi.

### 2. Yetkilendirme

- **IDOR**: `params.<id>` ile doğrudan kayıt çekip sahiplik/üyelik kontrolü yapmayan rota. En verimli tarama: `route.ts` içinde `params.` geçen ve `member`/`capability`/`requireAuth` geçmeyen dosyalar.
- Kanal/sunucu izolasyonu: A sunucusunun üyesi B sunucusunun kanal mesajını okuyabiliyor mu? DM'de üçüncü kişi okuma yolu var mı?
- Rol/capability haritası: `requireAdminCapability` gibi kapıların **tam listesi** ve hangi rotada hangisinin uygulandığı. Kapı adı doğru ama seviyesi yanlış olan yerler (örneğin yazma işini okuma yetkisiyle korumak).
- Yetki yükseltme: davet, terfi, sahiplik devri, sunucu tipi değiştirme, ban/kick uçlarında hedefin kendinden yüksek rolde olması kontrol ediliyor mu?
- **Mass assignment**: şemada `.strict()` olmayan güncelleme uçları; kullanıcının ayrıcalıklı alan (`type`, `isPublic`, `verificationLevel`, `role`, `features`) göndermesi.
- Yasaklı/banlı/silinmiş hesabın hâlâ geçerli token'la iş yapabilmesi.

### 3. Veri sızıntısı

- Yanıt şekli: kullanıcı nesnesinde e-posta, telefon, IP, `passwordHash`, `totpSecret`, iç id sızıntısı. Özellikle liste uçlarında ve socket payload'larında.
- Presence/görünürlük: "Görünmez" durumdaki kullanıcının varlığının başka bir uçtan (yazıyor, ses odası, son görülme, üye listesi) sızması. Bu ailede daha önce **fail-open** kapı görüldü — gizlilik kapısı hata durumunda açık kalıyorsa bulgu `high` ya da üstü.
- Davet/önizleme uçları: kimliksiz erişilebilen uçların ne kadar meta veri döktüğü (üye sayısı, kanal listesi, sahibin adı).
- Keşif (discovery) listesi: `discoverable=false` sunucunun herhangi bir uçtan görünmesi.
- Hata yanıtları: stack trace, Prisma hata metni, iç dosya yolu dönen uçlar.
- Log/telemetri: token, e-posta, mesaj içeriği loglanıyor mu; Sentry'ye giden veri maskeleniyor mu (`instrument.ts`, `instrumentation-client.ts`).

### 4. Girdi doğrulama ve enjeksiyon

- Şemasız gövde parse eden uçlar; `as` ile tip zorlanan yerler.
- Ham SQL (`$queryRaw`, `$executeRaw`) kullanımı ve parametrelendirme.
- Arama/full-text yolu: kullanıcı girdisinin tsquery/regex'e doğrudan girmesi (ReDoS dahil).
- Dosya adı/yol birleştirme (path traversal), medya işleme.
- **SSRF**: sunucunun kullanıcı verdiği URL'yi çekmesi (link önizleme, avatar/banner import, webhook, Giphy/harici entegrasyonlar).
- Markdown/mesaj render: XSS yüzeyi, `dangerouslySetInnerHTML`, mobilde WebView kullanımı.
- Deep link/invite link: mobilde `apps/mobile/src/deep-link` parametrelerinin doğrulanması, sahte link ile istenmeyen aksiyon tetikleme.

### 5. Oran sınırlama ve kötüye kullanım

- `api-rate-limit.ts` hangi uçları kapsıyor, kapsamayan pahalı uçlar hangileri (arama, davet üretimi, dosya yükleme, mesaj gönderimi, parola sıfırlama, TOTP doğrulama).
- Socket tarafındaki sınırların kapalı bir union mı yoksa açık liste mi olduğu — yeni olay eklendiğinde sınırsız kalıyor mu?
- Sınırın anahtarı ne: IP mi, kullanıcı mı, ikisi mi? Proxy arkasında IP güvenilir mi (`trusted proxy` yapılandırması)?
- Enumeration: e-posta/kullanıcı adı var mı sorusuna farklı yanıt/zamanlama veren uçlar.

### 6. Gerçek zaman ve medya

- Socket el sıkışmasında kimlik doğrulaması; oda katılımında yetki kontrolü (`join` sırasında üyelik doğrulanıyor mu, yoksa yalnız istemci mi karar veriyor).
- Odadan çıkarma gerçekten soketi düşürüyor mu (yalnız state güncellemek yetmez).
- LiveKit/ses: token minting yetkisi, token kapsamı (grant), TTL, oda adı tahmin edilebilirliği; ekran paylaşımı/kamera izinlerinin sunucu tarafı doğrulaması.
- Yayın hedefi: bir olayın hedef odadan geniş bir kitleye gitmesi (over-broadcast).

### 7. İstemci ve dağıtım güvenliği

- Web: CSP, `X-Frame-Options`, HSTS, cookie bayrakları (`httpOnly`, `Secure`, `SameSite`), CSRF stratejisi (özellikle cookie tabanlı oturum + POST uçları).
- Mobil: sertifika/ağ yapılandırması, kök tespiti gerekliliği, `apps/mobile/src/storage` şifreleme anahtarının nerede durduğu, ekran görüntüsü/clipboard hassasiyeti, OTA güncelleme zinciri.
- Desktop (Tauri): `capabilities`/permission listesi genişliği, `withGlobalTauri`, IPC komutlarının girdi doğrulaması, updater imza doğrulaması ve manifest kaynağının sabitlenmesi, harici URL açma yolu, CSP.
- Sır yönetimi: repoda gömülü anahtar araması, `.env.example` ile gerçek ortam değişkeni sözleşmesinin uyuşması, CI secret kullanımı (`.github/workflows`), `actionlint` bulguları.
- Bağımlılık: `pnpm audit --audit-level moderate` ve `pnpm --filter @wizards/desktop release:cargo-audit-summary` çıktıları; `patches/` altındaki yamaların ne düzelttiği.

## Yapılmayacaklar

- Kod düzenleme, zafiyet kapatma.
- Çalışan sisteme (UAT/prod) saldırı, tarama, kimlik denemesi. Denetim **statik + yerel**.
- Sömürü kodu (PoC exploit) yazmak. `failureScenario` metinle anlatılır; istek/gövde örneği verilebilir, otomatik araç yazılmaz.
- Teorik zafiyet listesi. Her madde bu repodaki bir `file:line`'a bağlanmalı.
- Zafiyet ayrıntılarının repo dışına çıkarılması. HTML rapor yerel dosyadır; sahibinin açık onayı olmadan yayımlanmaz (`08` §Yayımlama).

## Teslim

1. `raporlar/A3.findings.json`.
2. `raporlar/A3-rapor.md`, ek olarak:
   - **Rota guard tablosu** (228 satır, kısaltılmış gruplandırma kabul): yol, HTTP metodu, kimlik kapısı, yetki kapısı, oran sınırı, şema, not.
   - **Zafiyet sınıfı × yüzey matrisi**: her sınıf için web/mobil/desktop/backend durumu (bulgu var / arandı temiz / kapsam dışı).
   - **Bağımlılık denetimi çıktısı**: npm ve cargo, sayı ve en yükseği.
3. `severity: critical` bulgular MD raporun en üstünde ayrı bir bölümde, düzeltme sırası önerisiyle.

## Kapı

`00 §8` üç kontrol + :

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A3.findings.json');const s=f.surfaceCoverage.find(x=>x.surface.includes('api'));console.log('rota kapsami',s.unitsInspected+'/'+s.unitsTotal);const c=f.findings.filter(x=>x.severity==='critical');console.log('critical',c.length,c.map(x=>x.id).join(','))"
```

Rota kapsamı `228/228` değilse eksen bitmemiştir (elle okunmayan rotalar için yöntem `method` alanında açıkça yazılır: "statik guard taraması + 41 elle doğrulama").
