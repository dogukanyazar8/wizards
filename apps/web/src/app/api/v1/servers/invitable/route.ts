import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { listInvitableServers } from "@/lib/workspace/invitable-servers-service";

/**
 * `GET /v1/servers/invitable` — SPEC-MESAJLAR §4.
 *
 * Ayrı bir uç, `GET /v1/servers` üzerine bir sorgu parametresi değil: cevap
 * şekli farklı (üç alan), yetki kararı sunucuda veriliyor ve aynı hız sınırı
 * kovasını paylaşmıyor. Bir bayrakla dallanan uç, iki farklı cevabı tek bir
 * sözleşmenin arkasına saklardı.
 */
export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:list");
    const servers = await listInvitableServers(userId);

    return Response.json({ servers });
  } catch (error) {
    return jsonError(error);
  }
}
