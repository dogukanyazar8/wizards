# Whispr

Whispr; web, Expo/React Native mobile, Tauri desktop ve ortak paketlerden oluşan bir pnpm monorepo'dur.

Yeni Windows bilgisayarda sıfırdan kurulum için ana kaynak:

- [Windows geliştirme ve CI/CD onboarding rehberi](docs/development/windows-onboarding.md)

## Repo haritası

| Yol                 | Amaç                                                         |
| ------------------- | ------------------------------------------------------------ |
| `apps/web`          | Next.js web, HTTP API, Socket.IO ve outbox worker            |
| `apps/mobile`       | Expo/React Native Android ve iOS uygulaması                  |
| `apps/desktop`      | Tauri 2 masaüstü kabuğu ve Windows release otomasyonu        |
| `packages/db`       | Prisma şeması, migration ve seed                             |
| `packages/types`    | Ortak tip sözleşmeleri                                       |
| `packages/ui`       | Ortak web UI paketi                                          |
| `docs/operations`   | Üretim, güvenlik, gözlemlenebilirlik ve release runbook'ları |
| `.github/workflows` | CI, desktop release ve mobile device-evidence iş akışları    |

## Kilitli araç sürümleri

- Node.js: `24.18.0`; destek aralığı `>=24.18.0 <25`
- pnpm: `11.20.0`
- Paket yöneticisi: Corepack üzerinden pnpm

Sürümleri tahmin etmeyin. `.nvmrc`, kök `package.json` ve `pnpm-lock.yaml` kaynak gerçektir.

## En kısa web başlangıcı

Bu özet yalnız temel web akışıdır. İlk kurulumda ayrıntılı rehberdeki erişim, secret, E2E, Android, desktop ve release adımlarını da tamamlayın.

```powershell
corepack enable
corepack pnpm install --frozen-lockfile

Copy-Item .env.example .env
Copy-Item .env.example apps/web/.env
Copy-Item .env.example packages/db/.env

docker compose up -d postgres redis
$env:DATABASE_URL = "postgresql://wizards:wizards@localhost:5432/wizards"
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/db db:migrate:deploy

# Demo data is explicit; migrate and reset do not run seed.
$env:SEED_DEMO_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))"
corepack pnpm --filter @wizards/db db:seed
corepack pnpm --filter @wizards/web dev
```

Başarı sinyalleri:

- `docker compose ps`: PostgreSQL ve Redis çalışıyor.
- Web terminali: `Server running on http://localhost:3000`.
- `http://localhost:3000/health`: HTTP 200.
- `http://localhost:3000/ready`: PostgreSQL ve Redis hazırsa HTTP 200.

`AUTH_SECRET` ile `NEXTAUTH_SECRET` için aynı, rastgele ve yalnız yerelde kullanılan değer oluşturun. Prisma komutlarından önce `DATABASE_URL=postgresql://wizards:wizards@localhost:5432/wizards` değerinin etkin olduğunu doğrulayın. Prisma'nın kod içi fallback değeri Docker Compose kimliğiyle uyumlu değildir.

## Platform rehberleri

- [Mobile README](apps/mobile/README.md)
- [Mobile FCM kurulumu](docs/operations/mobile-fcm-setup.md)
- [Desktop README](apps/desktop/README.md)
- [Desktop QA](apps/desktop/QA.md)
- [Desktop release rehberi](apps/desktop/RELEASE.md)
- [Web E2E rehberi](apps/web/e2e/README.md)
- [TypeScript toolchain](docs/operations/typescript-toolchain.md)
- [Observability](docs/operations/observability.md)
- [Prisma 7 deployment](docs/operations/prisma-7-deployment.md)
- [Outbox worker](docs/operations/outbox-worker-monitoring.md)

## Güvenlik

`.env` dosyalarını, Firebase service-account JSON'unu, `google-services.json` dosyasını, OAuth secret'larını, Expo push token'larını, PFX sertifikalarını veya updater private key'lerini commit etmeyin. `EXPO_PUBLIC_*` değerlerinin uygulama paketine açık biçimde gömüldüğünü varsayın.

Yerel build, başarılı push veya başarılı workflow dispatch tek başına deployment ve gerçek cihaz kabulü değildir. CI, deployment, imzalama, updater ve cihaz/store kanıtlarını ayrı ayrı doğrulayın.
