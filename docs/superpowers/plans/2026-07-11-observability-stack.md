# Sentry + OpenTelemetry Gözlemlenebilirlik Yığını — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Whispr'ın dört yüzeyine (web server + worker, web client, mobile, desktop) DSN-kapılı, PII'siz Sentry hata izleme + OTel tabanlı tracing kurmak; uptime/cron/alert kurallarıyla V7 denetiminin P0 `obs-stack` ve P1 `crash-reporting` aksiyonlarını kapatmak.

**Architecture:** `@sentry/nextjs` v9+ (Node SDK'sı OpenTelemetry üzerine kuruludur — ayrı OTel SDK kurulumu gerekmez; http/undici/ioredis otomatik enstrümante edilir, Prisma `tracing` preview + `@prisma/instrumentation` ile eklenir). Custom server (`server.ts`) ve outbox worker aynı esbuild hattından çıktığı için Sentry init'i **yalnızca dış paket import eden** ayrı bir `instrument` entry'sinde yapılır ve `node --import` ile yüklenir; uygulama bundle'ları Sentry'ye **redaksiyon köprüsü** (`logError` → `redactErrorForReport` → Sentry) üzerinden erişir. İstemci tarafı `instrumentation-client.ts` + `tunnelRoute: "/monitoring"` kullanır — böylece **strict CSP'ye (nonce + strict-dynamic) hiç dokunulmaz**. Mobil `@sentry/react-native` Expo plugin'i, desktop Rust `sentry` crate'i.

**Tech Stack:** `@sentry/nextjs` (^9 veya güncel major — kurulumda doğrula), `@prisma/instrumentation@5.22.0` (Prisma 5.22 ile eşleşmeli), `@sentry/react-native` (+ Expo config plugin, metro), Rust `sentry` crate. Her yüzeyde kill-switch: DSN env boşsa SDK no-op.

**Kapsam dışı (YAGNI):** Session Replay (gizlilik politikası netleşene dek kapalı), self-hosted Sentry, Grafana/Tempo, log aggregation, Socket.IO OTel enstrümantasyonu (Görev 13'te isteğe bağlı).

---

## Revizyon 2 — Bağlayıcı Düzeltmeler ve Gerçek Değerler

Bu blok, plan gövdesindeki herhangi bir adımla çeliştiğinde **planı geçersiz kılar**. Görev 0 (dış sistem hazırlığı) tamamlandı; kod tarafı Görev 0.5'ten başlar.

### Gerçek Sentry değerleri (Görev 0 çıktısı)

| Alan | Değer |
|---|---|
| **Organization slug (`SENTRY_ORG`)** | `whispr-p0` — plandaki `whispr` varsayımı YANLIŞ |
| **Veri bölgesi** | **EU / Almanya (DE)** — `o4511722135617536.ingest.de.sentry.io`, region URL `https://de.sentry.io` |
| DSN — `SENTRY_DSN` (server/worker) | whispr-server projesi DSN'i (Railway/whispr-web + outbox-worker servis değişkeni) |
| DSN — `NEXT_PUBLIC_SENTRY_DSN` | whispr-web projesi DSN'i |
| DSN — `EXPO_PUBLIC_WHISPR_SENTRY_DSN` | whispr-mobile projesi DSN'i (EAS public env) |
| DSN — `WHISPR_DESKTOP_SENTRY_DSN` | whispr-desktop projesi DSN'i (derleme-zamanı, GitHub `vars`) |
| `SENTRY_AUTH_TOKEN` | Organization auth token (`org:ci` scope) — **yalnız parola yöneticisi + GitHub/Railway/EAS secret'ında; hiçbir dosyaya yazma** |

DSN'ler gömülebilir istemci anahtarıdır (sır değil) ama yine de env değişkeninden okunur; DSN değerlerini koda sabit yazma. Auth token bir yönetim sırrıdır ve depoya asla girmez.

### D1 — İzolasyon (ÖNCE)
Mevcut `uat` checkout'unda ilgisiz WIP değişiklikleri var. Onlara dokunma. Temiz `uat` HEAD'inden izole worktree/branch aç (Görev 0.5).

### D2 — Auth token & org slug
`SENTRY_ORG=whispr-p0`. Token bir **organization auth token**'dır, `org:ci` scope'lu. Plandaki eski `project:releases`/`org:read`/`project:write` scope önerisini yok say.

### D3 — Source map token'ı yalnız deployment build'ine
`SENTRY_AUTH_TOKEN`'ı GitHub CI'nin `pnpm build` adımına EKLEME. Web source map yüklemesi yalnız **Railway deployment build'inde** (token orada Railway build değişkeni) gerçekleşir. `turbo.json` build env dizisinde `SENTRY_AUTH_TOKEN` bulunmalı ki Railway'in turbo build'i onu görsün. Token yoksa `withSentryConfig` yüklemeyi sessizce atlar ve build kırılmaz.

### D4 — EAS environment-variable akışı
`eas secret:create` KULLANMA. `SENTRY_AUTH_TOKEN` Expo Dashboard → Project Settings → Environment variables üzerinden `Sensitive` görünürlükle **Preview + Production** ortamlarına eklenir (profil eşlemesi: uat→preview, canary→preview, production→production). `eas.json`'a yalnız public `EXPO_PUBLIC_WHISPR_SENTRY_DSN` eklenir.

### D5 — Katmanlı PII redaksiyonu (KRİTİK)
Sentry'ye **ham `Error` gönderme**. Katmanlar: (1) birincil — `logger.ts`'ten `redactErrorForReport` export edilir, köprü redakte Error gönderir; (2) ikincil — `beforeSend` ile olay süpürme; (3) son — Sentry UI Data Scrubbing (Görev 0'da açıldı). Tam kod Görev 1 ve 2'dedir. Bu olmadan "PII'siz" kabul kriteri karşılanmaz.

### D6 — Production ertelenir
Production Railway değişkenleri Görev 0'da eklenmedi (doğru). Sıra: UAT deploy → 48h gözlem (Görev 11) → sonra production `SENTRY_TRACES_SAMPLE_RATE=0.1`. Kodun hiçbir yeri production'ı otomatik açmaz.

### D7 — EU/DE bölgesi (gerçek değerlerden çıktı)
Runtime olay gönderimi DSN'deki bölgeden (`ingest.de.sentry.io`) otomatik çözülür — ek ayar gerekmez. **Build-time source map yüklemesi** için `withSentryConfig`'e `sentryUrl: "https://de.sentry.io"` ekle; mobil/desktop CLI işlemlerinde gerekirse `SENTRY_URL=https://de.sentry.io`. (Org auth token region_url'ü gömülü taşır; sentry-cli 2.x çoğu durumda otomatik algılar, `sentryUrl` bunu garantiye alır.)

---

## Tasarım Kararları (uygulayıcı için bağlam)

| Karar | Gerekçe |
|---|---|
| SaaS Sentry (EU/DE), 4 proje | Server+worker aynı kod → tek projede `process` tag'iyle ayrışır; istemci/mobil/desktop farklı SDK platformları |
| `tunnelRoute: "/monitoring"` | CSP `connect-src 'self'` kalır; desktop webview CSP'si değişmez; adblocker kaybı sıfırlanır |
| Init `--import` ile ayrı `instrument` entry'de | esbuild her entry'yi ayrı bundle'lar; Sentry paketi `packages: "external"` sayesinde tüm bundle'larda TEK instance → `isInitialized()` her yerden doğru |
| `logError` köprüsü + `redactErrorForReport` | 85+ `logError` çağrısı tek hamlede redakte Sentry'ye akar; logger `@sentry` import etmez |
| `sendDefaultPii: false` + katmanlı redaksiyon | E-posta/IP asla gönderilmez; kullanıcı bağlamı yalnız `userId` |
| E2E/dev'de kapalı | `E2E_TEST_MODE=true` → `beforeSend` düşürür; dev'de DSN tanımsız; CI token'sız da yeşil |
| Örnekleme: prod trace 0.1, uat 1.0, client 0.05; hatalar tam | Kota kontrolü; `SENTRY_TRACES_SAMPLE_RATE` ortam bazında |

## Dosya Haritası

```
apps/web/
  instrument.ts                        (YENİ — server/worker Sentry.init + beforeSend; yalnız dış paket import)
  scripts/build-server.mjs             (DEĞİŞİR — 3. entry: instrument; sourcemap: true)
  package.json                         (DEĞİŞİR — start --import + --enable-source-maps; yeni bağımlılıklar)
  next.config.ts                       (DEĞİŞİR — withSentryConfig + sentryUrl DE)
  src/lib/logger.ts                    (DEĞİŞİR — redactText/redactValue export + redactErrorForReport)
  src/lib/logger.test.ts               (DEĞİŞİR — redaksiyon + köprü testleri)
  src/lib/observability/reporter.ts    (YENİ — registerErrorReporter/reportError)
  src/lib/observability/reporter.test.ts (YENİ)
  src/lib/observability/register-sentry.ts (YENİ — redakte köprü)
  src/instrumentation.ts               (YENİ — Next register + onRequestError)
  src/instrumentation-client.ts        (YENİ — tarayıcı init + beforeSend + app_surface)
  src/app/global-error.tsx             (YENİ — App Router kök hata sınırı)
  scripts/send-sentry-test-event.ts    (YENİ — duman testi)
  server.ts                            (DEĞİŞİR — registerSentryErrorReporter)
  scripts/run-outbox-worker.ts         (DEĞİŞİR — reporter kaydı + heartbeat)
packages/db/prisma/schema.prisma       (DEĞİŞİR — previewFeatures=["tracing"])
apps/mobile/
  metro.config.js                      (YENİ — getSentryExpoConfig)
  app.config.js                        (DEĞİŞİR — expo plugin + sentryDsn passthrough)
  src/config/environment.ts            (DEĞİŞİR — sentryDsn passthrough)
  src/observability/mobile-sentry.ts   (YENİ — init + beforeSend + wrap + boundary reporter)
  index.ts                             (DEĞİŞİR — init + Sentry.wrap(App))
  src/app/mobile-error-boundary.tsx    (DEĞİŞİR — üretimde de raporla)
  src/security/mobile-security-signal-logger.ts (DEĞİŞİR — breadcrumb)
  eas.json                             (DEĞİŞİR — public DSN env; auth token EKLENMEZ)
apps/desktop/src-tauri/
  Cargo.toml                           (DEĞİŞİR — sentry crate)
  src/lib.rs                           (DEĞİŞİR — run() başında DSN-kapılı init)
.github/workflows/ci.yml               (DEĞİŞİR — desktop-build'e DSN vars; verify build'e token EKLENMEZ)
.github/workflows/desktop-release.yml  (DEĞİŞİR — build job'a DSN vars)
turbo.json                             (DEĞİŞİR — build env: Sentry değişkenleri + SENTRY_AUTH_TOKEN)
.env.example                           (DEĞİŞİR)
docs/operations/observability.md       (YENİ — runbook)
```

Ortam değişkenleri: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` (ops.), `SENTRY_ORG=whispr-p0`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (yalnız build — source map), `SENTRY_URL=https://de.sentry.io` (ops., CLI için), `EXPO_PUBLIC_WHISPR_SENTRY_DSN`, `WHISPR_DESKTOP_SENTRY_DSN`. **Hiçbiri zorunlu değil; boş = ilgili yüzeyde Sentry kapalı.**

---

### Görev 0: Sentry org & projeler (TAMAMLANDI — dış sistem)

Görev 0 tamamlandı. Kanıt: org `whispr-p0` (EU/DE), 4 proje (server/web/mobile/desktop) + DSN'ler, `org:ci` auth token (parola yöneticisinde), GitHub secret `SENTRY_AUTH_TOKEN`, EAS env (Sensitive, Preview+Production), Railway UAT değişkenleri, 4 projede Data Scrubbing + IP engeli açık, **production değişkenleri henüz eklenmedi**. Kurulum wizard'ları çalıştırılmadı (custom kablolama).

### Görev 0.5: İzole worktree (D1)

**Files:** yok (git)

- [ ] **Adım 1: Temiz uat HEAD'inden worktree aç**

```bash
cd C:/Users/doguk/Desktop/Wizards
git worktree add ../wizards-observability -b feat/observability-stack uat
cd ../wizards-observability
pnpm install --frozen-lockfile
```

Beklenen: yeni worktree, WIP değişikliklerinden bağımsız temiz ağaç. Tüm sonraki görevler burada. (`superpowers:using-git-worktrees` becerisi kullanılabilir.)

- [ ] **Adım 2: Temizliği doğrula**

Run: `git status --short`
Beklenen: boş çıktı (uat HEAD'i temiz).

### Görev 1: Reporter köprüsü + `logError` + redaksiyon (D5)

**Files:**
- Create: `apps/web/src/lib/observability/reporter.ts`
- Create: `apps/web/src/lib/observability/reporter.test.ts`
- Modify: `apps/web/src/lib/logger.ts` (export'lar + `redactErrorForReport`; `logError` gövdesi)
- Modify: `apps/web/src/lib/logger.test.ts`

- [ ] **Adım 1: Reporter testini yaz (başarısız olmalı)**

`apps/web/src/lib/observability/reporter.test.ts`:

```ts
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearErrorReporter,
  registerErrorReporter,
  reportError,
} from "./reporter";

describe("observability reporter", () => {
  beforeEach(() => {
    clearErrorReporter();
  });

  it("kayıtlı reporter'a scope ve hatayı iletir", () => {
    const calls: Array<{ scope: string; error: unknown }> = [];
    registerErrorReporter((scope, error) => {
      calls.push({ scope, error });
    });

    const failure = new Error("boom");
    reportError("[test] scope", failure);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.scope, "[test] scope");
    assert.equal(calls[0]?.error, failure);
  });

  it("reporter yokken sessizce no-op kalır", () => {
    assert.doesNotThrow(() => reportError("[test] scope", new Error("boom")));
  });

  it("reporter'ın kendi hatası çağıranı asla kırmaz", () => {
    registerErrorReporter(() => {
      throw new Error("reporter down");
    });
    assert.doesNotThrow(() => reportError("[test] scope", new Error("boom")));
  });
});
```

- [ ] **Adım 2: FAIL doğrula**

Run: `pnpm --filter @wizards/web test`
Beklenen: `Cannot find module './reporter'` FAIL.

- [ ] **Adım 3: Reporter'ı yaz**

`apps/web/src/lib/observability/reporter.ts`:

```ts
export type ErrorReporter = (scope: string, error: unknown) => void;

let activeReporter: ErrorReporter | null = null;

export function registerErrorReporter(reporter: ErrorReporter) {
  activeReporter = reporter;
}

export function clearErrorReporter() {
  activeReporter = null;
}

export function reportError(scope: string, error: unknown) {
  if (!activeReporter) {
    return;
  }
  try {
    activeReporter(scope, error);
  } catch {
    // Raporlayıcı asla uygulama akışını kıramaz; hata izleme best-effort'tur.
  }
}
```

- [ ] **Adım 4: PASS doğrula**

Run: `pnpm --filter @wizards/web test`
Beklenen: PASS.

- [ ] **Adım 5: `logger.ts` — export'lar + `redactErrorForReport` (D5 birincil katman)**

`apps/web/src/lib/logger.ts`:
1. `function redactText(` → `export function redactText(` (satır 20).
2. `function redactValue(` → `export function redactValue(` (satır 26).
3. Dosya başına import ekle: `import { reportError } from "@/lib/observability/reporter";` (dosyadaki mevcut import stiline uy — göreli ise `./observability/reporter`).
4. `logError`'ı güncelle (`logWarning` DEĞİŞMEZ):

```ts
export function logError(scope: string, error: unknown) {
  console.error(formatErrorLog(scope, error));
  reportError(scope, error);
}
```

5. Dosya sonuna ekle:

```ts
export function redactErrorForReport(error: unknown): Error {
  if (error instanceof Error) {
    const redacted = new Error(redactText(error.message));
    redacted.name = error.name;
    if (error.stack) {
      redacted.stack = redactText(error.stack);
    }
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string") {
      (redacted as Error & { code?: string }).code = code;
    }
    return redacted;
  }
  const safe = redactValue(error);
  return new Error(
    redactText(typeof safe === "string" ? safe : JSON.stringify(safe)),
  );
}
```

- [ ] **Adım 6: `logger.test.ts`'e köprü + redaksiyon testleri (önce FAIL)**

Mevcut import bloğuna ekle (`node:test`/`node:assert/strict` kalıbına uy) ve dosya sonuna:

```ts
import {
  clearErrorReporter,
  registerErrorReporter,
} from "./observability/reporter";
import { redactErrorForReport } from "./logger";

describe("logError reporter köprüsü", () => {
  it("logError kayıtlı reporter'ı tetikler", () => {
    const calls: Array<{ scope: string; error: unknown }> = [];
    registerErrorReporter((scope, error) => calls.push({ scope, error }));
    const failure = new Error("bridge test");
    logError("[bridge] test", failure);
    clearErrorReporter();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.scope, "[bridge] test");
  });

  it("logWarning reporter'ı tetiklemez", () => {
    const calls: unknown[] = [];
    registerErrorReporter((scope) => calls.push(scope));
    logWarning("[bridge] warn", new Error("warn"));
    clearErrorReporter();
    assert.equal(calls.length, 0);
  });
});

describe("redactErrorForReport", () => {
  it("mesajdaki JWT'yi redakte eder, stack'i korur", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwMTIzNCJ9.dozjgNryP4J3jVmNHl0w5N";
    const failure = new Error(`token sızdı: ${jwt}`);
    const redacted = redactErrorForReport(failure);
    assert.ok(!redacted.message.includes("eyJ"));
    assert.ok(redacted.message.includes("[redacted-jwt]"));
    assert.equal(redacted.name, "Error");
    assert.ok(typeof redacted.stack === "string" && redacted.stack.length > 0);
  });

  it("Error olmayan değeri redakte string'e sarar", () => {
    const redacted = redactErrorForReport({ secret: "sk_live_ABCDEFGHIJKLMNOP123" });
    assert.ok(redacted instanceof Error);
  });
});
```

(`logWarning` import listesinde yoksa ekle.)

- [ ] **Adım 7: FAIL → güncelle → PASS + typecheck**

Run: `pnpm --filter @wizards/web test && pnpm --filter @wizards/web typecheck`
Beklenen: PASS / hatasız.

- [ ] **Adım 8: Commit**

```bash
git add apps/web/src/lib/observability/ apps/web/src/lib/logger.ts apps/web/src/lib/logger.test.ts
git commit -m "feat(web): add error reporter bridge with report-time redaction"
```

### Görev 2: Server/worker Sentry init (`instrument.ts`) + redakte köprü + build/start

**Files:**
- Create: `apps/web/instrument.ts`
- Create: `apps/web/src/lib/observability/register-sentry.ts`
- Modify: `apps/web/scripts/build-server.mjs`, `apps/web/package.json`, `apps/web/server.ts`, `apps/web/scripts/run-outbox-worker.ts`, `.env.example`, `turbo.json`

- [ ] **Adım 1: Paketi kur + sürüm doğrula**

```bash
pnpm --filter @wizards/web add @sentry/nextjs
pnpm ls --filter @wizards/web @sentry/nextjs
```

Major ≥10 ise migration notlarını kontrol et (init, captureException, captureCheckIn, isInitialized, prismaIntegration, tunnelRoute, onRequestError, sentryUrl v9/v10'da stabil).

- [ ] **Adım 2: `instrument.ts` (yalnız dış paket import + ikinci katman `beforeSend`)**

```ts
// Server ve outbox worker için Sentry başlatma girişi.
// `node --import ./dist/instrument.js` ile uygulama kodundan ÖNCE yüklenir.
// KURAL: yalnız dış paket import edilebilir (esbuild entry-başına-kopya tuzağı).
import * as Sentry from "@sentry/nextjs";
import { PrismaInstrumentation } from "@prisma/instrumentation";

// KAYNAK-DOĞRU: apps/web/src/lib/logger.ts. Bu dosya import-bağımsız olmak
// zorunda olduğundan iki desen kasıtlı tekrarlanır; logger.ts değişirse güncelle.
const JWT_PATTERN =
  /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g;
const SECRET_PATTERN = /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g;
function scrub(value: string) {
  return value
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(SECRET_PATTERN, "[redacted-secret]");
}

function parseSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const dsn = process.env.SENTRY_DSN?.trim();

if (!dsn) {
  console.info("[observability] SENTRY_DSN not set; Sentry disabled.");
} else {
  Sentry.init({
    dsn,
    environment:
      process.env.WHISPR_RELEASE_CHANNEL?.trim() ||
      process.env.RAILWAY_ENVIRONMENT_NAME?.trim() ||
      process.env.NODE_ENV ||
      "development",
    release:
      process.env.WHISPR_BUILD_ID?.trim() ||
      process.env.RAILWAY_GIT_COMMIT_SHA?.trim()?.slice(0, 8) ||
      undefined,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    integrations: [
      Sentry.prismaIntegration({
        prismaInstrumentation: new PrismaInstrumentation(),
      }),
    ],
    ignoreTransactions: [/^GET \/(ready|health)$/, /^POST \/monitoring/],
    initialScope: {
      tags: {
        process:
          process.env.WHISPR_OUTBOX_WORKER === "true" ? "outbox-worker" : "web",
      },
    },
    beforeSend(event) {
      if (process.env.E2E_TEST_MODE === "true") {
        return null;
      }
      if (event.message) {
        event.message = scrub(event.message);
      }
      for (const value of event.exception?.values ?? []) {
        if (value.value) {
          value.value = scrub(value.value);
        }
      }
      for (const crumb of event.breadcrumbs ?? []) {
        if (crumb.message) {
          crumb.message = scrub(crumb.message);
        }
      }
      return event;
    },
  });
  console.info("[observability] Sentry initialized for server process.");
}
```

(`@prisma/instrumentation` Görev 4'te kurulur; Görev 2 ile aynı oturumda yap ya da import+integrations bloğunu Görev 4'e ertele.)

- [ ] **Adım 3: `register-sentry.ts` (redakte köprü — D5 birincil katman)**

`apps/web/src/lib/observability/register-sentry.ts`:

```ts
import * as Sentry from "@sentry/nextjs";
import { redactErrorForReport, redactText } from "@/lib/logger";
import { registerErrorReporter } from "@/lib/observability/reporter";

export function registerSentryErrorReporter() {
  if (!Sentry.isInitialized()) {
    return false;
  }
  registerErrorReporter((scope, error) => {
    Sentry.captureException(redactErrorForReport(error), {
      tags: { "log.scope": redactText(scope) },
    });
  });
  return true;
}
```

- [ ] **Adım 4: esbuild 3. entry + sourcemap**

`apps/web/scripts/build-server.mjs` — `entryPoints`'e `instrument: resolve(webRoot, "instrument.ts"),` ekle ve `sourcemap: false` → `sourcemap: true`.

- [ ] **Adım 5: start script'leri**

`apps/web/package.json`:

```json
"start": "node ../../packages/db/scripts/ensure-prisma-client-runtime.mjs && node --enable-source-maps --import ./dist/instrument.js dist/server.js",
"start:outbox-worker": "node ../../packages/db/scripts/ensure-prisma-client-runtime.mjs && node --enable-source-maps --import ./dist/instrument.js dist/outbox-worker.js",
```

- [ ] **Adım 6: `server.ts` reporter kaydı**

Import ekle `import { registerSentryErrorReporter } from "./src/lib/observability/register-sentry.js";` ve `assertWebEnvironment(...)` sonrası `registerSentryErrorReporter();`.

- [ ] **Adım 7: `run-outbox-worker.ts` reporter kaydı**

Import ekle `import { registerSentryErrorReporter } from "@/lib/observability/register-sentry";` ve `assertOutboxWorkerEnvironment(...)` sonrası `registerSentryErrorReporter();`. Böylece `worker.ts:75` `logError` çağrısı worker'a dokunmadan Sentry'ye akar.

- [ ] **Adım 8: env örnekleri + turbo (D3)**

`.env.example` sonuna:

```
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=
SENTRY_ORG=whispr-p0
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
SENTRY_URL=https://de.sentry.io
```

`turbo.json` → `tasks.build.env` dizisine (alfabetik) ekle: `"NEXT_PUBLIC_SENTRY_DSN"`, `"SENTRY_AUTH_TOKEN"`, `"SENTRY_DSN"`, `"SENTRY_ORG"`, `"SENTRY_PROJECT"`, `"SENTRY_TRACES_SAMPLE_RATE"`, `"SENTRY_URL"`. (D3: `SENTRY_AUTH_TOKEN` burada olmalı ki Railway build'i görsün; GitHub CI build adımına EKLEME.)

- [ ] **Adım 9: DSN'siz no-op doğrulaması**

```bash
pnpm --filter @wizards/web build:server
cd apps/web && node --import ./dist/instrument.js -e "console.log('import ok')"; cd ../..
```

Beklenen: `[observability] SENTRY_DSN not set; Sentry disabled.` + `import ok`.

- [ ] **Adım 10: Test + typecheck + commit**

```bash
pnpm --filter @wizards/web test && pnpm --filter @wizards/web typecheck
git add apps/web/instrument.ts apps/web/src/lib/observability/register-sentry.ts apps/web/scripts/build-server.mjs apps/web/package.json apps/web/server.ts apps/web/scripts/run-outbox-worker.ts .env.example turbo.json pnpm-lock.yaml
git commit -m "feat(web): initialize Sentry for server and outbox worker processes"
```

### Görev 3: Outbox worker heartbeat (Sentry Cron)

**Files:** Modify `apps/web/scripts/run-outbox-worker.ts`

- [ ] **Adım 1:** Import `import * as Sentry from "@sentry/nextjs";`; `if (started) {...}` sonrası:

```ts
const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;
function sendWorkerHeartbeat() {
  if (!Sentry.isInitialized()) {
    return;
  }
  Sentry.captureCheckIn({ monitorSlug: "outbox-worker-heartbeat", status: "ok" });
}
sendWorkerHeartbeat();
const heartbeatTimer = setInterval(sendWorkerHeartbeat, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref?.();
```

- [ ] **Adım 2:** Sentry → Crons → Add Monitor: slug `outbox-worker-heartbeat`, interval 1h, grace 15m, failure threshold 1.
- [ ] **Adım 3:** `pnpm --filter @wizards/web build:server && pnpm --filter @wizards/web typecheck` → commit `feat(web): add outbox worker heartbeat check-in`.

### Görev 4: Prisma tracing (OTel)

**Files:** Modify `packages/db/prisma/schema.prisma`, `apps/web/package.json`

- [ ] **Adım 1:** `generator client { provider = "prisma-client-js"\n  previewFeatures = ["tracing"] }`.
- [ ] **Adım 2:** `pnpm --filter @wizards/web add @prisma/instrumentation@5.22.0 && pnpm db:generate` (major MUTLAKA 5.x; client 5.22.0). Windows'ta EPERM görülürse CI source of truth.
- [ ] **Adım 3:** `instrument.ts`'teki `PrismaInstrumentation` import + `integrations` bloğunun aktif olduğunu doğrula.
- [ ] **Adım 4:** `pnpm typecheck && pnpm --filter @wizards/web test` → commit `feat(db): enable prisma tracing for observability spans`.

### Görev 5: Next istemci + RSC + source map + DE bölge (D3, D7)

**Files:** Create `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/app/global-error.tsx`; Modify `next.config.ts`

- [ ] **Adım 1: `src/instrumentation.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    !Sentry.isInitialized() &&
    process.env.SENTRY_DSN?.trim()
  ) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.WHISPR_RELEASE_CHANNEL?.trim() ||
        process.env.RAILWAY_ENVIRONMENT_NAME?.trim() ||
        process.env.NODE_ENV,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Adım 2: `src/instrumentation-client.ts` (D5 istemci beforeSend — logger DRY import)**

```ts
import * as Sentry from "@sentry/nextjs";
import { redactText } from "@/lib/logger";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn && process.env.NEXT_PUBLIC_E2E_TEST_MODE !== "true") {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_WHISPR_RELEASE_CHANNEL || "development",
    release: process.env.NEXT_PUBLIC_WHISPR_BUILD_ID || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    tunnel: "/monitoring",
    beforeSend(event) {
      if (event.message) {
        event.message = redactText(event.message);
      }
      for (const value of event.exception?.values ?? []) {
        if (value.value) {
          value.value = redactText(value.value);
        }
      }
      return event;
    },
  });

  Sentry.setTag(
    "app_surface",
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
      ? "desktop"
      : "web",
  );
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Adım 3: `src/app/global-error.tsx`**

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ alignItems: "center", display: "flex", fontFamily: "system-ui, sans-serif", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Bir şeyler ters gitti</h1>
          <p>Hata kaydedildi. Lütfen tekrar deneyin.</p>
          <button onClick={reset} type="button">Tekrar dene</button>
        </div>
      </body>
    </html>
  );
}
```

(`lang` değerini `apps/web/src/app/layout.tsx`'teki kök `<html lang>` ile eşleştir.)

- [ ] **Adım 4: `next.config.ts` — withSentryConfig + DE bölge (D3, D7)**

Import `import { withSentryConfig } from "@sentry/nextjs";`. Son satırı değiştir:

```ts
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sentryUrl: process.env.SENTRY_URL || "https://de.sentry.io",
  silent: true,
  telemetry: false,
  disableLogger: true,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  release: { name: whisprBuildId },
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
```

(D3: `SENTRY_AUTH_TOKEN` yokken plugin upload'ı atlar, build kırılmaz. D7: `sentryUrl` DE bölgesine sabit — CI/lokal build token'sız yeşil kalır.)

- [ ] **Adım 5: `/monitoring` CSRF etkileşim doğrulaması**

```bash
pnpm --filter @wizards/web build
pnpm --filter @wizards/web start &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/monitoring -H "Content-Type: application/x-sentry-envelope" --data "{}"
kill %1
```

Beklenen: `200` veya benzeri — **`CSRF_BLOCKED` (403) OLMAMALI** (CSRF yalnız `/api/v1`+`/api/e2e`). Görülürse `middleware.ts` `isCsrfProtectedApiPath`'i kontrol et. CSP direktiflerine dokunma.

- [ ] **Adım 6: Kontrat/E2E regresyon**

`pnpm --filter @wizards/web test` → PASS (özellikle `route-contract.test.ts`; tünel route dosyası eklemez).

- [ ] **Adım 7: Commit**

```bash
git add apps/web/src/instrumentation.ts apps/web/src/instrumentation-client.ts apps/web/src/app/global-error.tsx apps/web/next.config.ts
git commit -m "feat(web): wire Sentry client, RSC error hook, and DE-region sourcemap upload"
```

### Görev 6: Staging duman testi + uptime

**Files:** Create `apps/web/scripts/send-sentry-test-event.ts`

- [ ] **Adım 1:**

```ts
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();
if (!dsn) {
  console.error("SENTRY_DSN gerekli.");
  process.exit(1);
}
Sentry.init({ dsn, environment: "smoke-test", sendDefaultPii: false });
Sentry.captureMessage(`whispr observability smoke ${new Date().toISOString()}`);
const flushed = await Sentry.flush(5000);
console.info(flushed ? "Test olayı gönderildi." : "Flush zaman aşımı.");
process.exit(flushed ? 0 : 1);
```

- [ ] **Adım 2:** `SENTRY_DSN=<whispr-server DSN> pnpm --filter @wizards/web exec tsx scripts/send-sentry-test-event.ts` → Sentry Issues'da olay (env smoke-test). (DSN bölge kodunu içerdiğinden `SENTRY_URL` gerekmez.)
- [ ] **Adım 3:** UAT deploy sonrası tarayıcıda `POST /monitoring` 200; `whispr-web`'de pageload transaction.
- [ ] **Adım 4:** Sentry → Uptime: `https://whispr.team/ready` + `https://wizardsweb-uat.up.railway.app/ready`, 1 dk.
- [ ] **Adım 5:** commit `chore(web): add sentry smoke-test script`.

### Görev 7: Alert kuralları + pano (clickops)

- [ ] Discord/Slack entegrasyonu.
- [ ] Issue alert (4 proje, environment=production, yeni issue → kanal).
- [ ] Metric alert (whispr-server): `failure_rate() > 1%` /5dk critical; `p95(transaction.duration) > 2s` /10dk warning.
- [ ] Crash-free alert (whispr-mobile): crash-free session < 99.5% /1sa critical.
- [ ] Dashboard "Whispr SLO v0": error rate, p95 API latency, throughput, crash-free sessions, uptime, outbox cron.

### Görev 8: Mobil Sentry (D4 EAS akışı + D5 beforeSend)

**Files:** Create `apps/mobile/metro.config.js`, `apps/mobile/src/observability/mobile-sentry.ts`; Modify `app.config.js`, `src/config/environment.ts`, `index.ts`, `src/app/mobile-error-boundary.tsx`, `src/security/mobile-security-signal-logger.ts`, `eas.json`

- [ ] **Adım 1:** `pnpm --filter @wizards/mobile add @sentry/react-native && pnpm --filter @wizards/mobile exec npx expo install --check` → expo-doctor uyumlu.
- [ ] **Adım 2: `metro.config.js`**

```js
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
module.exports = getSentryExpoConfig(__dirname);
```

- [ ] **Adım 3: `app.config.js` — plugin + DSN passthrough**

`plugins` dizisine ekle:

```js
[
  "@sentry/react-native/expo",
  { organization: process.env.SENTRY_ORG ?? "whispr-p0", project: "whispr-mobile" },
],
```

`buildPublicConfig` dönüşüne `sentryDsn: process.env.EXPO_PUBLIC_WHISPR_SENTRY_DSN?.trim() || null,` ekle.

- [ ] **Adım 4: `src/config/environment.ts`** — `publicSentryDsn: process.env.EXPO_PUBLIC_WHISPR_SENTRY_DSN` girdisi + config dönüşüne `sentryDsn: input.publicSentryDsn?.trim() || null` (tip: `sentryDsn: string | null`). Co-located test varsa DSN trim + null assert'i ekle; `pnpm --filter @wizards/mobile test` PASS.
- [ ] **Adım 5: `src/observability/mobile-sentry.ts` (D5 mobil beforeSend inline)**

```ts
import * as Sentry from "@sentry/react-native";

// KAYNAK-DOĞRU: apps/web/src/lib/logger.ts — mobil web logger'ı paylaşmaz, desen tekrarlanır.
const JWT_PATTERN =
  /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g;
const SECRET_PATTERN = /\b(?:sk|pk|ya29|gh[opsu])_[a-zA-Z0-9_-]{16,}\b/g;
function scrub(value: string) {
  return value.replace(JWT_PATTERN, "[redacted-jwt]").replace(SECRET_PATTERN, "[redacted-secret]");
}

interface MobileSentryConfig {
  environment: string;
  sentryDsn: string | null;
}

let initialized = false;

export function initMobileSentry(config: MobileSentryConfig) {
  if (initialized || !config.sentryDsn || __DEV__) {
    return false;
  }
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    enableAppHangTracking: true,
    beforeSend(event) {
      if (event.message) {
        event.message = scrub(event.message);
      }
      for (const value of event.exception?.values ?? []) {
        if (value.value) {
          value.value = scrub(value.value);
        }
      }
      return event;
    },
  });
  initialized = true;
  return true;
}

export function reportMobileBoundaryError(error: unknown, componentStack: string | null | undefined) {
  if (!initialized) {
    return;
  }
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    contexts: { react: { componentStack: componentStack ?? "unavailable" } },
  });
}

export function addMobileSecurityBreadcrumb(event: string) {
  if (!initialized) {
    return;
  }
  Sentry.addBreadcrumb({ category: "security", level: "warning", message: event });
}

export const wrapWithSentry = Sentry.wrap;
```

- [ ] **Adım 6: `index.ts`** — environment.ts'in gerçek erişim noktasından config alıp:

```ts
import { initMobileSentry, wrapWithSentry } from './src/observability/mobile-sentry';
// ... environment config erişimi (gerçek export adını kullan) ...
initMobileSentry({ environment: environmentConfig.environment, sentryDsn: environmentConfig.sentryDsn });
registerRootComponent(wrapWithSentry(App));
```

- [ ] **Adım 7: `mobile-error-boundary.tsx`** — `componentDidCatch`'i üretimde de raporla:

```tsx
componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
  reportMobileBoundaryError(error, errorInfo.componentStack);
  if (process.env.NODE_ENV !== "production") {
    console.error("[mobile] render boundary caught", {
      componentStackLines: errorInfo.componentStack ? errorInfo.componentStack.split("\n").filter(Boolean).length : 0,
      errorKind: error instanceof Error ? error.name : typeof error,
    });
  }
}
```

Import: `import { reportMobileBoundaryError } from "../observability/mobile-sentry";`

- [ ] **Adım 8: `mobile-security-signal-logger.ts`** — `console.warn(...)` yanına `addMobileSecurityBreadcrumb(signal.event);` (yalnız enum event adı; PII yok).
- [ ] **Adım 9: `eas.json` (D4)** — uat/canary/production `env` bloklarına yalnız public DSN:

```json
"EXPO_PUBLIC_WHISPR_SENTRY_DSN": "https://74b46a856eefe32a4df74f7196249590@o4511722135617536.ingest.de.sentry.io/4511727701065808"
```

`SENTRY_AUTH_TOKEN`'ı `eas.json`'a YAZMA — Expo Dashboard env (Sensitive, Preview+Production) kullanılıyor (Görev 0). `eas secret:create` KULLANMA.

- [ ] **Adım 10:** `pnpm --filter @wizards/mobile test && pnpm --filter @wizards/mobile test:components && pnpm --filter @wizards/mobile typecheck`. `test:components` native modül hatası verirse `component-tests/jest.setup.ts`'e mock ekle: `jest.mock("@sentry/react-native", () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn(), init: jest.fn(), wrap: (c) => c }))`.
- [ ] **Adım 11:** `pnpm --filter @wizards/mobile release:check && quality:check` → `eas build --profile uat --platform android`; kurulan build'de `adb shell am crash <androidPackage>` → `whispr-mobile`'da native crash.
- [ ] **Adım 12:** commit `feat(mobile): add Sentry crash reporting with privacy-safe defaults`.

### Görev 9: Desktop Rust panic raporlama (DE bölge)

**Files:** Modify `apps/desktop/src-tauri/Cargo.toml`, `src/lib.rs`, `.github/workflows/ci.yml`, `.github/workflows/desktop-release.yml`

- [ ] **Adım 1:** `Cargo.toml [dependencies]`: `sentry = { version = "0.34", default-features = false, features = ["backtrace", "contexts", "panic", "reqwest", "rustls"] }`. Sonra `cd apps/desktop/src-tauri && cargo tree -p sentry | head -3` ile derlenebilir 0.3x doğrula (rustls → OpenSSL'siz).
- [ ] **Adım 2:** `pub fn run()` gövdesinin İLK satırları (mevcut `desktop_app_name`'den önce):

```rust
let _sentry_guard = option_env!("WHISPR_DESKTOP_SENTRY_DSN")
    .filter(|dsn| !dsn.trim().is_empty())
    .map(|dsn| {
        sentry::init((
            dsn,
            sentry::ClientOptions {
                environment: Some(desktop_release_ring().into()),
                release: sentry::release_name!(),
                send_default_pii: false,
                ..Default::default()
            },
        ))
    });
```

(DSN bölge kodunu içerdiğinden Rust tarafında ek region ayarı gerekmez. `desktop_release_ring()` dönüş tipine göre `.into()` uyarla. `sentry::init` panic integration'ı varsayılan kurar. Redaksiyon: `send_default_pii: false` + UI Data Scrubbing; panic mesajları nadiren PII taşır — runbook'a not düş.)

- [ ] **Adım 3:** `cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings && cargo build` → sıfır uyarı (DSN gömülü değil → guard None → davranış değişmez).
- [ ] **Adım 4:** `.github/workflows/ci.yml` desktop-build job `env:` + `.github/workflows/desktop-release.yml` build job `env:` bloklarına: `WHISPR_DESKTOP_SENTRY_DSN: ${{ vars.WHISPR_DESKTOP_SENTRY_DSN }}`. GitHub → Settings → Variables → `WHISPR_DESKTOP_SENTRY_DSN` = whispr-desktop DSN (DSN sır değil; `vars` yeterli). **`verify` job build adımına Sentry env EKLEME** (D3).
- [ ] **Adım 5:** commit `feat(desktop): report rust panics to sentry behind build-time dsn`.

### Görev 10: CI doğrulama turu

- [ ] `pnpm ci` (audit+lint+typecheck+test:coverage+build) → PASS; coverage eşikleri (23/67/51) korunur (yeni dosyalar testli).
- [ ] `pnpm --filter @wizards/web e2e:smoke` (Postgres+Redis ayakta) → PASS; DSN'siz Sentry no-op, 110 Playwright testi etkilenmez.
- [ ] PR aç; 7 job (verify, e2e-smoke, e2e-cross-browser, e2e-a11y, e2e-visual, desktop-ops, desktop-build) yeşil.

### Görev 11: UAT → Production kademeli açılış (D6)

- [ ] UAT'ta 48 saat: hata hacmi, `/monitoring` trafiği, transaction kotası (Sentry Stats projeksiyonu).
- [ ] Production Railway env'lerine DSN'leri ekle (`SENTRY_TRACES_SAMPLE_RATE=0.1`), deploy et.
- [ ] İlk production hatasında alert kanalının çaldığını doğrula (smoke script'i production DSN ile bir kez).
- [ ] **Geri alma:** Railway'den `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` kaldır + redeploy → SDK'lar no-op; kod geri alma gerekmez.

### Görev 12: Runbook

**Files:** Create `docs/operations/observability.md`

- [ ] Runbook yaz: bileşenler (org `whispr-p0`, EU/DE bölge, 4 proje, uptime, cron), env & kill-switch tablosu, **katmanlı PII redaksiyonu** (redactErrorForReport → beforeSend → UI scrubbing; desktop UI-scrubbing'e dayanır), örnekleme (prod 0.1/0.05, uat 1.0), D2–D7 kararları, alert kuralları, sık işler (DSN rotasyonu, kota, source map/DE bölge sorun giderme: `SENTRY_URL=https://de.sentry.io`). Commit `docs: add observability runbook`.

### Görev 13 (İSTEĞE BAĞLI — Faz 2): Socket.IO OTel

- [ ] `pnpm --filter @wizards/web add @opentelemetry/instrumentation-socket.io`; `instrument.ts`'te `Sentry.init` SONRASI `Sentry.addOpenTelemetryInstrumentation(new SocketIoInstrumentation())`. Sürüm uyumunu doğrula; iki sekmeyle mesajlaşıp `socket.io` span'lerini gör. Commit.

---

## Kabul Kriterleri

1. Dört yüzeyden UAT'ta olay düşüyor (server, browser, mobile crash, desktop panic); message/stack redakte, kullanıcı bağlamı yalnız `userId`.
2. `SENTRY_DSN` boşken tüm test/build/E2E yeşil (kill-switch); CI hiçbir Sentry secret'ı olmadan geçiyor.
3. CSP temiz; `/monitoring` 200; `middleware.ts` CSP direktifleri DEĞİŞMEDİ.
4. `pnpm test:coverage` eşikleri korunuyor.
5. Redaksiyon birim testi: JWT/secret içeren Error Sentry'ye redakte gidiyor.
6. Alert kanalına test bildirimi düştü; uptime + cron "healthy".
7. `docs/operations/observability.md` mevcut; D2–D7 belgeli.
8. Production **henüz açılmadı**; 48h UAT kapısı runbook'ta.
9. V7 raporunda `obs-stack` + `crash-reporting` aksiyonları işaretlenebilir.

## Efor Tahmini

| Görev | Efor |
|---|---|
| 0 (tamam), 0.5, 6, 7, 11 | ~1 gün |
| 1–5 | 2–3 gün |
| 8 (mobil, EAS build dahil) | 1–2 gün |
| 9 (desktop) | ~yarım gün |
| 10, 12 | ~yarım gün |
| **Toplam** | **~1 sprint** |

## Bilinen Riskler

- **Sürüm kayması:** `@sentry/nextjs` v9→v10+ ise `instrumentation-client`/`onRequestError`/`sentryUrl` adlandırmasını doğrula (Görev 2 Adım 1).
- **Custom server:** `--import` Railway start'ında çalışır; `next dev` (tsx watch) yolunda Sentry kapalıdır (bilinçli). Dev testi için `.env`'e UAT DSN + `build && start`.
- **DE bölge / source map:** Upload region hatası verirse `sentryUrl: "https://de.sentry.io"` (Görev 5) + gerekirse `SENTRY_URL` env. Runtime ingestion DSN'den otomatik.
- **Prisma tracing preview:** client generate çıktısını değiştirir; kök `pnpm typecheck` tüm tüketicileri kapsar. Windows EPERM → CI source of truth.
- **Kota:** UAT `tracesSampleRate=1.0` yüksek hacim; 48h gözlemde projeksiyon (Görev 11).
- **Auth token sırrı:** `SENTRY_AUTH_TOKEN` (org token) hiçbir dosyaya/commit'e girmez; yalnız parola yöneticisi + GitHub/Railway/EAS secret. Geliştirme sonrası rotasyon planlı.
