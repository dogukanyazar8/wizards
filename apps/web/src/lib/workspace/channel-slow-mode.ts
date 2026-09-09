import type Redis from "ioredis";

import { resolveEffectiveSlowMode } from "@/lib/servers/server-slow-mode";
import { checkChannelSlowMode, type ChannelSlowModeResult } from "@/lib/socket/rate-limits";
import { hasPermission, PermissionBits } from "@/lib/workspace/permissions";

type CheckChannelSlowMode = typeof checkChannelSlowMode;

/**
 * Ş1 §2 — yavaş modun **tek** kapısı.
 *
 * İki gönderim yolu var (soket `message:send` ve mobil REST `POST
 * /mobile/channels/:id/messages`) ve ikisi de aynı iki değeri okumak zorunda:
 * kanalın kendi gecikmesi ve sunucu geneli gecikme. `Math.max`'ı çağıranın
 * hesaplamasına bırakmak, bir yolun sunucu ayarını unutması demekti — nitekim
 * REST yolu bugüne kadar yavaş modu **hiç** uygulamıyordu.
 *
 * Bu yüzden kapı ham `delaySeconds` almaz: iki süreyi alır, etkin olanı
 * `resolveEffectiveSlowMode` ile kendisi çözer (SPEC-SUNUCU §8.3, "iki süre
 * birlikte tanımlıysa uzun olan uygulanır").
 *
 * `MANAGE_MESSAGES` muafiyeti bugünkü davranıştır ve aynen sürer:
 * `hasPermission` `ADMINISTRATOR`'ı da kapsar.
 */
export async function checkEffectiveChannelSlowMode(args: {
  channelDelaySeconds: number;
  channelId: string;
  check?: CheckChannelSlowMode;
  permissions: bigint;
  redis: Redis;
  serverDelaySeconds: number;
  userId: string;
}): Promise<ChannelSlowModeResult> {
  if (hasPermission(args.permissions, PermissionBits.MANAGE_MESSAGES)) {
    return { status: "allowed" };
  }

  const delaySeconds = resolveEffectiveSlowMode(args.serverDelaySeconds, args.channelDelaySeconds);

  return (args.check ?? checkChannelSlowMode)({
    channelId: args.channelId,
    delaySeconds,
    redis: args.redis,
    userId: args.userId,
  });
}
