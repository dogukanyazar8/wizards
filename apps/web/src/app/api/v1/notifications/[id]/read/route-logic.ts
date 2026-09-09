import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { setRead } from "@/lib/notifications/service";
import { NotificationIdParamsSchema, NotificationReadBodySchema } from "@/lib/notifications/types";

/**
 * `POST|PATCH /api/v1/notifications/[id]/read` — satırın okundu durumunu **çevirir** (Ş2 §4).
 *
 * SPEC §1 ve §6: satıra tıklamak durumu çevirir, tek yönlü işaretlemez. Yön gövdede taşınır:
 *
 * ```ts
 * { read: boolean }
 * ```
 *
 * **Gövdesiz çağrı `{ read: true }` gibi davranır.** `parseJsonBody` boş gövdeyi `{}` olarak
 * veriyor ve şemanın `.default(true)`u orada devreye giriyor; bugünkü istemcinin gövdesiz
 * `PATCH`i bu yüzden kırılmadan çalışmaya devam eder.
 *
 * İki metot da aynı gövdeyi okur: `POST` sözleşmenin adı (03 §4), `PATCH` bugünkü istemcinin
 * kullandığı metot. Ş11 paneli `POST`a geçirir, Ş13 `PATCH` çağrısı kalmadığını doğrular.
 *
 * Yanıt güncel dörtlü sayacı taşır ki istemci ikinci bir istek atmasın.
 */
export type NotificationReadRouteDependencies = {
  authenticate: () => Promise<string>;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
  setRead: (userId: string, notificationId: string, read: boolean) => ReturnType<typeof setRead>;
};

export const defaultNotificationReadDependencies: NotificationReadRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  setRead: (userId, notificationId, read) => setRead(userId, notificationId, read),
};

export async function notificationReadRoute(
  request: Request,
  params: { id: string },
  dependencies: NotificationReadRouteDependencies = defaultNotificationReadDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "notification:mark-read");
    const validatedParams = NotificationIdParamsSchema.parse(params);
    const body = await parseJsonBody(request, NotificationReadBodySchema);

    const counts = await dependencies.setRead(userId, validatedParams.id, body.read);

    return Response.json({ counts, read: body.read });
  } catch (error) {
    return jsonError(error);
  }
}
