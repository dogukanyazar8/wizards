import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { markAllReadWithCounts } from "@/lib/notifications/service";

export async function PATCH() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "notification:mark-read");
    // Ş2 §6: yanıt sayacı da taşır (hepsi okunduğunda sıfırlar). Alan **eklendi**, hiçbir alan
    // kaldırılmadı — bugünkü istemci boş nesneyi okumaya devam ediyor.
    const counts = await markAllReadWithCounts(userId);

    return Response.json({ counts });
  } catch (error) {
    return jsonError(error);
  }
}
