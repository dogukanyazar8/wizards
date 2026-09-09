import { UserProfilePanelDTOSchema } from "@wizards/types";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId, requireMobileApiUserId } from "@/lib/auth/api";
import { getDmProfilePanel } from "@/lib/dm/profile-service";
import { DMConversationParamsSchema } from "@/lib/dm/types";

/**
 * `GET /api/v1/dm/[conversationId]/profile` — SPEC §15'in DM kolu.
 *
 * Mobil karşılığı (`/api/v1/mobile/...`) **aynı** gövdeyi çağırır (K1); yalnız
 * kimlik doğrulama ve hız sınırı kovası bağımlılık olarak değişir, çünkü mobil
 * istemci oturum çerezi değil taşıyıcı jeton gönderiyor.
 *
 * Hız sınırı kovası: `api-rate-limit.ts` bu şeridin yazma listesinde değil ve üç
 * kardeş şerit aynı anda koşuyor — yeni bir anahtar eklemek paralel koşuda
 * birbirinin üzerine yazardı. Panel bir konuşma okumasıdır, o yüzden konuşma
 * okumasının kovası paylaşılır (120/dk). Sapma rapora yazıldı.
 */
export type DmProfileRouteContext = { params: Promise<{ conversationId: string }> };

export type DmProfileRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getProfile: typeof getDmProfilePanel;
  rateLimitAction: ApiRateLimitAction;
};

export const webDmProfileRouteDependencies: DmProfileRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  getProfile: getDmProfilePanel,
  rateLimitAction: "dm:conversation:read",
};

export const mobileDmProfileRouteDependencies: DmProfileRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getProfile: getDmProfilePanel,
  rateLimitAction: "mobile:dm:details",
};

export async function dmProfileRoute(
  request: Request,
  context: DmProfileRouteContext,
  dependencies: DmProfileRouteDependencies = webDmProfileRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, dependencies.rateLimitAction);
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);

    // Şema burada da koşuyor: servis ile sözleşme ayrışırsa hatayı testin
    // hatırlamasına değil, çalışma zamanının yakalamasına bırakıyoruz. `.strict()`
    // olduğu için fazladan bir alan (ham `User` satırı, e-posta) sessizce
    // yayınlanamaz.
    return Response.json(
      UserProfilePanelDTOSchema.parse(await dependencies.getProfile(userId, conversationId)),
    );
  } catch (error) {
    return jsonError(error);
  }
}
