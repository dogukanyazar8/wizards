import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

/**
 * Zaman aşımı kapısı (K3, Ş2 §4).
 *
 * Kolonun kendisi bir zaman damgası, bir bayrak değil: süre dolduğunda satırı temizleyen bir
 * cron **yok**. Okuyan taraf her seferinde `until > now()` karşılaştırır, böylece zaman aşımı
 * kendiliğinden biter ve iki gerçek (kolon dolu ama süre geçmiş) hiç oluşmaz.
 *
 * Bu dosya bilerek küçük: mesaj gönderme yolunun sıcak kısmından çağrılıyor ve moderasyon
 * servisinin bağımlılıklarını o yola taşımaması gerekiyor.
 */

/** Yeni hata kodu üretilmez: mevcut yetki hatası ailesinden yanıt döner (Ş2 §4). */
export const MEMBER_TIMEOUT_FORBIDDEN_CODE = "FORBIDDEN";
export const MEMBER_TIMEOUT_FORBIDDEN_MESSAGE =
  "You are timed out in this server and cannot send messages.";

export function isMemberTimedOut(
  communicationDisabledUntil: Date | string | null | undefined,
  now: Date = new Date(),
) {
  if (!communicationDisabledUntil) {
    return false;
  }

  const until =
    communicationDisabledUntil instanceof Date
      ? communicationDisabledUntil
      : new Date(communicationDisabledUntil);

  return Number.isFinite(until.getTime()) && until.getTime() > now.getTime();
}

export type MemberTimeoutReader = {
  serverMember: {
    findUnique(args: {
      select: { communicationDisabledUntil: true };
      where: { userId_serverId: { serverId: string; userId: string } };
    }): Promise<{ communicationDisabledUntil: Date | null } | null>;
  };
};

/**
 * Üyelik yokluğu burada hata değildir: bu kapı yalnız "susturulmuş mu" sorusunu yanıtlar.
 * Üyelik ve kanal yetkisi zaten çağıranın önceki adımında doğrulanmış olur.
 */
export async function assertMemberNotTimedOut(
  serverId: string,
  userId: string,
  client: MemberTimeoutReader = prisma,
) {
  const member = await client.serverMember.findUnique({
    select: { communicationDisabledUntil: true },
    where: { userId_serverId: { serverId, userId } },
  });

  if (isMemberTimedOut(member?.communicationDisabledUntil)) {
    throw new ApiError(MEMBER_TIMEOUT_FORBIDDEN_MESSAGE, 403, MEMBER_TIMEOUT_FORBIDDEN_CODE);
  }
}
