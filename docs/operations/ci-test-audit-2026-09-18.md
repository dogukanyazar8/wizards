# CI performansı ve test kapsamı — 18 Eylül 2026

## Kanıt sınırı

Bu rapor GitHub iş/step süreleri, indirilen CI logları, güncel workflow ve test seçicileri, coverage yapılandırması ve Playwright `--list` çıktıları üzerinden hazırlanmıştır. Bütün test fonksiyonlarının satır satır doğruluk incelemesi veya bütün testlerin yeniden çalıştırılması değildir. Dosya envanteri ve CI giriş noktalarının tamamı incelenmiş; kritik kapsamlar ve açıklar aşağıda ayrılmıştır.

- Dal: `codex/unified-release-center`; çalışma ağacında önceki release-center, overlay ve Krisp değişiklikleri de var.
- Uzak ölçüm SHA: `bef656997c204bceb177949d0d84c3190b225d8b`. Yerel envanter bu SHA üzerindeki mevcut çalışma ağacını içerir.
- [Gece CI 35319283851](https://github.com/dogukanyazar8/wizards/actions/runs/35319283851): 18 Eylül, `schedule`, başarısız.
- [Push CI 35237503907](https://github.com/dogukanyazar8/wizards/actions/runs/35237503907): 17 Eylül, aynı SHA, başarısız. Bu koşu için iş metadata'sı mevcut; loglar indirilemedi.
- Eski koşudaki test sayıları ve coverage yüzdeleri, yeni çalışma ağacının ölçümü değildir. Yerel Playwright keşfi testlerin çalıştığını kanıtlamaz.

## Uygulanan değişiklik

1. Eski tek `Verify` işi; statik kontroller/build, web test/coverage, mobil kalite ve secret scan olarak ayrıldı. E2E ve desktop artık bunların bitmesini beklemiyor.
2. `Verify` adı son başarı kapısında korundu. Bütün zorunlu işlerin `success` olması gerekir. Başarısızlık, iptal, eksik sonuç ve beklenmedik `skipped` kapıyı kapatır. Node 22 yalnız manuel koşuda zorunludur; diğer olaylarda mevcut koşulu nedeniyle atlanabilir.
3. Chromium API/smoke/realtime seçimleri olay başına tek çağrıda birleştirildi. Branch push için üç normal web build yerine bir build yapılır. Gerçek medya ayrı derleme bayrağı ve ayrı çağrıyla korunur. Firefox/WebKit, temiz seed ve Redis durumu için mevcut ayrı süreçlerini korur.
4. Gece ve manuel `full` Chromium koşuları iki runner'a ayrıldı. Her runner kendi PostgreSQL/Redis servislerini ve seed işlemini kullanır. `workers: 1`, `fullyParallel: false`, retry ve timeout değerleri korunur. Bir shard başarısız olsa da diğeri iptal edilmez.
5. `cargo-audit` binary'si Ubuntu sürümü, mimari ve sabit araç sürümüyle anahtarlanan ayrı cache'e alındı. Binary sürümü kontrol edilir; kurulum cache'i native build başlamadan kaydedilir. Advisory taraması her koşuda yeniden çalışır; başarılı tarama sonucu cache'lenmez.
6. Web `coverage-summary.json` dosyası 14 gün saklanır. Chromium raporları shard numarasıyla ayrılır; son upload adımı başarısızlıkta da denenir. Runner'ın zorla sonlandırıldığı job timeout durumunda artifact yüklenmesi garanti değildir.

Test kaldırılmadı, coverage eşiği düşürülmedi, test worker sayıları artırılmadı. Önceki Linux disk düzeltmesi korundu. Başarı kapısı yalnız `ci.yml` içindeki işleri toplar; ayrı Windows/native ve release workflow'larını kapsamaz.

Trade-off: paralel runner sayısı artar. Shard başına kurulum/build tekrarlanır; daha düşük duvar saati süresi mutlaka daha düşük fatura demek değildir. Yeni native build'in tamamlanma süresi henüz ölçülmedi. Önceki debug temizliği debug cache tekrar kullanımını azaltır; release çıktıları korunur.

## Gerçek süreler ve darboğazlar

| İş                   |               Push |               Gece | Önceki bağımlılık |
| -------------------- | -----------------: | -----------------: | ----------------- |
| Verify               |            24,1 dk |            43,5 dk | Başlangıç         |
| Desktop Ops          | 21,2 dk, başarısız | 25,5 dk, başarısız | Verify sonrası    |
| Chromium E2E         |  17,6 dk, başarılı |   60,3 dk, timeout | Verify sonrası    |
| Firefox/WebKit smoke |             9,2 dk |            10,7 dk | Verify sonrası    |
| Accessibility        |            12,2 dk |            11,6 dk | Verify sonrası    |
| Visual regression    |             5,7 dk |             5,5 dk | Verify sonrası    |
| TS6/TS7 uyumluluk    |             3,1 dk |             3,3 dk | Bağımsız          |
| Semgrep              |             1,0 dk |             0,9 dk | Bağımsız          |
| actionlint           |             0,2 dk |             0,2 dk | Bağımsız          |

Önceki toplam yaklaşık 46 dk push / 104 dk gece. Yeni yapı süreleri toplamak yerine bağımsız işlerin en uzununun bitmesini bekler; runner kotası/kuyruk süresi bu kazancı sınırlar. Yeni CI çalışmadan dakika veya yüzde hızlanma garantisi verilemez.

Gece `Verify` ayrıntıları: coverage 22 dk 30 sn; Gitleaks 7 dk 38 sn; mobile kalite 5 dk 26 sn; build 3 dk 47 sn; lint 1 dk 24 sn; typecheck 34 sn. pnpm kurulumu 17 sn. Bu nedenle bağımlılık kurulumunu optimize etmek öncelik değildi.

Desktop: cargo-audit 5 dk 41 sn (logda araç kaynak koddan derleniyor), Rust test derlemesi 4 dk 51 sn, optimize GLib testi 9 dk 45 sn, Clippy 3 dk 16 sn. Son native build üç saniyede linker hatasıyla durduğu için bu koşu başarılı desktop build süresini göstermez.

## CI test envanteri

Aşağıdaki dosya sayıları güncel `apps`, `packages`, `scripts` altındaki `.test.*` / `.spec.*` dosyalarının envanteridir. Toplam 1.482 JS/TS dosyası vardır; Rust vendor testleri bu toplamda yoktur. Dosya sayısı test vakası sayısı değildir. Alt klasör seçimleri `apps/web/scripts/run-node-tests.mjs`, package script'leri ve workflow komutlarıyla karşılaştırılmıştır.

| Katman                     | Güncel dosya / seçici                                                      | Son gece CI kanıtı                                              | Gerçek kapsam ve sınır                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Araç/workflow sözleşmeleri | 20 dosya; `scripts/quality/*.test.mjs`                                     | Eski 93/93; yeni odaklı koşu 101/101                            | Node/pnpm/TS sürümleri, hosted runner, workflow güvenliği, secret guard, format/lint araçları, yeni gate ve seçim sözleşmeleri. Ürün davranışı kanıtı değildir.                             |
| Web Node testleri          | 933 dosya; `src/**/*.test.ts`, `src/**/*.test.tsx`                         | 8.758 vaka; 8.749 pass, 9 skip, 0 fail                          | Route logic, servisler, reducer/hooks, React render ve kaynak sözleşmeleri. Çoğu DB/socket/provider bağımlılığını izole eder.                                                               |
| Web script testleri        | 28 dosya; 4 lint içinden + 10 CI browser/script dosyası doğrudan seçiliyor | Eski lint grubunda 23 test; eski browser grubunda 9 test        | Build/config ve izole tarayıcı regresyonları. Yeni Krisp dosyaları yerel workflow'a önceki işte eklenmişti. 14 dosya ana CI seçicisinde yok.                                                |
| Ortak types                | 37 dosya; `src/**/*.test.ts`                                               | 656/656                                                         | Zod/veri sözleşmeleri, sınırlar, normalizasyon ve geçersiz girişler.                                                                                                                        |
| Ortak UI                   | 2 dosya; `src/**/*.test.ts`                                                | 8/8                                                             | Ortak yardımcı/sözleşmeler; bütün ekranların görsel kabulü değildir.                                                                                                                        |
| DB paketi                  | 18 dosya; package `test` script'inde açık liste                            | Ana CI bu script'i çağırmıyor                                   | Prisma adaptörü, seed ve şema/index/migration sözleşmeleri. E2E migration uygulanması bu testlerin yerine geçmez.                                                                           |
| Mobile Node                | 238 `.test.ts`; `scripts/*.test.ts`                                        | 2.020 vaka; 2.019 pass, 1 platform skip                         | Auth/session, API/state, navigation, offline, update ve kalite/release sözleşmeleri. Native cihaz yürütmesi değildir.                                                                       |
| Mobile component           | 142 `.test.tsx`; `component-tests/**/*.test.tsx`                           | 142 suite, 1.382/1.382 vaka                                     | Jest + React Native Testing Library; etkileşim ve render. Native modüller için test doubles kullanılır.                                                                                     |
| Mobile release scripts     | 2 `.test.mjs`                                                              | Ana CI dışında; manuel mobile-release içinde seçiliyor          | OTA yayınlama, immutable artifact ve workflow sözleşmeleri.                                                                                                                                 |
| Desktop scripts            | 19 `.test.mjs`; `scripts/*.test.mjs`                                       | 123 vaka; 121 pass, 2 platform skip                             | Manifest/signing/publication, ölçüm ve Tauri komut sözleşmeleri.                                                                                                                            |
| Desktop Rust               | 10 birinci taraf Rust test dosyası; güncel 65 test attribute'u             | 56 unit + 2 GLib integration; ayrıca 2 optimize GLib testi pass | URL/media/notification/window/tray/overlay politikaları. Güncel sayı önceki overlay WIP'ini de içerir. UI/native sürücü kabulü değildir.                                                    |
| Ortak release publisher    | `scripts/releases/publish-release.test.mjs`                                | Yalnız release workflow'larında                                 | Yayınlama protokolü ve hata davranışı; ana CI'da çağrılmıyor.                                                                                                                               |
| E2E                        | 41 ürün spec dosyası + 1 local-quality-dashboard spec                      | Aşağıdaki tablolar                                              | Ürün testlerinde browser + gerçek disposable PostgreSQL/Redis; local-quality-dashboard spec ana CI dışında. Dış sağlayıcılar/normal ses kanalı bazı senaryolarda test sağlayıcısı kullanır. |

Web 933 dosyasının dağılımı: `app` 166 (156 API), `components` 221, `lib` 523, `hooks` 19, kalan kök/store/scripts 4. Kritik alt kapsamlar: auth 50, voice 40, socket 20, workspace 38, servers 35, DM 32, events 19, release 11; settings component 59, messages 31, admin 15.

Kaynak okuyan test dosyaları için basit tarama: web source 118/933, mobile scripts 68/240, mobile component 5/142. Bu bir kalite puanı değildir; aynı dosya hem kaynak sözleşmesi hem runtime assertion içerebilir. Salt regex/snapshot doğrulaması runtime davranış kanıtı olarak sunulmamalıdır.

## Playwright kapsamı ve çalıştırma sıklığı

Güncel Chromium discovery 557 vaka: shard 1 = 299, shard 2 = 258. İki ID kümesinin birleşimi tam kümeye eşit; kesişimleri boş. Dosya bazlı bölme süreleri eşitlemez; serial test grupları korunur. Gerçek medya ayrı projedir ve 557'ye dahil değildir.

| Aile                 | Discovery vaka sayısı | Kontrol edilen davranış                                                        |
| -------------------- | --------------------: | ------------------------------------------------------------------------------ |
| design               |                   295 | Home/messages/server/settings/splash parity, tema ve viewport matrisi          |
| a11y                 |                    50 | Login, home, messages, server için axe WCAG ve erişilebilir etkileşimler       |
| api                  |                    43 | Kimlik, yetki, mesaj kapsamı, giriş sınırları, home güvenliği                  |
| settings             |                    26 | Ayar yüzeyleri, bildirim paneli, kalıcılık, 2FA                                |
| voice                |                    22 | Normal test sağlayıcısıyla ses/ekran paylaşım UI ve durumları; native PiP skip |
| discover             |                    19 | Arama/kategori/sayaç ve kart davranışı                                         |
| auth                 |                    18 | Login/register/password-reset parity                                           |
| smoke                |                    17 | App shell, login/logout, DM, mesaj, server                                     |
| mobile               |                    16 | Web responsive yüzeyi; native Android/iOS değildir                             |
| message-interactions |                    11 | Reaction, edit/delete/reply, profil, emoji, arama/thread                       |
| events               |                     9 | Etkinlik akışları                                                              |
| mentions             |                     8 | Mention bağlamı, ayarlar, akış ve performans assertion'ları                    |
| messages             |                     8 | Profil paneli/menu ve viewport durumları                                       |
| attachments          |                     6 | Ek dosya UI/akışları                                                           |
| realtime             |                     5 | Çok kullanıcılı mesajlaşma ve üyelik senaryoları                               |
| visual               |                     4 | Sabit screenshot baseline karşılaştırmaları                                    |

| Olay              | Normal Chromium seçimi                                         | Gerçek medya             | Diğer browser işleri               |
| ----------------- | -------------------------------------------------------------- | ------------------------ | ---------------------------------- |
| PR                | API + smoke = 60 keşfedilen vaka; tek çağrı                    | Yok                      | Firefox/WebKit smoke, a11y, visual |
| Branch push       | API + smoke + realtime + voice = 87; tek çağrı                 | Bir çağrı                | Aynı                               |
| Manuel `api`      | API = 43                                                       | Yok                      | Aynı                               |
| Manuel `smoke`    | API + smoke = 60                                               | Yok                      | Aynı                               |
| Manuel `realtime` | API + realtime + voice = 70                                    | Bir çağrı                | Aynı                               |
| Manuel `full`     | 557, iki shard                                                 | Önceki davranış gibi yok | Aynı                               |
| Gece              | 557, iki shard                                                 | Yalnız shard 1           | Aynı                               |
| `v*` tag push     | Ana Chromium seçim adımları mevcut koşullar nedeniyle çalışmaz | Yok                      | Diğer browser işleri yine çalışır  |

Bu değerler seçim sayılarıdır; runtime skip/retry ile pass sayısından farklı olabilir. Tag davranışı değiştirilmedi; release için güvence bekleniyorsa ayrıca ele alınmalıdır. Normal suite birleştirmesi, tam suite'in mevcut paylaşılan seed modelini kullanır; runtime sıra bağımlılığı yeni Linux koşusunda doğrulanmalıdır.

Son gece: Firefox 17 pass, WebKit 17 pass, a11y 50 pass, visual 4 pass, gerçek medya 7 pass. Tam Chromium suite tamamlanmadı. Normal voice testlerinin geçmesi gerçek mikrofon, Krisp, WebView2 overlay veya OS PiP'nin çalıştığını kanıtlamaz.

## Coverage: eşik ve ölçüm farklıdır

Kaynak: `apps/web/src/lib/e2e/coverage.ts`, `scripts/run-coverage.ts`, son gece logundaki c8 `All files` satırı.

| Metrik     | Mevcut zorunlu eşik | Son gece ölçümü |
| ---------- | ------------------: | --------------: |
| Lines      |                 %23 |          %65,97 |
| Branches   |                 %67 |          %83,60 |
| Functions  |                 %51 |          %69,01 |
| Statements |       Ayrı eşik yok |          %65,97 |

`c8 --all` bütün web `src/**/*.ts` ve `src/**/*.tsx` dosyalarını hedefler; test dosyaları hariçtir. V8 raporları async birleştirilir, rapor heap sınırı 4 GiB'dır. Global eşik vardır; dosya başına eşik yoktur. `WEB_COVERAGE_API_E2E=0` nedeniyle CI coverage hesabı API E2E server yürütmelerini birleştirmez. Web scripts/browser, mobile, shared packages ve Rust için bu sayı kullanılamaz. Ayrı mobile/Rust coverage eşiği yoktur; bunlara “%0 coverage” demek yanlış olur.

Ölçülen satır kapsamından örnekler (yalnız ilgili dizindeki dosyalar; alt dizinlerin toplamı gibi yorumlanmamalı):

| Alan                                    |  Lines | Değerlendirme                                                                   |
| --------------------------------------- | -----: | ------------------------------------------------------------------------------- |
| `src/lib/security`                      | %92,35 | Güçlü izole coverage; saldırı yüzeyinin tamamı için güvenlik garantisi değildir |
| `src/lib/voice`                         | %79,47 | Ses politika/durum kodu; cihaz pipeline'ını ölçmez                              |
| `src/lib/auth`                          | %72,71 | Kimlik servisleri; browser/external OAuth ayrı                                  |
| `src/lib/releases`                      | %72,50 | Eski SHA; yeni publication servisinin kapsamı bu sayıya dahil değil             |
| `src/lib/socket`                        | %63,18 | Realtime için kalan hata/senkronizasyon yolları incelenmeli                     |
| `src/components/settings`               | %55,55 | Etkileşim seviyesinde ek test değeri var                                        |
| `src/components/voice`                  |  %5,09 | Node coverage düşük; var olan E2E yürütmesi bu hesaba dahil değil               |
| `src/app/api/v1/mobile/auth/two-factor` |     %0 | Ölçülen route katmanında yürütme yok; servis testleriyle karıştırılmamalı       |

Öneri: birkaç başarılı tam koşudan sonra önce satır/fonksiyon eşiklerini ölçüme yaklaştırmak; sonra auth, permissions ve publication gibi kritik yolları odaklı artırmak. Yüzdeleri bütün projeye eşit dağıtmak veya kaynak satırını sadece çalıştıran testler eklemek kaliteyi garanti etmez. Bu işte eşikler değiştirilmedi.

## Additional observations

| Öncelik | Kanıt / bağlam                                                                                                                                          | Etki ve sonraki adım                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| medium  | Gece full E2E: 16 ayrı testte 46 başarısız deneme; ardından timeout                                                                                     | Paralelleştirme hataları düzeltmez. Retry azaltarak/timeout artırarak gizlenmemeli. İzole tekrar ve trace incelemesi gerekir.                              |
| medium  | `packages/db/package.json` içindeki 18 test dosyası; `ci.yml` içinde `@wizards/db test` yok                                                             | Şema/seed/index sözleşmeleri ana CI güvencesi dışında. Ayrı disposable test gerektirenleri ayırarak mevcut kaliteli kontrollerin CI'a bağlanması önerilir. |
| medium  | Aşağıdaki 14 web script testi ana CI seçicilerinde yok                                                                                                  | Dosyanın repoda bulunması regresyon koruması sağlamıyor. İzole browser testleri ve DB testleri farklı ortamlarla bağlanmalı.                               |
| medium  | `publication-service.integration.test.ts`: `RELEASE_TEST_DATABASE_URL` yoksa skip; `polls/service.test.ts`: `WHISPR_PHASE2_DB_CONCURRENCY=1` yoksa skip | Yayınlama atomicity/idempotency/race ve gerçek DB concurrency kanıtı rutin CI'da eksik. Guard'ları kaldırmadan ayrı disposable DB işi gerekir.             |
| medium  | `email-change-postgres.test.ts`: yalnız `email_change_disposable` ve açık opt-in                                                                        | Test doğru biçimde canlı DB'den korunmuş; ana CI çağırmıyor. Gerçek DB davranışı izole mock testlerinin ötesinde doğrulanmalı.                             |
| medium  | Mobile `release:check` ölçümü zorunlu kılan `--require-measurements` olmadan çalışıyor                                                                  | Kalite metadata'sı cihaz performans ölçümü değildir. Cold start/RAM/frame bütçeleri gerçek cihaz kanıtı olmadan doğrulanmış sayılmaz.                      |
| medium  | Linux desktop script suite'de iki Windows/PowerShell vaka skip; Windows native workflow yalnız build/exe varlığı kontrol ediyor                         | Windows runtime, overlay/voice mini, Krisp ve PiP için cihaz/OS kabulü gerekir. İmzalı release testi ile normal PR testi aynı şey değildir.                |
| medium  | Mobile device nightly, committed UAT görsel kanıtını denetliyor; capture/emulator başlatmıyor                                                           | Gece işi geçse bile o gece native app'in gerçekten açıldığı anlamına gelmez.                                                                               |
| minor   | `test:toolchain` hem static quality hem TS compatibility içinde çalışıyor                                                                               | Yaklaşık birkaç saniyelik tekrar; öncelikli darboğaz değil, korundu.                                                                                       |
| minor   | C8 baseline ile gerçek ölçüm arasında büyük fark; dosya başına gate yok                                                                                 | Kritik yeni dosyalar global ortalamaya saklanabilir. Sonraki adım kontrollü coverage ratchet.                                                              |
| minor   | Chromium full, ayrı a11y/visual job'larının testlerini de içeriyor                                                                                      | Bilinçli kapsam tekrarı var. Tam suite tanımını değiştirmeden korunmuştur.                                                                                 |

Full E2E başarısız denemelerinin dağılımı: `auth/auth-parity.spec.ts` 12, `design/server-parity.spec.ts` 24, `design/splash-parity.spec.ts` 3, `discover/discover.spec.ts` 3, `mentions/mentions.spec.ts` 3, `messages/messages-profile-state.spec.ts` 1. Bunlar final failure toplamı değil, retry dahil denemelerdir. Auth logunda ayrıca `RESEND_FROM_EMAIL or RESEND_FROM is required for password reset.` görülür. Bu, o akışın test ortamı bağımlılığına işaret eder; bütün hataların tek kök nedeni olduğu kanıtlanmadı.

Ana CI'da doğrudan seçilmeyen web script dosyaları (`apps/web/scripts/` altında):

- `admin-release-center-browser.test.mjs`
- `admin-downloads-browser.test.mjs`
- `desktop-companion-surfaces-browser.test.mjs`
- `desktop-media-consent-browser.test.mjs`
- `discover-server-cards-browser.test.mjs`
- `tailwind-v4-pipeline.test.mjs`
- `settings-version-browser.test.mjs`
- `settings-save-feedback-browser.test.mjs`
- `settings-password-browser.test.mjs`
- `pinned-messages-browser.test.mjs`
- `overlay-layout-browser.test.mjs`
- `invite-qr-browser.test.mjs`
- `focus-appearance-browser.test.mjs`
- `email-change-postgres.test.ts`

Platform ve çevre nedeniyle bilinçli atlamalar da var: native PiP, iki mobile web popup vakası, Redis yokluğunda bazı auth/2FA vakaları, seed'de online friend/notification bulunmayan senaryolar. Önceki Node suite'de 9 skip raporlanıyor; logdaki altı game-activity skip'i ve DB concurrency opt-in gibi koşulların tamamı tek bir sayısal coverage yüzdesinden anlaşılamaz.

## Diğer workflow'lar

- `desktop-native-build.yml`: desktop/toolchain path değişikliklerinde PR/push ve manuel Windows build; unsigned exe üretimi doğrulanır. Linux test suite'inin yerine geçmez.
- `desktop-release.yml`: manuel, korumalı publication; release contract ve desktop script testleri, audit/build/signing/artifact doğrulamaları. Ürün E2E suite'inin tamamını çalıştırmaz.
- `mobile-release.yml`: manuel release; ortak publisher ve iki mobile `.mjs` testi, OTA/APK checksum/imza/immutable yayın kontrolleri. Native ekran/cihaz testi yerine geçmez.
- `screen-share-network-nightly.yml`: izole PostgreSQL/Redis/LiveKit ile netem altında gerçek medya testleri. Native desktop/mobil cihaz matrisi değildir.
- `mobile-redesign-device-gate-nightly.yml`: depodaki UAT capture kanıtını değerlendirir; yeni cihaz capture üretmez.

Bu rapor bu ek workflow'ların güncel yürütme sonucunu doğrulamaz; kaynak yapılandırmasını değerlendirir.

## Doğrulama

- Yeni execution sözleşmeleri: önce 5 beklenen hata, sonra 5 pass. Gate testleri her zorunlu iş için failure/cancelled/skipped/missing sonuçlarını reddeder; manuel olmayan Node 22 skip'ini kabul eder.
- `pnpm test:toolchain`: 101/101 pass.
- E2E governance + coverage sözleşmeleri: 27/27 pass. Coverage testinde gerçek c8 birleştirme ve eşik ihlali davranışı sınanır.
- Playwright real-media config sözleşmeleri: 7/7 pass.
- Mobil CI/device-evidence sözleşmeleri: 4/4 pass. Değişen web governance dosyasında ESLint pass.
- Chromium keşfi: 557 = 299 + 258; eksiksiz ve çakışmasız ID kümeleri. Birleşik push seçimi 87; eski ailelerin birleşimine eşit.
- actionlint, hedefli Prettier ve diff whitespace kontrolleri uygulanır.
- Yeni Linux CI, gerçek browser E2E yürütmesi, full web coverage, native build ve cihaz kabulü bu değişikliklerle henüz çalıştırılmadı. Commit/push/deploy yapılmadı.

Uygulama yaklaşımı standart [GitHub job bağımlılıkları](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs) ve [Playwright dosya bazlı sharding](https://playwright.dev/docs/test-sharding) kullanır; yeni orkestrasyon servisi veya bağımlılık eklenmedi.
