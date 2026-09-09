import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { setMobilePreferredReleaseChannel } from "@/lib/app/release-channel-service";
import { requireApiUserId } from "@/lib/auth/api";
import {
  DESKTOP_RELEASE_CHANNELS,
  toReleaseChannelColumnValue,
  type DesktopReleaseChannel,
} from "@/lib/desktop/release-channel";

/**
 * `h2` — Masaüstü › Güncelleme › Release kanalı (Ş10 §A.5).
 *
 * Mobil kardeşi (`/api/v1/mobile/app/channel`) aynı kolonu yazıyor ama mobil kimliğiyle
 * (`requireMobileApiUserId`) korunuyor; web oturumu o uçtan geçemez. İkisi de **aynı servisi**
 * çağırır, o yüzden hangi yüzeyden yazıldığı kolonun değerini değiştirmez.
 *
 * Yanıt `effectiveFrom: "next-build"`: çalışan sürümün kanalı derleme anında sabitlenmiştir.
 * Seçim yalnız hangi akışın **önerileceğini** belirler ve ekran kullanıcıya bunu söyler.
 */

const ReleaseChannelRequestSchema = z.object({
  channel: z.enum(DESKTOP_RELEASE_CHANNELS),
});

export type ReleaseChannelResponse = {
  channel: DesktopReleaseChannel;
  effectiveFrom: "next-build";
};

export type ReleaseChannelRouteDependencies = {
  authenticate: () => Promise<string>;
  enforceRateLimit: (userId: string, action: "settings:update") => Promise<void>;
  setChannel: typeof setMobilePreferredReleaseChannel;
};

export const defaultReleaseChannelDependencies: ReleaseChannelRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  setChannel: setMobilePreferredReleaseChannel,
};

export async function releaseChannelPatchRoute(
  request: Request,
  dependencies: ReleaseChannelRouteDependencies = defaultReleaseChannelDependencies,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "settings:update");

    const body = await parseJsonBody(request, ReleaseChannelRequestSchema);

    await dependencies.setChannel(userId, toReleaseChannelColumnValue(body.channel));

    return Response.json(
      { channel: body.channel, effectiveFrom: "next-build" } satisfies ReleaseChannelResponse,
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
