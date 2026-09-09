import { jsonError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { optionalParam, readSearchParams } from "@/lib/home/route-runner";
import { listNotificationPanel } from "@/lib/notifications/service";
import { NotificationPageSchema, NotificationPanelQuerySchema } from "@/lib/notifications/types";
import { createServerTiming } from "@/lib/server-timing";

/**
 * `GET /api/v1/notifications` — 400 px bildirim panelinin okuma ucu (Dalga 1 / Ş2).
 *
 * Ş13: uç **tek sözleşme** taşıyor. Ş2 bir sürüm boyunca `?tab` taşımayan eski dizi dalını
 * (`NotificationDTO[]`) da sürdürüyordu; onu okuyan tek yer `notification-bell.tsx`'in eski
 * gövdesiydi ve Ş11 paneli bağladığında öldü. `tab` artık **zorunlu**: eksikse `all` sayılır
 * ve yanıt her koşulda `NotificationPageDTO`.
 *
 * Sekme süzgeci, gün grubu ve dörtlü sayaç **sunucuda** hesaplanır. Sayfalı bir listede
 * istemci süzgeci yalan söyler: "Bahsedilmeler" o zaman "elimdeki sayfadaki bahsedilmeler"
 * demeye başlar.
 */
export type NotificationsRouteDependencies = {
  authenticate: () => Promise<string>;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
  listNotificationPanel: typeof listNotificationPanel;
};

export const defaultNotificationsDependencies: NotificationsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listNotificationPanel,
};

export async function notificationsRoute(
  request: Request,
  dependencies: NotificationsRouteDependencies = defaultNotificationsDependencies,
) {
  const timing = createServerTiming();

  try {
    // `start`/`stop`, `measure` değil: rota sözleşme testi kimlik çağrısını **statik** izliyor
    // ve bir geri çağrının içini göremiyor.
    const stopAuthTiming = timing.start("auth");
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "notification:list");
    stopAuthTiming();

    const params = readSearchParams(request);
    const query = NotificationPanelQuerySchema.parse({
      cursor: optionalParam(params, "cursor"),
      limit: optionalParam(params, "limit"),
      tab: optionalParam(params, "tab") ?? "all",
    });
    const page = await timing.measure("db", () =>
      dependencies.listNotificationPanel(userId, query),
    );

    return Response.json(NotificationPageSchema.parse(page), {
      // Panel her izleyiciye özel ve sayaç taşıyor; bir ara katmanın onu paylaşması,
      // başkasının bildirimlerini göstermek demekti.
      headers: timing.headers({ "Cache-Control": "private, no-store" }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
