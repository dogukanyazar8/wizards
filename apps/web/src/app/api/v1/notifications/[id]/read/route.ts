import { notificationReadRoute } from "./route-logic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Ayarlar Ş2 §4 — uç `{ read: boolean }` gövdesi alır ve durumu **çevirir**.
 *
 * Ş13: eski gövdesiz `PATCH` takma adı silindi. Onu çağıran tek yer `markNotificationRead`
 * idi ve o da panel bağlandığında tüketicisiz kaldı; iki metot aynı mantığa gidiyor ve
 * "gövdesiz mutasyon" izin listesi bu yüzden yeniden büyümek zorunda kalıyordu.
 */
export async function POST(request: Request, context: RouteContext) {
  return notificationReadRoute(request, await context.params);
}
