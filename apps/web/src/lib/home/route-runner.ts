import { jsonError } from "@/lib/api";
import { type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { createServerTimingForRequest } from "@/lib/server-timing";

/**
 * Ana Sayfa 1a — Faz 3 §3. The skeleton every home endpoint runs:
 * `requireApiUserId` → `enforceApiRateLimit` → zod → service → `jsonError`.
 *
 * Nine endpoints share it rather than nine copies of the same try/catch, and
 * the order is the point: identity before the budget, budget before any query.
 * Every payload here is per-viewer, so none of it may be cached anywhere.
 *
 * Etkinlikler Ş10 — çağıran `request`i geçerse yanıt ayrıca `Server-Timing` taşır
 * (`auth`, `db`, `total`). İki kolon (ızgara ve 300'lük ajanda rayı) **ayrı** istekler
 * açıyor; sunucu işini taşımadan bir gecikmenin hangisinden geldiği ölçülemez. Parametre
 * opsiyonel: onu geçmeyen sekiz Ana Sayfa ucunun yanıtı bit bit aynı kalır.
 */

export type HomeRouteContext = {
  authenticate: () => Promise<string>;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
};

export async function runHomeRoute<TPayload>(
  action: ApiRateLimitAction,
  context: HomeRouteContext,
  handler: (userId: string) => Promise<TPayload>,
  request?: Request,
): Promise<Response> {
  const timing = request ? createServerTimingForRequest(request) : null;

  try {
    // `start`/`stop`, `measure` değil: rota sözleşme testi
    // (`route-contract.test.ts`) kimlik çağrısını **statik** olarak izliyor ve bir geri
    // çağrının içini göremiyor.
    const stopAuth = timing?.start("auth");
    const userId = await context.authenticate();
    await context.enforceRateLimit(userId, action);
    stopAuth?.();

    const payload = timing
      ? await timing.measure("db", () => handler(userId))
      : await handler(userId);

    return Response.json(payload, {
      headers: timing
        ? timing.headers({ "Cache-Control": "private, no-store" })
        : { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export function readSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** `undefined` rather than `null` so zod's `.optional()` and `.default()` fire. */
export function optionalParam(params: URLSearchParams, key: string): string | undefined {
  return params.get(key) ?? undefined;
}
