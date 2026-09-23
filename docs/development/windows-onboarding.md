# Whispr Windows geliştirme ve CI/CD onboarding rehberi

Bu rehber, yeni bir Windows bilgisayarda Whispr monorepo'sunu sıfırdan kurup web, backend, Android mobile ve Windows desktop geliştirmesine güvenli biçimde devam etmek içindir. CI/CD erişimleri, release sınırları, doğrulama kapıları ve sık hata nedenleri de kapsanır.

Komutlar PowerShell içindir. Komutları repository kökünde çalıştırın; başka dizin gerektiğinde adım açıkça söyler.

## 1. Başarı tanımı

Onboarding ancak aşağıdaki kanıtlar ayrı ayrı elde edildiğinde tamamdır:

1. Git clone ve paket kurulumu hatasız biter.
2. Node ve pnpm sürümleri repository sözleşmesiyle aynıdır.
3. PostgreSQL ve Redis hazırdır.
4. Prisma Client üretilir, migration uygulanır.
5. Web `/health` ve `/ready` uçları HTTP 200 döndürür.
6. Web login, bir gerçek veya açıkça yerel test hesabıyla çalışır.
7. Playwright E2E preflight ve en az smoke suite geçer.
8. Android development build emulator veya test cihazına kurulur.
9. Mobile Metro/Fast Refresh çalışır.
10. Desktop Tauri dev kabuğu yerel web'i açar.
11. Platforma özel test/typecheck/build kapıları geçer.
12. GitHub required checks, deployment ve gerçek cihaz kabulü ayrıca doğrulanır.

Yerel başarı; remote CI, Railway deployment, EAS teslimi, Windows imzalama, updater veya cihaz/store kabulü anlamına gelmez.

## 2. Mimari ve portlar

| Yüzey             | Yer                  | Süreç                                 | Varsayılan port            |
| ----------------- | -------------------- | ------------------------------------- | -------------------------- |
| Web/API/Socket.IO | `apps/web`           | Next.js custom HTTP server            | `3000`                     |
| Outbox worker     | `apps/web`           | Web içinde veya ayrı headless worker  | Port açmaz                 |
| PostgreSQL        | `docker-compose.yml` | `postgres:18.6-alpine` (digest pinli) | `5432`                     |
| Redis             | `docker-compose.yml` | `redis:8.10.2-alpine` (digest pinli)  | `6379`                     |
| ClamAV            | `docker-compose.yml` | Attachment malware scanner            | `3310`                     |
| LiveKit           | `docker-compose.yml` | Voice/video server                    | `7880`, `7881`, `7882/udp` |
| Mobile Metro      | `apps/mobile`        | Expo dev server                       | `8081`                     |
| Desktop           | `apps/desktop`       | Tauri 2 kabuğu                        | Ayrı backend yok           |

Desktop mevcut web origin'ini yükler. Mobile aynı web API'lerini kullanır. PostgreSQL, Redis, auth ve provider secret'ları desktop veya mobile paketine gömülmez.

## 3. Erişim ve hesaplar

Kurulumdan önce erişim sahibinden gerekli rolü alın. Secret istemek ile secret'ı chat/e-posta üzerinden almak aynı şey değildir; secret'lar yalnız onaylı secret manager veya ilgili platformun güvenli akışıyla sağlanmalıdır.

| Sistem             | Temel geliştirme                 | Özellik geliştirme                                             | Release/deploy                          |
| ------------------ | -------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| GitHub             | Repo read, PR/check görünümü     | Branch push                                                    | Environment approval, Actions yönetimi  |
| Railway            | Gerekmez; full local yeterli     | UAT log/read gerekebilir                                       | UAT/production deploy ve variables      |
| Expo/EAS           | Android local için gerekmez      | UAT cloud build                                                | Project role, credentials, store submit |
| Firebase           | Push dışı geliştirmede gerekmez  | Android app config                                             | FCM V1 credential yönetimi              |
| Google Cloud       | OAuth dışı geliştirmede gerekmez | Android/Web OAuth client görünümü                              | Client ve SHA-1 yönetimi                |
| Sentry             | Gerekmez                         | UAT hata inceleme                                              | Project/release yönetimi                |
| Cloudflare R2      | Gerekmez                         | Gerekmez                                                       | Desktop updater yayınlama               |
| Apple/Google store | Gerekmez                         | Gerekmez                                                       | Submit ve release rollout               |
| Provider'lar       | Gerekmez                         | UploadThing, Giphy, Resend, Turnstile, LiveKit özelliğine göre | Production secret yönetimi              |

GitHub organizasyonu SSO kullanıyorsa üyelik ve Git Credential Manager yetkisi birlikte doğrulanmalıdır.

## 4. Önerilen bilgisayar

Repository'nin zorunlu donanım sözleşmesi yoktur. Web + Docker + Android emulator + Rust build birlikte çalıştırılacaksa pratik alt sınır:

- Windows 11 x64, güncel güvenlik yamaları.
- 16 GB RAM alt sınır; 32 GB önerilir.
- En az 60 GB boş SSD alanı.
- BIOS/UEFI sanallaştırma açık.
- Windows Hypervisor Platform veya Android Emulator hypervisor desteği.
- Kısa, yerel NTFS çalışma yolu; OneDrive/senkronize klasör kullanmayın.

Önerilen clone yolu: `C:\src\wizards`. Android UAT scripti native build için ayrıca `C:\wm` kullanır.

## 5. Zorunlu araçlar

### 5.1 Git

[Git for Windows](https://git-scm.com/install/windows.html) kurun:

```powershell
winget install --id Git.Git -e --source winget
git --version
```

Kurulumdan sonra yeni terminal açın. Git Credential Manager'ı etkin bırakın.

### 5.2 Node.js ve Corepack

Repository sürümü:

- `.nvmrc`: `26.10.0`
- `package.json` engine: `>=26.10.0 <27`
- `package.json` packageManager: `pnpm@12.5.1`

Tam sürümü [Node.js 26.10.0 resmi release sayfasından](https://nodejs.org/en/blog/release/v26.10.0) kurun. Winget'in güncel LTS sürümünü körlemesine kullanmayın; zamanla repository aralığının dışına çıkabilir.

```powershell
node --version
corepack enable
corepack pnpm --version
```

Beklenen:

```text
v26.10.0
12.5.1
```

`corepack enable` için erişim reddedilirse yalnız bu adımı yönetici PowerShell'de bir kez çalıştırın; günlük geliştirmeyi yönetici terminalinde yapmayın.

### 5.3 Docker Desktop ve WSL 2

[Docker Desktop Windows kurulum rehberindeki](https://docs.docker.com/desktop/setup/install/windows-install/) WSL 2 ve sanallaştırma önkoşullarını tamamlayın.

```powershell
wsl --status
winget install -e --id Docker.DockerDesktop
```

Gerekirse Windows'u yeniden başlatın, Docker Desktop'ı açın ve şu kapıları doğrulayın:

```powershell
docker version
docker compose version
docker run --rm hello-world
```

Şirketinizin Docker Desktop lisans politikasını ayrıca izleyin.

### 5.4 JDK 17 ve Android Studio

Whispr Android sözleşmesi JDK 17 kullanır.

```powershell
winget install -e --id Microsoft.OpenJDK.17
winget install -e --id Google.AndroidStudio
```

Android Studio > SDK Manager içinde kurun:

- Android SDK Platform 36
- Android SDK Build-Tools 36.0.0
- Android SDK Platform-Tools
- Android Emulator
- Android SDK Command-line Tools (latest)
- NDK (Side by side) 27.1.12297006
- CMake 3.22.1, mevcut doğrulanmış Windows baseline
- En az bir x86_64 Android 36 emulator system image

Whispr'ın mevcut React Native sözleşmesi min SDK 24, compile/target SDK 36'dır. Expo/React Native sürümü değişirse generated Gradle katalogları yeni kaynak gerçek olur.

User environment variables:

| Ad             | Değer                        |
| -------------- | ---------------------------- |
| `JAVA_HOME`    | Kurulu JDK 17 dizini         |
| `ANDROID_HOME` | `%LOCALAPPDATA%\Android\Sdk` |

User `Path` girdileri:

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
%ANDROID_HOME%\cmdline-tools\latest\bin
%JAVA_HOME%\bin
```

Yeni terminal açıp doğrulayın:

```powershell
java -version
adb version
sdkmanager --version
```

`java -version` çıktısı 17 göstermelidir.

### 5.5 Rust, MSVC ve WebView2

[Tauri 2 Windows prerequisites](https://v2.tauri.app/start/prerequisites/) izlenmelidir:

1. Visual Studio 2022 Build Tools kurun.
2. Visual Studio Installer'da **Desktop development with C++** workload'unu seçin.
3. MSVC v143 ve Windows 10/11 SDK bileşenlerini kurun.
4. Microsoft Edge WebView2 Runtime'ın kurulu olduğunu doğrulayın.
5. Rustup ile MSVC toolchain kurun.

```powershell
winget install --id Rustlang.Rustup -e
rustup default stable-x86_64-pc-windows-msvc
rustc --version
cargo --version
rustup show active-toolchain
```

Repository Rust patch sürümünü pinlemiyor; CI `stable` kullanır. Toolchain adı `stable-x86_64-pc-windows-msvc` olmalıdır.

`cl.exe` yalnız Visual Studio Developer PowerShell'de PATH üzerinde olabilir. Tauri build MSVC bulamıyorsa önce **Developer PowerShell for VS 2022** ile deneyin.

### 5.6 İsteğe bağlı araçlar

- GitHub CLI: Actions/PR inceleme ve yetki tanısı.
- Maestro: mobile device flow'ları; kurumsal kurulum standardı varsa onu kullanın.
- Graphify: repository haritasını güncellemek için. Uygulama build bağımlılığı değildir; `AGENTS.md` tabanlı geliştirme akışında değişiklik sonrası `graphify update .` gerekir.

## 6. Clone ve monorepo bootstrap

### 6.1 Repo'yu çekme

```powershell
New-Item -ItemType Directory -Force C:\src | Out-Null
Set-Location C:\src
git clone https://github.com/dogukanyazar8/wizards.git
Set-Location .\wizards
git remote -v
git status --short --branch
```

Private repo erişim ekranı açılırsa Git Credential Manager ile yetkili GitHub hesabını kullanın.

### 6.2 Doğru branch

Clone varsayılan remote branch'i `main` olabilir. Görev hedefini açıkça seçin:

- `main`: stable kaynak.
- `staging`: workflow tarafından dinlenir; remote branch gerçekten varsa integration hedefi olarak kullanılır.
- `uat`: UAT kabul akışı.

Branch promotion ve required-check kuralları repository dosyalarında tam tanımlı değildir; GitHub branch protection ekranı güncel gerçektir.

Mevcut remote branch'leri önce görün:

```powershell
git fetch --prune origin
git branch -r
```

Örnek UAT feature branch:

```powershell
git fetch --prune origin
git switch uat
git pull --ff-only origin uat
git switch -c feature/WHISPR-123-kisa-konu
```

Ekibin branch adlandırma standardı farklıysa onu kullanın. Paylaşılan branch'e doğrudan push etmeyin.

### 6.3 Toolchain ve paketler

```powershell
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm test:toolchain
corepack pnpm db:generate
```

`--frozen-lockfile` başarısızsa önce Node/pnpm sürümlerini ve temiz clone durumunu inceleyin. Lockfile'ı sırf kurulumu geçirmek için yeniden üretmeyin.

## 7. Ortam değişkenleri

### 7.1 Mevcut env yükleme gerçeği

Repository şu anda tek env konumunu standardize etmez:

- Web dev süreci çalışma dizinindeki `apps/web/.env` dosyasını yükler.
- Bazı yardımcılar kök, `apps/web` ve `packages/db` env konumlarını arar.
- Prisma CLI için `DATABASE_URL` açıkça process environment'ta olmalıdır.
- Desktop runner dotenv yüklemez; yalnız PowerShell process environment okur.
- Expo `apps/mobile/.env.local` içindeki `EXPO_PUBLIC_*` değerlerini yükleyebilir.

Fresh clone baseline:

```powershell
Copy-Item .env.example .env
Copy-Item .env.example apps/web/.env
Copy-Item .env.example packages/db/.env
```

Bu kopyalar git-ignore edilmelidir:

```powershell
git status --short --ignored .env apps/web/.env packages/db/.env
```

Beklenen: dosyalar ignored görünür; tracked veya untracked normal dosya görünmez.

Üç dosyada temel yerel değerleri aynı tutun. Bu tekrar mevcut repository sınırlamasıdır; otomatik secret senkronizasyonu yoktur.

### 7.2 Temel local değerler

```dotenv
DATABASE_URL=postgresql://wizards:wizards@localhost:5432/wizards
E2E_DATABASE_URL=postgresql://wizards:wizards@localhost:5432/wizards_e2e
REDIS_URL=redis://localhost:6379
PORT=3000
APP_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
SOCKET_ALLOWED_ORIGINS=http://localhost:3000
SOCKET_ALLOW_EMPTY_ORIGIN=false
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
LIVEKIT_URL=ws://localhost:7880
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_NODE_IP=127.0.0.1
```

Rastgele auth secret üretin:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Çıktının aynısını yalnız local env dosyalarında iki alana yazın:

```dotenv
AUTH_SECRET=uretilen-ayni-deger
NEXTAUTH_SECRET=uretilen-ayni-deger
```

Gerçek secret'ı terminal geçmişine, issue'ya, PR açıklamasına veya dokümana yapıştırmayın.

### 7.3 İsteğe bağlı provider alanları

| Özellik          | Env adları                                                         |
| ---------------- | ------------------------------------------------------------------ |
| GitHub OAuth     | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` veya Auth.js alias'ları |
| Google web OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` veya Auth.js alias'ları |
| E-posta          | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM`               |
| Bot koruması     | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`           |
| Upload           | `UPLOADTHING_TOKEN`                                                |
| GIF              | `GIPHY_API_KEY`                                                    |
| Observability    | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, sampling/release alanları  |
| Attachment scan  | `CLAMAV_HOST`, `CLAMAV_PORT`, timeout ve max-byte alanları         |
| Outbox           | `WHISPR_OUTBOX_WORKER`, batch/interval/shutdown alanları           |
| Proxy/IP         | `TRUSTED_PROXY_HOPS` (sabit `X-Forwarded-For` hop sayısı)          |

Provider yoksa ilgili özelliğin degrade/fail davranışını test edin; üretim validation'ını devre dışı bırakmayın.

### 7.4 Production zorunlu web alanları

Production web en az şunları ister:

- `AUTH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- `APP_URL`
- `NEXTAUTH_URL`
- `SOCKET_ALLOWED_ORIGINS`

`AUTH_SECRET` ve `NEXTAUTH_SECRET` birlikte verilirse aynı olmalıdır. Production'da `SOCKET_ALLOW_EMPTY_ORIGIN=true` geçersizdir.

Ayrı production outbox worker en az `DATABASE_URL` ve `REDIS_URL` ister. Web-only secret'ları worker'a gereksiz taşımayın.

## 8. Yerel altyapı ve veritabanı

### 8.1 Minimum servisler

```powershell
docker compose up -d postgres redis
docker compose ps
docker compose exec -T postgres pg_isready -U wizards -d wizards
docker compose exec -T redis redis-cli ping
```

Beklenen:

```text
accepting connections
PONG
```

Attachment ve voice geliştirecekseniz:

```powershell
docker compose up -d clamav livekit
docker compose ps
```

ClamAV ilk açılışta imza indirebilir; hazır olması PostgreSQL/Redis'ten uzun sürebilir.

PostgreSQL 16 local volume'u varsa Compose'u açmadan önce [container runtime transition](../operations/container-runtime-transition.md) içindeki dump/restore yolunu uygulayın. Eski `postgres_data` volume'u PostgreSQL 18'e bağlanmaz.

### 8.2 Prisma

Prisma config'in kod içi fallback'i `postgres/postgres` kullanır; Docker Compose `wizards/wizards` kullanır. Fallback'e güvenmeyin:

```powershell
$env:DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards"
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/db db:migrate:deploy
```

Schema değişikliği geliştirecekseniz yalnız local DB üzerinde migration üretin:

```powershell
$env:DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards"
corepack pnpm --filter @wizards/db exec prisma migrate dev --schema prisma/schema.prisma --name aciklayici_ad
```

`prisma db push` komutunu paylaşılan UAT veya production DB'de kullanmayın.

### 8.3 İsteğe bağlı demo seed

Seed parolasını açıkça verin:

```powershell
$env:DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards"
$env:SEED_DEMO_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(18).toString('base64url'))"
corepack pnpm --filter @wizards/db db:seed
```

Başarı: `Seed complete`.

Seed yalnız local/test DB içindir. `ALLOW_PRODUCTION_SEED` korumasını aşmayın. Varsayılan demo parolaya güvenmeyin.

## 9. Web geliştirme

### 9.1 Başlatma

Terminal 1:

```powershell
Set-Location C:\src\wizards
$env:DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards"
corepack pnpm --filter @wizards/web dev
```

Beklenen:

```text
Server running on http://localhost:3000
```

Terminal 2:

```powershell
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/ready
```

`/health` proses canlılığını; `/ready` PostgreSQL ve Redis hazırlığını gösterir. `/ready` 503 ise logdaki dependency sonucunu çözmeden deployment sağlıklı sayılmaz.

Web custom server aynı HTTP sunucusunda Next.js, API ve Socket.IO çalıştırır. Development'ta outbox worker varsayılan olarak aynı proses içinde başlar.

### 9.2 Ayrı outbox worker

Yerelde web ve worker süreçlerini ayırmak için önce worker server artifact'ini üretin:

```powershell
corepack pnpm --filter @wizards/web build:server
```

Web terminali:

```powershell
$env:WHISPR_OUTBOX_WORKER = "false"
corepack pnpm --filter @wizards/web dev
```

Worker terminali:

```powershell
$env:WHISPR_OUTBOX_WORKER = "true"
corepack pnpm --filter @wizards/web start:outbox-worker
```

Başarı logu: `Whispr outbox worker started.`. Fresh clone'da `start:outbox-worker` öncesi `build:server` zorunludur.

`build:server` headless worker artifact'i için yeterlidir; Next.js `.next` çıktısı üretmez ve tek başına web `start` için yeterli değildir.

Compiled production web'i de sınamak için production zorunlu env alanlarını sağlayıp tam build alın:

```powershell
corepack pnpm --filter @wizards/web build
$env:NODE_ENV = "production"
$env:WHISPR_OUTBOX_WORKER = "false"
corepack pnpm --filter @wizards/web start
```

## 10. Web E2E

[Playwright browser kurulumu](https://playwright.dev/docs/browsers) işletim sistemi binary'lerinden ayrıdır.

### 10.1 İzole E2E DB

`.env.example` yerel DB adı `wizards_e2e` kullanır. CI kendi izole container'ında `whispr_e2e` kullanır. İsim farklı olabilir; `E2E_DATABASE_URL` ile oluşturulan DB adı aynı olmalıdır.

```powershell
$exists = docker compose exec -T postgres psql -U wizards -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='wizards_e2e'"
if ($exists.Trim() -ne "1") {
  docker compose exec -T postgres createdb -U wizards wizards_e2e
}
```

E2E shell environment'ı vermeden önce normal web dev server'ı durdurun. Playwright development'ta açık portu yeniden kullanabilir; bu durumda test route'u ve DB yanlış olur:

```powershell
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw "Port 3000 dolu. Normal web dev server'ini durdurun; Playwright E2E server'i bu shell env'iyle baslatmalidir."
}

$env:E2E_TEST_MODE = "true"
$env:NEXT_PUBLIC_E2E_TEST_MODE = "true"
$env:E2E_BASE_URL = "http://127.0.0.1:3000"
$env:E2E_DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards_e2e"
$env:DATABASE_URL = $env:E2E_DATABASE_URL
$env:REDIS_URL = "redis://localhost:6379"
$env:E2E_TEST_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))"
```

E2E DB yalnız test verisi içermelidir. Aşağıdaki `db push` komutu shared veya production DB için değildir:

```powershell
corepack pnpm --filter @wizards/db db:migrate:deploy
corepack pnpm --filter @wizards/web exec playwright install chromium
corepack pnpm --filter @wizards/web e2e:check-env
corepack pnpm --filter @wizards/web e2e:seed
corepack pnpm --filter @wizards/web e2e:smoke
```

Başarı sinyalleri:

- `E2E environment preflight passed.`
- `E2E database reset and seed completed.`
- Playwright exit code 0.

Diğer suite'ler:

```powershell
corepack pnpm --filter @wizards/web e2e:api
corepack pnpm --filter @wizards/web e2e:realtime
corepack pnpm --filter @wizards/web e2e:a11y
corepack pnpm --filter @wizards/web e2e
```

Cross-browser için:

```powershell
corepack pnpm --filter @wizards/web exec playwright install firefox webkit
corepack pnpm --filter @wizards/web e2e:smoke:cross-browser
```

Visual snapshot baseline'ını Windows'ta güncellemeyin. `apps/web/e2e/README.md` içindeki pinli Linux Playwright container akışını kullanın.

## 11. Android mobile geliştirme

### 11.1 Windows sınırı

Windows'ta Android local build/emulator desteklenir. iOS native build, simulator ve signing için macOS + Xcode gerekir. EAS cloud iOS build çalıştırabilir; yine Apple credentials ve gerçek iOS cihaz kabulü gerekir.

[Expo Android emulator rehberi](https://docs.expo.dev/workflow/android-studio-emulator/) ve [Expo local app overview](https://docs.expo.dev/guides/local-app-overview/) güncel platform önkoşulları için üst kaynaktır.

### 11.2 Emulator

Android Studio Device Manager'da Android 36 x86_64 bir Pixel AVD oluşturun. Normal geliştirme için model pinli değildir.

```powershell
emulator -list-avds
adb devices
```

Tam olarak kullanacağınız tek hedef `device` durumunda olmalıdır. `unauthorized` ise cihaz ekranında USB debugging iznini onaylayın. Emulator ve USB telefonu aynı anda bağlı bırakmak UAT scriptinin install hedefini belirsizleştirebilir.

Mobile redesign resmi capture gate'i ayrı sözleşmedir: pinli Pixel 10 Pro, x86_64, API 37 ve provenance gerektirir. Normal app geliştirme emulator'uyla aynı kapı değildir.

### 11.3 Mobile local env

[Expo environment variables](https://docs.expo.dev/guides/environment-variables/) gereği `EXPO_PUBLIC_*` değerleri client bundle'da görünür. Bunlara secret koymayın.

Android emulator host bilgisayarın `localhost` adresine `10.0.2.2` ile ulaşır. `apps/mobile/.env.local`:

```dotenv
WHISPR_MOBILE_ENV=development
EXPO_PUBLIC_WHISPR_MOBILE_ENV=development
EXPO_PUBLIC_WHISPR_API_URL=http://10.0.2.2:3000
EXPO_PUBLIC_WHISPR_SOCKET_URL=http://10.0.2.2:3000
EXPO_PUBLIC_WHISPR_WEB_URL=http://10.0.2.2:3000
```

Fiziksel telefon için `10.0.2.2` kullanmayın; aynı ağdaki bilgisayarın LAN IP'sini ve firewall iznini kullanın. Production-like profiller HTTP, localhost ve placeholder host'ları reddeder.

### 11.4 Fresh clone native generation

`apps/mobile/android` generated olduğu için Git tarafından izlenmez. Ancak `android:uat:local` scripti `android/gradlew.bat` bekler ve prebuild yapmaz.

Fresh clone'da zorunlu:

```powershell
Set-Location C:\src\wizards
$env:WHISPR_MOBILE_ENV = "development"
corepack pnpm --filter @wizards/mobile exec expo prebuild --platform android --clean --no-install
Test-Path apps/mobile/android/gradlew.bat
```

Beklenen son çıktı: `True`.

`--clean` generated native dizini yeniden üretir. Generated `android` içinde manuel kalıcı değişiklik yapmayın; config plugin veya `app.config.js` üzerinden üretilebilir hale getirin.

### 11.5 Local backend ile Android

Web ve Docker servisleri açıkken:

```powershell
$env:WHISPR_MOBILE_ENV = "development"
corepack pnpm --filter @wizards/mobile exec expo run:android
```

Sonraki JS/TS/TSX/style değişikliklerinde:

```powershell
corepack pnpm --filter @wizards/mobile start
```

Native dependency, `app.config.js`, permission, Expo plugin veya generated native code değişirse prebuild + native rebuild gerekir. Sıradan JS/TS/style/API değişikliklerinde Fast Refresh kullanın.

### 11.6 Kanonik Windows UAT build

UAT build scripti fiziksel kısa kök `C:\wm` kullanır ve kullanıcıya görünür managed junction'ı `C:\whispr_dev\whispr_uat\whispr_mobile` altında tutar. pnpm virtual store fiziksel `C:\wm\p` ve max length `32` olmalıdır.

Önerilen JDK kurulumu scriptin hard-coded default yolundan farklı olabilir. İlk çalıştırmada `JAVA_HOME` değerini açıkça geçin:

```powershell
Set-Location C:\src\wizards
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  throw "JAVA_HOME, geçerli bir JDK 17 dizini göstermiyor."
}
powershell -ExecutionPolicy Bypass -File .\apps\mobile\scripts\build-android-uat.ps1 -JavaHome $env:JAVA_HOME
```

JDK gerçekten scriptin default `C:\Program Files\Java\jdk-17` yolundaysa kısa package scripti kullanılabilir:

```powershell
Set-Location C:\src\wizards\apps\mobile
corepack pnpm run android:uat:local
```

Script `C:\wm` veya `C:\whispr_dev` oluştururken erişim reddi alırsa geniş `Everyone` yetkisi vermeyin. IT/admin yalnız geliştirici hesabına bu iki managed dizinde Modify yetkisi vermelidir.

Başarı kanıtları:

- Gradle build exit 0.
- Native APK `C:\wm\workspace\apps\mobile\android\app\build\outputs\apk\debug\` veya `release\` altında oluşur.
- Arşiv ve latest APK `C:\wm\artifacts` altında oluşur.
- Script `APK archived`, `APK latest` ve `ABI latest` yollarını basar.
- Install akışında cihazda uygulama açılır.
- Metro açık kalır ve Fast Refresh çalışır.

APK-only scriptinin geçmesi install, Metro veya cihaz kabulü değildir.

Cache temizleme yalnız kanıt varsa:

```powershell
corepack pnpm run android:uat:local:clean
```

### 11.7 Google Sign-In ve FCM

İki credential'ı karıştırmayın:

1. Android OAuth client: `team.whispr.mobile` package + debug/release SHA-1 kimliği.
2. Web OAuth client ID: mobile ID-token audience; `EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID` değeridir.

Tanı:

```powershell
corepack pnpm --filter @wizards/mobile google:doctor
```

FCM:

- Firebase Android app config `apps/mobile/google-services.json` konumuna gelir.
- Push/FCM gerekiyorsa bu dosyayı `expo prebuild` adımından önce yerleştirin.
- Dosya prebuild sonrasında eklendi veya değiştiyse `expo prebuild --platform android --clean --no-install` çalıştırıp native build'i yenileyin.
- Dosya git-ignore edilir; commit/chat/e-posta yapılmaz.
- Firebase service-account private-key JSON ayrı credential'dır.
- Service-account JSON yalnız EAS FCM V1 credential upload akışına verilir.
- Expo push token'ını log, issue veya dokümana koymayın.

Basic app config dosyayı opsiyonel sayar; generated Gradle durumunda Firebase plugin beklentisi ayrıca doğrulanmalıdır. Eksik dosya yüzünden build kırılırse plugin'i veya güvenlik kontrolünü devre dışı bırakmayın; doğru Firebase app config'i alın.

## 12. EAS mobile build ve submit

Kanonik dosya `apps/mobile/eas.json`'dır. Repository kökündeki `eas.json` farklı profiller içerir ve mobile release validator tarafından kullanılmaz.

Her EAS komutunu mobile dizininden çalıştırın:

```powershell
Set-Location C:\src\wizards\apps\mobile
corepack pnpm dlx eas-cli@latest login
corepack pnpm dlx eas-cli@latest whoami
corepack pnpm dlx eas-cli@latest project:info
```

Profiller:

| Profil        | Amaç                                      |
| ------------- | ----------------------------------------- |
| `development` | Development client, local endpoint izinli |
| `uat`         | Railway UAT internal build                |
| `production`  | Store distribution                        |

UAT Android cloud build:

```powershell
corepack pnpm --filter @wizards/mobile validate:env
corepack pnpm --filter @wizards/mobile release:check
corepack pnpm dlx eas-cli@latest build --platform android --profile uat
```

Windows'tan iOS cloud build de dispatch edilebilir:

```powershell
corepack pnpm dlx eas-cli@latest build --platform ios --profile uat
```

Bu, local iOS simulator veya cihaz kabulünün yerine geçmez. Apple Developer team, bundle identifier, distribution certificate/provisioning ve gerçek iOS cihaz QA'sı release sahibi tarafından doğrulanmalıdır.

FCM credential yönetimi:

```powershell
corepack pnpm dlx eas-cli@latest credentials --platform android
```

Production submit yalnız release yetkisi ve kimliği doğrulanmış artifact ile yapılır. `--latest` kullanmayın; en son build UAT/internal olabilir.

```powershell
$androidBuildId = Read-Host "Onaylı production Android EAS build ID"
if ([string]::IsNullOrWhiteSpace($androidBuildId)) { throw "Android build ID zorunlu." }
corepack pnpm dlx eas-cli@latest build:view $androidBuildId
corepack pnpm dlx eas-cli@latest submit --platform android --profile production --id $androidBuildId

$iosBuildId = Read-Host "Onaylı production iOS EAS build ID"
if ([string]::IsNullOrWhiteSpace($iosBuildId)) { throw "iOS build ID zorunlu." }
corepack pnpm dlx eas-cli@latest build:view $iosBuildId
corepack pnpm dlx eas-cli@latest submit --platform ios --profile production --id $iosBuildId
```

`build:view` çıktısında platform, `production` profile, store distribution, app version/build number ve kaynak commit SHA onaylı release kaydıyla eşleşmeden submit etmeyin.

Repo GitHub workflow'larında otomatik `eas build`, `eas submit` veya `eas update` yoktur. EAS build/submit ayrı operatör adımıdır.

## 13. Windows desktop geliştirme

### 13.1 Mimari

Desktop ayrı backend değildir. Tauri 2 kabuğu Whispr web origin'ini yükler. Yerel dev için web terminali önce açık olmalıdır.

Desktop runner `apps/desktop/.env` dosyasını otomatik yüklemez. Env'i aynı PowerShell prosesinde verin.

Terminal 1:

```powershell
corepack pnpm --filter @wizards/web dev
```

Terminal 2:

```powershell
$env:TAURI_DEV_WEB_URL = "http://localhost:3000"
corepack pnpm --filter @wizards/desktop dev
```

Dev URL override yalnız loopback HTTP origin olmalıdır.

### 13.2 Test ve local build

```powershell
corepack pnpm --filter @wizards/desktop test
corepack pnpm --filter @wizards/desktop build:desktop:config
$env:TAURI_WEB_URL = "https://wizardsweb-uat.up.railway.app/"
corepack pnpm --filter @wizards/desktop build:desktop
```

NSIS artifact:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

Local artifact otomatik olarak production-ready değildir. Code signing, updater signature, remote manifest, temiz-profile install, auth restore, tray, voice, overlay ve update/relaunch QA ayrı kanıttır.

## 14. Test ve kalite kapıları

### 14.1 Değişiklik sırasında dar kapı

Web:

```powershell
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web lint
corepack pnpm --filter @wizards/web test
```

Mobile:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile validate:env
corepack pnpm --filter @wizards/mobile release:check
corepack pnpm --filter @wizards/mobile quality:check
```

`quality:check` gerçek emulator veya manuel QA çalıştırmaz; gate sözleşmesini doğrular.

Desktop:

```powershell
corepack pnpm --filter @wizards/desktop test
corepack pnpm --filter @wizards/desktop build:desktop:config
```

Shared packages:

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/ui test
corepack pnpm --filter @wizards/ui typecheck
```

### 14.2 PR öncesi geniş kapı

```powershell
corepack pnpm audit --audit-level moderate
corepack pnpm test:toolchain
corepack pnpm format
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm typecheck:main:ci
corepack pnpm typecheck:compat
corepack pnpm typecheck:declarations
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/ui test
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile validate:env
corepack pnpm --filter @wizards/mobile release:check
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm test:coverage
corepack pnpm build
```

Ardından değişikliğin riskine göre Playwright, Android device ve desktop native build kapılarını ekleyin.

Kök `pnpm ci` güçlü bir aggregate'tir; GitHub Verify ve tüm E2E/device kapılarının birebir eşleniği değildir.

## 15. GitHub CI

Ana workflow: `.github/workflows/ci.yml`.

Trigger'lar:

- Her pull request.
- `main`, `staging`, `uat` push.
- `v*` tag.
- Günlük schedule.
- Manuel workflow dispatch.

Job'lar:

| Job                               | Kapsam                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Verify                            | Install, Prisma, secret scan, audit, format, lint, typecheck, mobile gates, coverage, build |
| TypeScript Compiler Compatibility | TS7 ana, TS6 uyumluluk ve declaration parity                                                |
| Node 22 Native Compatibility      | Yalnız scheduled Windows compatibility                                                      |
| Playwright E2E                    | API, smoke, realtime/voice veya full                                                        |
| Firefox/WebKit Smoke              | Cross-browser smoke                                                                         |
| Accessibility                     | Playwright a11y                                                                             |
| Visual Regression                 | Non-blocking visual regression                                                              |
| Desktop Ops                       | Windows/macOS/Linux config ve release contract                                              |
| Tauri Desktop Build               | Windows native build; tag'de artifact upload                                                |

Önemli:

- Mobile Verify APK üretmez.
- Mobile Verify Maestro/emulator çalıştırmaz.
- Nightly mobile workflow emulator açmaz; commit edilmiş `artifacts/redesign` kanıtını doğrular.
- Push başarısı required check'lerin yeşil olduğunu kanıtlamaz.
- Workflow yeşili deployment ve cihaz kabulünü kanıtlamaz.

PR sonrası GitHub'da her required job'un güncel commit SHA üzerinde tamamlandığını doğrulayın. Eski run veya farklı SHA kanıt değildir.

## 16. Railway web ve worker CD

Repo iki deploy sözleşmesi taşır:

### Web service

`railway.toml`:

- Pre-deploy: `pnpm --filter @wizards/db db:migrate:deploy`
- Start: in-process outbox kapalı web
- Healthcheck: `/ready`
- Failure restart

### Worker service

`railway.outbox-worker.toml`:

- Ayrı `start:outbox-worker`
- Migration çalıştırmaz
- HTTP healthcheck tanımlı değildir
- Failure restart

Railway dashboard'da doğrulanması gereken dış durum:

1. GitHub repo ve doğru branch bağlı.
2. Monorepo build root/command kökten çalışıyor.
3. Web service `railway.toml` kullanıyor.
4. Worker service `railway.outbox-worker.toml` kullanıyor.
5. UAT ve production variables birbirinden ayrılmış.
6. Web production zorunlu env alanları mevcut.
7. Worker'a yalnız gereken DB/Redis/outbox alanları verilmiş.
8. Pre-deploy migration logu başarılı.
9. Web `/ready` 200.
10. Worker startup, queue age, failure ve graceful shutdown logları izleniyor.

Branch mapping, automatic deploy trigger, approval ve Railway project/service kimliği repo içinde kilitli değildir. Dashboard kanıtı gerekir.

## 17. Desktop release CD (currently disabled)

`.github/workflows/desktop-release.yml` Windows yayın girişidir. Beta/UAT `uat`, Kararlı/PROD `main` dalından başlatılır. Başarılı CI, korumalı ortam ve PROD imzalama/onay kontrolleri zorunludur. Güncel sözleşme: [Yayın kanalları](../operations/release-channels.md).

Input'lar:

- `ring`: `uat` (Beta) veya `stable` (Kararlı/PROD)
- `version`: başında `v` olmayan native version
- `web_url`: build içine gömülecek HTTPS origin
- `enable_updater`
- `publish_r2`
- `publish_github_release`
- `updater_base_url`
- `confirm_stable_release`

Akış:

1. Release contract doğrulanır.
2. Windows NSIS artifact build edilir.
3. Ring/updater sözleşmesi gerektiriyorsa Windows signing yapılır; `enable_updater=true` ise updater signature ve local evidence üretilir.
4. `publish_r2=true` ise immutable artifact ve `.sig` R2 release path'ine yüklenir, ring `latest.json` manifest'i güncellenir.
5. `publish_r2=true` ise remote manifest ve artifact URL doğrulanır.
6. `publish_github_release=true` ise başarılı R2 doğrulamasından sonra GitHub Release oluşturulur.
7. Timing ve redacted evidence artifact'leri saklanır.

`publish_r2=false` iken remote updater feed değiştirilmez. Local build/evidence başarısını yayın kanıtı olarak sunmayın.

GitHub Environment secret/variable'ları:

| Tür                          | Adlar                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Updater signing secrets      | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`                                            |
| Windows signing secrets      | `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`                                             |
| GitHub Environment variables | `WHISPR_DESKTOP_UPDATER_PUBLIC_KEY`, `WHISPR_DESKTOP_WINDOWS_SIGNING_CERT_KIND`, `WHISPR_DESKTOP_SENTRY_DSN` |
| R2 secrets                   | `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`                             |

Release ring, web URL ve updater endpoint dispatch contract'ından üretilir; bunları ayrı secret gibi elle çoğaltmayın. `publish_github_release=true`, `publish_r2=true` gerektirir.

Stable ek korumaları:

- Dispatch `main` branch'ten.
- `confirm_stable_release=true`.
- Web URL `https://whispr.team/`.
- Clean semver.
- Gerçek OV/EV Windows signing.

Rollback mutable ring manifest'ini önceki imzalı artifact'e geri yönlendirir. İmzalı immutable release artifact'i üzerine yazılmaz.

## 18. Mobile release CD

Repository'de mobile EAS build/submit için GitHub Actions otomasyonu yoktur.

Operatör kanıt zinciri:

1. Local/CI TypeScript ve mobile gate'leri.
2. Native Android build.
3. Gerçek cihaz smoke ve permission davranışı.
4. Google OAuth doctor.
5. FCM token registration ve gerçek bildirim delivery.
6. EAS profile/env doğrulaması.
7. EAS build artifact.
8. Internal UAT install.
9. PROD rollout ve telemetry.
10. Store submit ve staged rollout.

`release:evidence` gerçek test veya cihaz sonucu üretmez; mevcut gate/checklist sözleşmesini serialize eder. Bunu cihaz kanıtı gibi sunmayın.

## 19. Secret ve veri güvenliği

Asla commit etmeyin:

- `.env` ve `.env.local` dosyaları.
- `google-services.json`.
- Firebase service-account JSON/private key.
- OAuth client secret.
- EAS/Expo access token veya Expo push token.
- Sentry auth token.
- Railway token.
- R2 access key.
- Windows PFX ve password.
- Tauri updater private key/password.
- Gerçek kullanıcı mesajı, e-posta, token veya production DB dump.

`EXPO_PUBLIC_*`, `NEXT_PUBLIC_*` ve build'e gömülen Tauri public config secret değildir. Bunlara yalnız public endpoint, public client ID veya public DSN koyun.

Leak şüphesinde dosyayı silmek yeterli değildir: credential'ı rotate/revoke edin, Git history ve CI artifact/log kapsamını inceleyin, güvenlik sahibine bildirin.

## 20. Sık sorunlar

### Node veya pnpm yanlış

Belirti: engine, lockfile veya native package hataları.

```powershell
node --version
corepack pnpm --version
Get-Content .nvmrc
(Get-Content package.json -Raw | ConvertFrom-Json).packageManager
```

Beklenen: Node `26.10.0`, pnpm `12.5.1`.

### Docker çalışmıyor

Belirti: named pipe, WSL veya virtualization hatası.

```powershell
wsl --status
docker version
docker context show
docker compose ps
```

Docker Desktop engine başlamadan app komutlarını tekrar etmeyin.

### Port dolu

```powershell
Get-NetTCPConnection -LocalPort 3000,5432,6379,7880,8081 -ErrorAction SilentlyContinue |
  Select-Object LocalPort, State, OwningProcess
```

Prosesi tanımlamadan sonlandırmayın:

```powershell
$connection = Get-NetTCPConnection -LocalPort 3000 -ErrorAction Stop |
  Select-Object -First 1
Get-Process -Id $connection.OwningProcess
```

### Prisma authentication hatası

Fallback URL Docker ile uyumsuzdur:

```powershell
$env:DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards"
corepack pnpm --filter @wizards/db db:generate
```

### `/ready` 503

Web logu, PostgreSQL ve Redis:

```powershell
docker compose ps
docker compose logs --tail 100 postgres redis
curl.exe -i http://localhost:3000/ready
```

### E2E preflight reddedildi

Kontrol:

- `E2E_TEST_MODE=true`.
- DB adı local/test benzeri.
- Password en az 8 karakter.
- Base URL loopback.
- `DATABASE_URL` yanlışlıkla normal/production DB değil.
- Redis açık.

### Playwright browser yok

```powershell
corepack pnpm --filter @wizards/web exec playwright install chromium
```

### Fresh clone'da `gradlew.bat` yok

```powershell
corepack pnpm --filter @wizards/mobile exec expo prebuild --platform android --clean --no-install
Test-Path apps/mobile/android/gradlew.bat
```

### Android JDK veya SDK bulunamadı

```powershell
$env:JAVA_HOME
$env:ANDROID_HOME
java -version
adb version
Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe"
```

JDK başka dizindeyse UAT scriptine `-JavaHome $env:JAVA_HOME` geçin.

### ADB unauthorized veya birden çok cihaz

```powershell
adb devices -l
```

Tek hedef bırakın. USB cihazda debugging onayını verin. Hedef seçimini rastgele bırakmayın.

### Android `build.ninja is still dirty after 100 tries`

Bu hata yalnız cache silme problemi değildir. Managed build state'te doğrulayın:

- Fiziksel native yol `C:\wm`.
- Managed junction doğru hedefe bağlı.
- pnpm virtual store `C:\wm\p`.
- `.modules.yaml` virtual-store max length `32`.
- `react-native-worklets` CMake yolları kısa fiziksel kökü kullanıyor.

Kanonik scripti kullanın:

```powershell
corepack pnpm run android:uat:local:clean
```

Elle uzun clone yolundan Gradle çalıştırmak kalıcı çözüm değildir.

### Emulator web'e ulaşamıyor

Android emulator'da API URL `http://10.0.2.2:3000` olmalıdır. Web `SOCKET_ALLOWED_ORIGINS` ve firewall ayarını güvenli biçimde kontrol edin. Production validation'ını gevşetmeyin.

### Google Sign-In çalışmıyor

```powershell
corepack pnpm --filter @wizards/mobile google:doctor
```

Android client package/SHA-1 ile Web client audience değerini karıştırmayın. Debug ve release SHA-1 farklı olabilir.

### Desktop linker/MSVC hatası

- Desktop development with C++ workload.
- Windows SDK.
- Rust MSVC toolchain.
- Developer PowerShell for VS 2022.
- `rustup show active-toolchain` çıktısında `msvc`.

### Desktop env etkisiz

`apps/desktop/.env.example` tek başına yüklenmez. Aynı terminalde:

```powershell
$env:TAURI_DEV_WEB_URL = "http://localhost:3000"
corepack pnpm --filter @wizards/desktop dev
```

### Push oldu ama deploy görünmüyor

Ayrı kontrol edin:

1. Remote branch SHA.
2. GitHub required checks.
3. Railway/EAS/desktop workflow trigger.
4. Deployment log ve health.
5. Artifact kimliği/version.
6. Gerçek cihaz/install kabulü.

## 21. Bilinen repository boşlukları

Bunlar onboarding'de gizlenmemelidir:

1. Env yükleme üç konumda parçalıdır; kopyalar drift edebilir.
2. Prisma fallback credential'ı Docker Compose ile uyumsuzdur.
3. Local E2E template DB adı ile CI DB adı farklıdır.
4. Mobile `android` dizini ignored; UAT scripti fresh clone'da prebuild yapmaz.
5. Kök `eas.json` ile `apps/mobile/eas.json` farklıdır; mobile için ikincisi kanoniktir.
6. PostgreSQL 18 major geçişi dump/restore ister; Redis 8'in lisans değişimi production onayı gerektirir.
7. Desktop runner `.env` yüklemez.
8. Mobile CI APK/Maestro çalıştırmaz.
9. Nightly mobile visual job gerçek emulator capture yapmaz; committed evidence doğrular.
10. Railway worker HTTP healthcheck taşımaz.
11. Yerel mobile release build debug keystore kullanabilir; store artifact'i değildir.

Bu boşlukları geçici özel komutlarla saklamayın. Ayrı engineering task ile kalıcılaştırın.

## 22. Yeni bilgisayar kabul checklist'i

### Makine

- [ ] Git erişimi ve GitHub SSO çalışıyor.
- [ ] Node `26.10.0`.
- [ ] pnpm `12.5.1`.
- [ ] Docker + WSL 2 çalışıyor.
- [ ] JDK 17.
- [ ] Android SDK/adb/emulator çalışıyor.
- [ ] Rust stable MSVC.
- [ ] Visual C++ Build Tools ve WebView2 kurulu.

### Repo ve backend

- [ ] `pnpm install --frozen-lockfile` geçti.
- [ ] `test:toolchain` geçti.
- [ ] Env dosyaları ignored.
- [ ] PostgreSQL `pg_isready`.
- [ ] Redis `PONG`.
- [ ] Prisma generate + migrate geçti.
- [ ] Web `/health` 200.
- [ ] Web `/ready` 200.
- [ ] Login ve temel realtime davranışı çalıştı.
- [ ] E2E preflight + smoke geçti.

### Mobile

- [ ] `android/gradlew.bat` prebuild ile üretildi.
- [ ] Tek adb hedefi `device`.
- [ ] Development build kuruldu.
- [ ] Metro/Fast Refresh çalıştı.
- [ ] UAT scripti `C:\wm` managed root ile geçti.
- [ ] Google doctor sonucu amaçlanan profile uygun.
- [ ] Push gerekiyorsa FCM registration ve delivery ayrı doğrulandı.
- [ ] Manuel permission/navigation/device smoke tamamlandı.

### Desktop

- [ ] Tauri dev yerel web'i açtı.
- [ ] Desktop tests geçti.
- [ ] Config-only build geçti.
- [ ] Gerekliyse NSIS local build oluştu.
- [ ] Release gerekiyorsa signing/updater/clean-profile QA ayrıca tamamlandı.

### Remote

- [ ] PR required checks güncel SHA'da yeşil.
- [ ] Railway service/branch/config mapping doğrulandı.
- [ ] Migration ve `/ready` deployment kanıtı alındı.
- [ ] EAS veya desktop release artifact kimliği doğrulandı.
- [ ] Gerçek cihaz/install kabulü kaydedildi.

## 23. Kaynak gerçekler

Repository içi:

- `.nvmrc`, `package.json`, `pnpm-lock.yaml`
- `.env.example`
- `docker-compose.yml`
- `apps/web/src/lib/env.ts`
- `apps/web/e2e/README.md`
- `apps/mobile/app.config.js`
- `apps/mobile/eas.json`
- `apps/mobile/scripts/build-android-uat.ps1`
- `apps/desktop/README.md`
- `apps/desktop/RELEASE.md`
- `railway.toml`, `railway.outbox-worker.toml`
- `.github/workflows/ci.yml`
- `.github/workflows/desktop-release.yml`
- `.github/workflows/mobile-redesign-device-gate-nightly.yml`

Resmi platform kaynakları:

- [Node.js 26.10.0](https://nodejs.org/en/blog/release/v26.10.0)
- [Git for Windows](https://git-scm.com/install/windows.html)
- [Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Android Studio installation](https://developer.android.com/studio/install)
- [Expo Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [Expo local development](https://docs.expo.dev/guides/local-app-overview/)
- [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)
- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Playwright browsers](https://playwright.dev/docs/browsers)
