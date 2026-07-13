import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Üretimde init, dist/instrument.js --import girişinde yapılır (bkz.
  // apps/web/instrument.ts). Bu hook, o girişin atlandığı ortamlar
  // (ör. `next dev`, Vercel) için güvence katmanıdır. Next'in kendi build
  // sistemi bu dosyayı işlediğinden (esbuild değil), plain import burada
  // güvenlidir — @sentry/nextjs CJS/ESM interop kısıtlaması yalnız
  // instrument.ts gibi esbuild ile bundle'lanan dosyaları etkiler.
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
