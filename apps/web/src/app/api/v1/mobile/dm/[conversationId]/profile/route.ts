import {
  dmProfileRoute,
  mobileDmProfileRouteDependencies,
  type DmProfileRouteContext,
} from "../../../../dm/[conversationId]/profile/route-logic";

/**
 * K1 — mobil paritesi. Web ucunun **aynı** gövdesi, aynı `UserProfilePanelDTO`
 * şeması; yalnız kimlik doğrulama taşıyıcı jetona, hız sınırı da mobil kovasına
 * bağlanır. Ekran dosyası bu pakette değişmiyor; uç mobil için hazır duruyor.
 *
 * Yol göreli, `@/` takma adıyla değil: `route-contract.test.ts` bir rotanın
 * yetki kapısını `route-logic` modülünü **rota klasörüne göre** çözerek arıyor.
 * Takma adlı bir içe aktarma o çözümden düşer ve uç sessizce "kimliksiz rota"
 * listesine kayar.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: DmProfileRouteContext) {
  return dmProfileRoute(request, context, mobileDmProfileRouteDependencies);
}
